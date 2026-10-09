/* skill-hub Web 只读视图 — 前端 SPA（无构建依赖，hash 路由） */
(() => {
  "use strict";

  const app = document.getElementById("app");
  const statsbar = document.getElementById("statsbar");
  const searchInput = document.getElementById("global-search");

  const PAGE_SIZE = 24;
  const state = {
    query: "",
    offset: 0,
    tag: null,
    tagSummary: null,
  };

  /* ── 工具 ─────────────────────────── */
  const escapeHtml = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  async function api(path) {
    const res = await fetch(path);
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* 非 JSON */
    }
    if (!res.ok) {
      const err = new Error((data && data.message) || `HTTP ${res.status}`);
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fmtSize = (n) => {
    if (n === undefined || n === null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  };

  const md = () =>
    window.markdownit ? window.markdownit({ html: false, linkify: true, breaks: false }) : null;

  function renderMarkdown(text) {
    const engine = md();
    if (engine) return engine.render(text);
    return `<pre>${escapeHtml(text)}</pre>`;
  }

  function stripFrontmatter(text) {
    if (!text.startsWith("---")) return text;
    const end = text.indexOf("\n---", 3);
    if (end < 0) return text;
    return text.slice(end + 4).replace(/^\s+/, "");
  }

  const scopeBadge = (prov) => {
    const scope = prov && prov.scope;
    if (!scope) return "";
    return `<span class="badge scope-${escapeHtml(scope)}">${escapeHtml(scope)}</span>`;
  };

  const errorBox = (err) => `
    <div class="error-box">
      <div><b>加载失败</b>${err.code ? ` <code>${escapeHtml(err.code)}</code>` : ""}</div>
      <div>${escapeHtml(err.message)}</div>
    </div>`;

  const loading = () => `<div class="loading">加载中…</div>`;

  /* ── 统计条 ────────────────────────── */
  const LLM_STATE_LABEL = {
    disabled: ["未配置（可选增强）", "dim"],
    ready: ["已配置", "ok"],
    unreachable: ["服务不可达", "warn"],
    misconfigured: ["配置有误", "warn"],
  };

  async function loadStats() {
    try {
      const s = await api("/api/stats");
      let llmChip = "";
      try {
        const llm = await api("/api/llm/status");
        const [label, tone] = LLM_STATE_LABEL[llm.state] || [llm.state, "dim"];
        const detail = llm.provider
          ? `${llm.provider.type} · ${llm.provider.id}${llm.provider.model ? " · " + llm.provider.model : ""}`
          : "models.yaml";
        const tip = llm.error
          ? `${llm.error.message}${llm.error.hint ? "\n" + llm.error.hint : ""}`
          : detail;
        llmChip = `<span class="llm-chip ${tone}" title="${escapeHtml(tip)}">模型 <b>${escapeHtml(label)}</b><span class="llm-detail">${escapeHtml(detail)}</span></span>`;
      } catch {
        /* llm 状态不可得不影响统计条 */
      }
      statsbar.hidden = false;
      statsbar.innerHTML = `
        <span><b>${s.skillCount}</b> 个技能</span>
        <span>引擎 <b>${escapeHtml(s.engineDefault)}</b> · Top-K <b>${s.topKDefault}</b></span>
        <span>catalog 更新于 <b>${fmtTime(s.catalogUpdatedAt || s.catalogMtime)}</b></span>
        <span title="${escapeHtml(s.skillsDir)}">真源 <b>${escapeHtml(s.skillsDir.replace(/^\/Users\/[^/]+/, "~"))}</b></span>
        ${llmChip}`;
    } catch {
      statsbar.hidden = true;
    }
  }

  /* ── 视图：技能列表 / 搜索 ─────────── */
  const tagBadges = (tags) =>
    (tags || []).map((t) => `<span class="badge tag">${escapeHtml(t.label)}</span>`).join("");

  const cardHtml = (s) => `
          <a class="card" href="#/skill/${encodeURIComponent(s.name)}">
            <div class="card-name">${escapeHtml(s.name)}</div>
            <div class="card-desc">${escapeHtml(s.description || "（无描述）")}</div>
            <div class="card-meta">
              ${tagBadges(s.tags)}
              ${scopeBadge(s.provenance)}
              ${s.score !== undefined ? `<span class="badge score">${Number(s.score).toFixed(2)}</span>` : ""}
            </div>
          </a>`;

  function renderTagSidebar(summary) {
    const items = [{ id: "", label: "全部技能", count: summary.total }, ...summary.tags];
    return `
      <div class="tag-side-title">分类标签</div>
      ${items
        .map(
          (t) => `
        <div class="tag-item ${(!state.tag && !t.id) || state.tag === t.id ? "active" : ""}" data-tag="${escapeHtml(t.id)}">
          <span class="tag-label">${escapeHtml(t.label)}</span>
          <span class="tag-count">${t.count}</span>
        </div>`,
        )
        .join("")}
      <div class="tag-side-hint">规则自动派生 · 可在 ~/.skill-hub/taxonomy.yaml 自定义</div>`;
  }

  async function viewList() {
    setNav("skills");
    searchInput.value = state.query;
    app.innerHTML = loading();
    try {
      if (!state.tagSummary) state.tagSummary = await api("/api/tags");
      const summary = state.tagSummary;
      const tagQ = state.tag ? `&tag=${encodeURIComponent(state.tag)}` : "";
      let contentHtml = "";
      let bindContent = () => {};

      if (state.query.trim()) {
        const data = await api(`/api/search?q=${encodeURIComponent(state.query)}&top_k=50${tagQ}`);
        contentHtml = `
          <h2 class="section-title"><b>检索</b> “${escapeHtml(state.query)}” ·
            命中 ${data.results.length} / 候选 ${data.candidate_count} · 引擎 ${escapeHtml(data.engine)}
            ${state.tag ? '<button class="btn small" id="clear-tag">清除标签筛选</button>' : ""}
            ${data.index_rebuild_recommended ? '<span class="badge" style="color:var(--amber)">索引建议重建</span>' : ""}
            ${data.decision ? `<span class="badge" title="Jev 概率仅作升级建议，不代表执行授权">决策 ${escapeHtml(data.decision.selected || "none")} · 置信度 ${(Number(data.decision.confidence) * 100).toFixed(1)}%${data.decision.escalation_recommended ? " · 建议升级" : ""}</span>` : ""}
          </h2>
          ${
            data.results.length
              ? `<div class="grid">${data.results.map(cardHtml).join("")}</div>`
              : `<div class="empty">没有匹配的技能，换个关键词或清除标签筛选。</div>`
          }`;
        bindContent = bindClearTag;
      } else {
        const data = await api(`/api/skills?offset=${state.offset}&limit=${PAGE_SIZE}${tagQ}`);
        const page = Math.floor(state.offset / PAGE_SIZE) + 1;
        const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
        const active = state.tag ? summary.tags.find((t) => t.id === state.tag) : null;
        contentHtml = `
          <h2 class="section-title"><b>${active ? escapeHtml(active.label) : "全部技能"}</b>
            共 ${data.total} 个 · 第 ${page} / ${pages} 页
            ${active ? '<button class="btn small" id="clear-tag">清除筛选</button>' : ""}
          </h2>
          ${
            data.skills.length
              ? `<div class="grid">${data.skills.map(cardHtml).join("")}</div>`
              : `<div class="empty">该分类下暂无技能。</div>`
          }
          <div class="pager">
            <button class="btn" id="pg-prev" ${state.offset === 0 ? "disabled" : ""}>上一页</button>
            <span>${data.total ? state.offset + 1 : 0}–${state.offset + data.skills.length} / ${data.total}</span>
            <button class="btn" id="pg-next" ${data.nextOffset === null ? "disabled" : ""}>下一页</button>
          </div>`;
        bindContent = () => {
          document.getElementById("pg-prev").onclick = () => {
            state.offset = Math.max(0, state.offset - PAGE_SIZE);
            viewList();
          };
          document.getElementById("pg-next").onclick = () => {
            if (data.nextOffset !== null) {
              state.offset = data.nextOffset;
              viewList();
            }
          };
          bindClearTag();
        };
      }

      app.innerHTML = `
        <div class="list-layout">
          <aside class="tag-side">${renderTagSidebar(summary)}</aside>
          <div class="list-main">${contentHtml}</div>
        </div>`;
      app.querySelectorAll(".tag-item").forEach((el) => {
        el.onclick = () => {
          state.tag = el.dataset.tag || null;
          state.offset = 0;
          viewList();
        };
      });
      bindContent();
    } catch (err) {
      app.innerHTML = errorBox(err);
    }
  }

  function bindClearTag() {
    const btn = document.getElementById("clear-tag");
    if (btn) {
      btn.onclick = () => {
        state.tag = null;
        state.offset = 0;
        viewList();
      };
    }
  }

  /* ── 视图：技能详情 ────────────────── */
  const STATUS_CHIP = {
    ok: ["ok", "正常"],
    missing: ["missing", "缺失"],
    wrong_target: ["warn", "指向错误"],
    broken_symlink: ["bad", "死链"],
    content_mismatch: ["warn", "内容漂移"],
    real_path: ["warn", "实体路径"],
  };

  async function viewDetail(name) {
    setNav("skills");
    app.innerHTML = loading();
    try {
      const [doc, explain] = await Promise.all([
        api(`/api/skills/${encodeURIComponent(name)}`),
        api(`/api/skills/${encodeURIComponent(name)}/explain`),
      ]);

      const agents = (explain.paths?.agents || [])
        .map((a) => {
          const [cls, label] = STATUS_CHIP[a.status] || ["missing", a.status];
          return `<div class="agent-row">
            <span class="aid">${escapeHtml(a.agentId)}</span>
            <span class="chip ${cls}" title="${escapeHtml(a.detail || a.target)}">
              <span class="dot"></span>${label}${a.enabled ? "" : "（停用）"}
            </span>
          </div>`;
        })
        .join("");

      const variants = explain.variants?.length || 0;
      const metaRows = [
        ["路径", `<dd class="mono">${escapeHtml(doc.path)}</dd>`, "路径"],
        ["标签", null, "tags"],
        ["scope", null, "scope"],
        ["来源", null, "source"],
        ["revision", null, "revision"],
        ["状态", null, "status"],
        ["hash", null, "hash"],
        ["变体", null, "variants"],
        ["胜出原因", null, "winner"],
      ]
        .map(([label, raw, key]) => {
          let value;
          if (key === "tags") value = tagBadges(doc.tags) || "—";
          else if (key === "scope") value = scopeBadge({ scope: explain.scope }) || "—";
          else if (key === "source") value = escapeHtml(explain.source || "—");
          else if (key === "revision") value = escapeHtml(explain.revision || "—");
          else if (key === "status") value = escapeHtml(explain.status || "—");
          else if (key === "hash")
            value = `<span class="mono">${escapeHtml((doc.hash || "").slice(0, 12))}…</span>`;
          else if (key === "variants") value = `${variants} 个`;
          else if (key === "winner") value = escapeHtml(explain.winnerReason || "—");
          else value = raw;
          return `<dt>${label}</dt><dd${key === "hash" ? ' class="mono"' : ""}>${value}</dd>`;
        })
        .join("");

      app.innerHTML = `
        <a class="backlink" href="#/">← 返回技能库</a>
        <div class="detail-head">
          <h1>${escapeHtml(doc.name)}</h1>
          <p>${escapeHtml(doc.description || "")}</p>
        </div>
        <div class="detail-layout">
          <div class="doc" id="doc-body">
            ${renderMarkdown(stripFrontmatter(doc.body))}
            ${
              doc.truncated
                ? `<div class="doc-pager">
                    <span>已显示 ${doc.body.length} / ${doc.totalChars} 字符</span>
                    <button class="btn small" id="doc-more">继续读取</button>
                  </div>`
                : ""
            }
          </div>
          <aside class="side">
            <div class="panel">
              <h3>元信息</h3>
              <dl class="kv">${metaRows}</dl>
            </div>
            <div class="panel">
              <h3>Agent 投影状态</h3>
              ${agents || '<div class="empty" style="padding:12px">无配置</div>'}
            </div>
            <div class="panel">
              <h3>静态安全审计</h3>
              <button class="btn small" id="run-audit">运行静态审计</button>
              <div id="audit-result">尚未扫描。审计只读，不执行脚本。</div>
            </div>
            <div class="panel">
              <div class="tabs">
                <button data-tab="files" class="active">文件</button>
                <button data-tab="history">历史</button>
              </div>
              <div id="tab-body"></div>
            </div>
          </aside>
        </div>`;

      const auditButton = document.getElementById("run-audit");
      auditButton.onclick = async () => {
        auditButton.disabled = true;
        const target = document.getElementById("audit-result");
        target.innerHTML = loading();
        try {
          const audit = await api(`/api/skills/${encodeURIComponent(name)}/audit`);
          const result = audit.skills[0];
          target.innerHTML = `<div class="audit-summary ${result.passed ? "ok" : "warn"}">${!result.complete ? "扫描不完整，需要复核" : result.passed ? "未发现高风险项" : "发现需要复核的高风险项"}</div>
            <div>critical ${audit.summary.critical} · high ${audit.summary.high} · warning ${audit.summary.warning} · ${audit.summary.filesScanned} 个文本文件</div>
            <div class="audit-findings">${result.findings.map((f) => `<div><b>${escapeHtml(f.severity)}</b> ${escapeHtml(f.file)}:${f.line} · ${escapeHtml(f.message)}</div>`).join("")}</div>`;
        } catch (err) {
          target.innerHTML = errorBox(err);
        } finally {
          auditButton.disabled = false;
        }
      };

      const moreBtn = document.getElementById("doc-more");
      if (moreBtn) {
        moreBtn.onclick = async () => {
          moreBtn.disabled = true;
          try {
            const next = await api(
              `/api/skills/${encodeURIComponent(name)}?offset=${doc.nextOffset}`,
            );
            const pager = document.querySelector(".doc-pager");
            const div = document.createElement("div");
            div.innerHTML = renderMarkdown(stripFrontmatter(next.body));
            document.getElementById("doc-body").insertBefore(div, pager);
            if (next.truncated) {
              pager.querySelector("span").textContent =
                `已显示 ${doc.offset + doc.body.length + next.body.length} / ${next.totalChars} 字符`;
              moreBtn.disabled = false;
              moreBtn.onclick = null;
              // 递归续读
              let cursor = next;
              moreBtn.onclick = async () => {
                moreBtn.disabled = true;
                const n2 = await api(
                  `/api/skills/${encodeURIComponent(name)}?offset=${cursor.nextOffset}`,
                );
                const d2 = document.createElement("div");
                d2.innerHTML = renderMarkdown(stripFrontmatter(n2.body));
                document.getElementById("doc-body").insertBefore(d2, pager);
                cursor = n2;
                if (!n2.truncated) pager.remove();
                else moreBtn.disabled = false;
              };
            } else {
              pager.remove();
            }
          } catch (e) {
            moreBtn.disabled = false;
            alert(e.message);
          }
        };
      }

      const tabBody = document.getElementById("tab-body");
      const tabButtons = document.querySelectorAll(".tabs button");
      const activate = (tab) => {
        tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
        if (tab === "files") renderFiles(tabBody, name, "");
        else renderHistory(tabBody, name);
      };
      tabButtons.forEach((b) => (b.onclick = () => activate(b.dataset.tab)));
      activate("files");
    } catch (err) {
      app.innerHTML = `<a class="backlink" href="#/">← 返回技能库</a>` + errorBox(err);
    }
  }

  /* ── 文件树 ────────────────────────── */
  async function renderFiles(container, name, dirPath) {
    container.innerHTML = loading();
    try {
      const data = await api(
        `/api/skills/${encodeURIComponent(name)}/files?path=${encodeURIComponent(dirPath)}&limit=100`,
      );
      const parts = dirPath ? dirPath.split("/") : [];
      const crumbs = [
        `<a data-dir="">.${escapeHtml(name ? "" : "")}</a>`,
        ...parts.map(
          (p, i) =>
            `<a data-dir="${escapeHtml(parts.slice(0, i + 1).join("/"))}">${escapeHtml(p)}</a>`,
        ),
      ].join(" / ");

      const rows = data.files
        .map((f) => {
          const icon = f.type === "directory" ? "▸" : f.type === "blocked" ? "✕" : "·";
          const full = f.path;
          return `<div class="file-row" data-type="${f.type}" data-path="${escapeHtml(full)}">
            <span class="file-icon">${icon}</span>
            <span class="fname">${escapeHtml(f.path)}</span>
            <span class="fsize">${f.type === "blocked" ? escapeHtml(f.reason || "blocked") : fmtSize(f.size)}</span>
          </div>`;
        })
        .join("");

      container.innerHTML = `
        <div class="crumbs">${crumbs}</div>
        ${rows || '<div class="empty" style="padding:12px">空目录</div>'}
        <div id="file-viewer-slot"></div>`;

      container.querySelectorAll(".crumbs a").forEach((a) => {
        a.onclick = () => renderFiles(container, name, a.dataset.dir);
      });
      container.querySelectorAll(".file-row").forEach((row) => {
        row.onclick = async () => {
          const type = row.dataset.type;
          const p = row.dataset.path;
          if (type === "directory") {
            renderFiles(container, name, p);
            return;
          }
          if (type === "blocked") return;
          const slot = document.getElementById("file-viewer-slot");
          slot.innerHTML = `<div class="file-viewer"><pre>读取中…</pre></div>`;
          try {
            const file = await api(
              `/api/skills/${encodeURIComponent(name)}/read?file=${encodeURIComponent(p)}&max_chars=50000`,
            );
            slot.innerHTML = `<div class="crumbs" style="margin-top:10px">${escapeHtml(p)}
                <span style="color:var(--text-3)">（${file.totalChars} 字符${file.truncated ? "，已截断" : ""}）</span></div>
              <div class="file-viewer"><pre>${escapeHtml(file.body)}</pre></div>`;
          } catch (e) {
            slot.innerHTML = errorBox(e);
          }
        };
      });
    } catch (err) {
      container.innerHTML = errorBox(err);
    }
  }

  /* ── 历史 ──────────────────────────── */
  async function renderHistory(container, name) {
    container.innerHTML = loading();
    try {
      const data = await api(`/api/skills/${encodeURIComponent(name)}/history?limit=50`);
      if (!data.entries.length) {
        container.innerHTML = `<div class="empty" style="padding:12px">暂无历史事件</div>`;
        return;
      }
      container.innerHTML = `<ul class="timeline">${data.entries
        .map(
          (e) => `<li>
            <div class="t-time">${fmtTime(e.at)}</div>
            <div class="t-action">${escapeHtml(e.type)}${e.action ? ` · ${escapeHtml(e.action)}` : ""}</div>
            ${e.source ? `<div style="color:var(--text-3)">${escapeHtml(e.source)}</div>` : ""}
          </li>`,
        )
        .join("")}</ul>`;
    } catch (err) {
      container.innerHTML = errorBox(err);
    }
  }

  /* ── 视图：多端盘点 ────────────────── */
  async function viewInventory() {
    setNav("inventory");
    app.innerHTML = loading();
    try {
      const data = await api("/api/inventory");
      const agentRows = data.agents
        .map(
          (a) => `<tr>
            <td class="mono">${escapeHtml(a.id)}</td>
            <td class="mono">${escapeHtml(a.path)}</td>
            <td>${a.exists ? '<span class="chip ok"><span class="dot"></span>存在</span>' : '<span class="chip missing"><span class="dot"></span>缺失</span>'}</td>
            <td>${a.count}</td>
          </tr>`,
        )
        .join("");
      const sourceRows = data.sources
        .map(
          (s) => `<tr>
            <td class="mono">${escapeHtml(s.id)}</td>
            <td>${scopeBadge({ scope: s.scope })}</td>
            <td class="mono">${escapeHtml(s.path)}</td>
            <td>${s.exists ? '<span class="chip ok"><span class="dot"></span>存在</span>' : '<span class="chip missing"><span class="dot"></span>缺失</span>'}</td>
            <td>${s.count}</td>
          </tr>`,
        )
        .join("");
      app.innerHTML = `
        <h2 class="section-title"><b>Agent 目录</b> 各端 skills_dir 盘点 · 并集约 ${data.unionApprox} 个</h2>
        <table class="table">
          <thead><tr><th>Agent</th><th>路径</th><th>状态</th><th>技能数</th></tr></thead>
          <tbody>${agentRows || '<tr><td colspan="4">无启用 Agent</td></tr>'}</tbody>
        </table>
        <h2 class="section-title"><b>Sources</b> 显式声明的本地来源</h2>
        <table class="table">
          <thead><tr><th>ID</th><th>scope</th><th>路径</th><th>状态</th><th>技能数</th></tr></thead>
          <tbody>${sourceRows || '<tr><td colspan="5">无 sources</td></tr>'}</tbody>
        </table>`;
    } catch (err) {
      app.innerHTML = errorBox(err);
    }
  }

  /* ── 路由 ──────────────────────────── */
  function setNav(tab) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      a.classList.toggle("active", a.dataset.nav === tab);
    });
  }

  function route() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const seg = hash.split("/").filter(Boolean);
    if (seg[0] === "skill" && seg[1]) {
      viewDetail(decodeURIComponent(seg[1]));
    } else if (seg[0] === "inventory") {
      viewInventory();
    } else {
      viewList();
    }
  }

  /* ── 搜索（防抖） ──────────────────── */
  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = searchInput.value;
      state.offset = 0;
      if (location.hash && location.hash !== "#/" && location.hash !== "#") {
        location.hash = "#/";
      } else {
        viewList();
      }
    }, 300);
  });

  window.addEventListener("hashchange", route);
  loadStats();
  route();
})();
