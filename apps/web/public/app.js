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
    usage: {
      days: "30",
      origin: "mcp",
      query: "",
      tag: "",
      status: "all",
      sort: "usage-desc",
      offset: 0,
    },
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

  const ICONS = {
    arrowLeft: '<path d="m15 18-6-6 6-6"/>',
    arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };

  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

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

  const loading = () => `<div class="loading" role="status">正在读取本地数据</div>`;

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
        <span class="stat-item"><b>${s.skillCount}</b> SKILLS</span>
        <span class="stat-item">ENGINE <b>${escapeHtml(s.engineDefault)}</b> · TOP-K <b>${s.topKDefault}</b></span>
        <span class="stat-item stat-updated">UPDATED <b>${fmtTime(s.catalogUpdatedAt || s.catalogMtime)}</b></span>
        <span class="stat-item stat-source" title="${escapeHtml(s.skillsDir)}">SOURCE <b>${escapeHtml(s.skillsDir.replace(/^\/Users\/[^/]+/, "~"))}</b></span>
        ${llmChip}`;
    } catch {
      statsbar.hidden = true;
    }
  }

  /* ── 视图：技能列表 / 搜索 ─────────── */
  const tagBadges = (tags) =>
    (tags || []).map((t) => `<span class="badge tag">${escapeHtml(t.label)}</span>`).join("");

  const cardHtml = (s, index) => {
    const number = String((state.query.trim() ? 0 : state.offset) + index + 1).padStart(2, "0");
    return `
      <a class="card" href="#/skill/${encodeURIComponent(s.name)}">
        <div class="card-top">
          <span class="card-index">SKILL / ${number}</span>
          <span class="card-arrow">${icon("arrowUpRight")}</span>
        </div>
        <div class="card-name">${escapeHtml(s.name)}</div>
        <div class="card-desc">${escapeHtml(s.description || "这个 Skill 还没有描述。")}</div>
        <div class="card-meta">
          ${tagBadges(s.tags)}
          ${scopeBadge(s.provenance)}
          ${s.score !== undefined ? `<span class="badge score">${Number(s.score).toFixed(2)}</span>` : ""}
        </div>
      </a>`;
  };

  function renderTagSidebar(summary) {
    const items = [{ id: "", label: "全部技能", count: summary.total }, ...summary.tags];
    return `
      <div class="tag-side-title">Browse by category</div>
      <div class="tag-items">
        ${items
          .map((t) => {
            const active = (!state.tag && !t.id) || state.tag === t.id;
            return `
              <button type="button" class="tag-item ${active ? "active" : ""}" data-tag="${escapeHtml(t.id)}" aria-pressed="${active}">
                <span class="tag-label">${escapeHtml(t.label)}</span>
                <span class="tag-count">${t.count}</span>
              </button>`;
          })
          .join("")}
      </div>
      <div class="tag-side-hint">规则自动派生<br />可在 ~/.skill-hub/taxonomy.yaml 自定义</div>`;
  }

  async function viewList() {
    setNav("skills");
    const searching = Boolean(state.query.trim());
    document.title = searching
      ? `${state.query.trim()} · 搜索 · skill-hub`
      : "skill-hub · 本地技能工作台";
    searchInput.value = state.query;
    app.innerHTML = loading();
    try {
      if (!state.tagSummary) state.tagSummary = await api("/api/tags");
      const summary = state.tagSummary;
      const tagQ = state.tag ? `&tag=${encodeURIComponent(state.tag)}` : "";
      let contentHtml = "";
      let bindContent = () => {};

      if (searching) {
        const data = await api(`/api/search?q=${encodeURIComponent(state.query)}&top_k=50${tagQ}`);
        contentHtml = `
          <div class="section-title">
            <div>
              <span class="section-kicker">Search / ${escapeHtml(data.engine)}</span>
              <h2>“${escapeHtml(state.query.trim())}”</h2>
              <p class="section-subtitle">命中 ${data.results.length} 项 · 候选 ${data.candidate_count} 项</p>
            </div>
            <div class="section-actions">
              ${state.tag ? '<button class="btn small" id="clear-tag">清除标签筛选</button>' : ""}
              ${data.index_rebuild_recommended ? '<span class="badge warn">索引建议重建</span>' : ""}
              ${data.decision ? `<span class="badge decision" title="Jev 概率仅作升级建议，不代表执行授权">决策 ${escapeHtml(data.decision.selected || "none")} · ${(Number(data.decision.confidence) * 100).toFixed(1)}%${data.decision.escalation_recommended ? " · 建议升级" : ""}</span>` : ""}
            </div>
          </div>
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
          <div class="section-title">
            <div>
              <span class="section-kicker">Library index</span>
              <h2>${active ? escapeHtml(active.label) : "全部技能"}</h2>
              <p class="section-subtitle">共 ${data.total} 项 · 第 ${page} / ${pages} 页</p>
            </div>
            ${active ? '<div class="section-actions"><button class="btn small" id="clear-tag">清除筛选</button></div>' : ""}
          </div>
          ${
            data.skills.length
              ? `<div class="grid">${data.skills.map(cardHtml).join("")}</div>`
              : `<div class="empty">该分类下暂无技能。</div>`
          }
          <div class="pager">
            <button class="btn" id="pg-prev" ${state.offset === 0 ? "disabled" : ""}>${icon("arrowLeft")}上一页</button>
            <span>${data.total ? state.offset + 1 : 0}–${state.offset + data.skills.length} / ${data.total}</span>
            <button class="btn" id="pg-next" ${data.nextOffset === null ? "disabled" : ""}>下一页${icon("arrowUpRight")}</button>
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

      const heroHtml = `
        <section class="list-hero" aria-labelledby="library-title">
          <div class="hero-copy">
            <div class="eyebrow">Local skill library</div>
            <h1 class="hero-title" id="library-title">Agent 能力，<br /><em>井然有序。</em></h1>
            <p class="hero-description">在一个本地工作台中检索、审阅并理解每一项 Skill。少一点寻找，多一点创造。</p>
          </div>
          <div class="hero-index">
            <div class="hero-index-top"><span>LIBRARY / 001</span><span class="hero-live"><i></i>LOCAL INDEX</span></div>
            <div class="hero-count">${summary.total}</div>
            <div class="hero-count-label">项技能，集中在一处。</div>
            <div class="hero-metrics">
              <div><strong>${summary.tags.length}</strong><span>分类标签</span></div>
              <div><strong>100%</strong><span>本地只读</span></div>
            </div>
          </div>
        </section>`;

      app.innerHTML = `
        ${searching ? "" : heroHtml}
        <div class="list-layout">
          <aside class="tag-side" aria-label="技能分类">${renderTagSidebar(summary)}</aside>
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

  /* ── 使用率与预算：固定分母，筛选/排序先于分页 ── */
  let usageRequest = 0;
  const fmtCount = (value) =>
    value === null || value === undefined ? "—" : Number(value).toLocaleString("zh-CN");
  const fmtRate = (value) =>
    value === null ? "—" : value > 0 && value < 0.0001 ? "<0.01%" : `${(value * 100).toFixed(2)}%`;
  const selectOptions = (items, selected) =>
    items
      .map(
        ([value, label]) =>
          `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(label)}</option>`,
      )
      .join("");

  async function viewUsage(focusId) {
    const request = ++usageRequest;
    setNav("usage");
    document.title = "使用率与上下文预算 · skill-hub";
    app.innerHTML = loading();
    const filters = state.usage;
    const params = new window.URLSearchParams({
      sort: filters.sort,
      status: filters.status,
      offset: String(filters.offset),
      limit: String(PAGE_SIZE),
    });
    for (const key of ["days", "origin", "tag"]) if (filters[key]) params.set(key, filters[key]);
    if (filters.query.trim()) params.set("q", filters.query.trim());
    try {
      const [report, tags] = await Promise.all([
        api(`/api/usage-overview?${params}`),
        api("/api/tags"),
      ]);
      if (request !== usageRequest || location.hash !== "#/usage") return;
      const sample = report.usage.totalInitialReads;
      const warnings = [];
      if (report.usage.exists === false)
        warnings.push(
          "未找到使用记录：历史使用情况未知。请先由维护者给需要记录的进程配置 SKILL_HUB_USAGE_LOG；本页不会自动开启记录。",
        );
      if (!report.usage.complete)
        warnings.push(
          `使用记录不完整${report.usage.errorCode ? `（${report.usage.errorCode}）` : `（${report.usage.issueCount} 条异常记录）`}，次数与占比仅代表可读记录。`,
        );
      if (report.usage.exists && !sample)
        warnings.push("当前时间与来源没有正文首段样本，暂不计算使用率。可切换时间范围或来源。");
      if (sample > 0 && sample < 20)
        warnings.push(`当前只有 ${sample} 次正文首段样本，占比不宜用于判断长期使用偏好。`);
      if (!report.context.complete)
        warnings.push(
          `正文预算读取不完整（可读 ${report.context.readable}/${report.catalogTotal} 项）；失败项显示未知，不按零开销处理。`,
        );
      const metrics = [
        [
          report.usage.exists === false || report.usage.exists === null ? "—" : fmtCount(sample),
          "正文首段样本",
          "所选时间与来源 · 全库分母",
        ],
        [
          fmtCount(report.usage.observedSkillCount),
          "有观测的 Skill",
          `当前库 ${report.catalogTotal} 项 · 包含候选/附件事件`,
        ],
        [
          `≈ ${fmtCount(report.context.metadataTotalEstimatedTokens)}`,
          "元数据 Token 粗估",
          "全库名称与描述 · 不含工具封装",
        ],
        [
          `${report.context.readable} / ${report.catalogTotal}`,
          "正文预算可读",
          "全文与首段分开 · 不含附件",
        ],
      ];
      app.innerHTML = `
        <header class="section-title usage-head">
          <div><span class="section-kicker">Usage / Context budget</span><h1>用得如何，占用多少。</h1><p class="section-subtitle">按可观测读取理解使用率，按需控制上下文。</p></div>
          <button class="btn btn-dark" id="usage-refresh">刷新数据</button>
        </header>
        <section class="usage-summary" aria-label="使用与预算摘要">${metrics.map(([value, label, hint]) => `<div class="usage-metric"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`).join("")}</section>
        ${warnings.length ? `<div class="usage-notice" role="status">${warnings.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>` : ""}
        <form id="usage-filters" class="usage-filters" aria-label="使用率筛选与排序">
          <label class="usage-query">技能或描述<input type="search" id="usage-query" value="${escapeHtml(filters.query)}" placeholder="筛选技能名称、描述…" /></label>
          <label>时间范围<select id="usage-days">${selectOptions(
            [
              ["7", "近 7 天"],
              ["30", "近 30 天"],
              ["", "当前日志全部"],
            ],
            filters.days,
          )}</select></label>
          <label>读取来源<select id="usage-origin">${selectOptions(
            [
              ["mcp", "MCP"],
              ["cli", "CLI"],
              ["web", "Web 浏览"],
              ["library", "库调用"],
              ["", "全部（含 Web）"],
            ],
            filters.origin,
          )}</select></label>
          <label>分类<select id="usage-tag">${selectOptions([["", "全部分类"], ...tags.tags.map((tag) => [tag.id, tag.label])], filters.tag)}</select></label>
          <label>观测状态<select id="usage-status">${selectOptions(
            [
              ["all", "全部状态"],
              ["read", "有正文首段读取"],
              ["observed", "有观测记录"],
              ["unobserved", "未观测"],
            ],
            filters.status,
          )}</select></label>
          <label>排序<select id="usage-sort">${selectOptions(
            [
              ["usage-desc", "使用率：高 → 低"],
              ["usage-asc", "使用率：低 → 高"],
              ["recent", "最近读取优先"],
              ["tokens-desc", "正文 Token：多 → 少"],
              ["tokens-asc", "正文 Token：少 → 多"],
              ["name", "名称：A → Z"],
            ],
            filters.sort,
          )}</select></label>
          <div class="usage-filter-actions"><button class="btn btn-dark" type="submit">应用筛选</button><button class="btn" type="button" id="usage-reset">重置</button></div>
        </form>
        <p class="usage-definition">使用率 = 该 Skill 正文首段次数 ÷ 所选时间与来源内全库正文首段总次数。分类、关键词和状态筛选不改变分母；续读和附件不计入分母。默认 MCP，不混入 Web 人工浏览。</p>
        <div class="section-title usage-results"><div><h2>观测明细</h2><p class="section-subtitle" id="usage-result-count" role="status">筛选 ${report.total} / ${report.catalogTotal} 项 · 全库分母 ${fmtCount(sample)} 次</p></div><span class="badge">未知值始终排后</span></div>
        <div class="table-wrap usage-table-wrap" role="region" aria-label="技能使用率与预算表，可横向滚动" tabindex="0"><table class="table usage-table">
          <thead><tr><th scope="col">Skill</th><th scope="col">使用率 / 首段次数</th><th scope="col">续读 / 附件 / 候选</th><th scope="col">最近读取</th><th scope="col">元数据 / 全文 / 首段 Token 粗估</th><th scope="col">已返回文本 Token 粗估</th></tr></thead>
          <tbody>${
            report.items
              .map((row) => {
                const cost = row.cost;
                return `<tr data-skill="${escapeHtml(row.name)}"><td><a class="usage-skill-link" href="#/skill/${encodeURIComponent(row.name)}">${escapeHtml(row.name)}</a><p class="usage-description">${escapeHtml(row.description)}</p>${tagBadges(row.tags)}${!row.observed ? '<span class="badge">未观测</span>' : ""}</td>
              <td><strong class="usage-rate">${fmtRate(row.usageRate)}</strong><div class="usage-rate-track" aria-hidden="true"><span style="width:${row.usageRate === null ? 0 : Math.max(0, Math.min(100, row.usageRate * 100))}%"></span></div><small>首段 ${fmtCount(row.initialBodyReads)} 次${row.observed && row.usageRate === null ? " · 无首段分母" : ""}</small></td>
              <td>${fmtCount(row.continuationBodyReads)} / ${fmtCount(row.attachmentReads)} / ${fmtCount(row.appearances)}<small>服务错误 ${fmtCount(row.errors)}</small></td>
              <td class="usage-time">${escapeHtml(fmtTime(row.lastReadAt))}</td>
                  <td title="正文UTF-16字符 ${fmtCount(cost?.fullBody?.utf16Chars)}；UTF-8字节 ${fmtCount(cost?.fullBody?.utf8Bytes)}">≈ ${fmtCount(cost?.metadata?.estimatedTokens)} / ${cost?.fullBody ? `≈ ${fmtCount(cost.fullBody.estimatedTokens)}` : "未知"} / ${cost?.initialPage ? `≈ ${fmtCount(cost.initialPage.estimatedTokens)}` : "未知"}<small>${cost?.fullBody ? `正文 ${fmtCount(cost.fullBody.utf16Chars)} 字符 · ${fmtSize(cost.fullBody.utf8Bytes)}` : "正文长度未知"}</small><small>首段 ${report.context.maxChars} 字符上限${cost?.errorCode ? ` · ${escapeHtml(cost.errorCode)}` : ""}</small></td>
              <td>${row.estimatedReturnedTokens === null ? "—" : `≈ ${fmtCount(row.estimatedReturnedTokens)}`}<small>正文与附件逐次相加</small></td></tr>`;
              })
              .join("") ||
            '<tr><td colspan="6"><div class="empty">没有符合筛选条件的 Skill。可重置筛选或扩大时间范围。</div></td></tr>'
          }</tbody>
        </table></div>
        <div class="pager"><button class="btn" id="usage-prev" ${filters.offset === 0 ? "disabled" : ""}>上一页</button><span>${report.total ? filters.offset + 1 : 0}–${filters.offset + report.items.length} / ${report.total}</span><button class="btn" id="usage-next" ${report.nextOffset === null ? "disabled" : ""}>下一页</button></div>
        <details class="usage-explanation"><summary>查看观测范围与估算口径</summary><p>仅统计 Hub search/read 服务调用，未观测不等于从未使用；首段次数不是唯一任务数，读取不证明实际采用或执行成功。MCP 不能识别具体客户端，原生磁盘读取不可见。Web 进程记录配置：${report.usage.recordingConfigured ? "已设置（不代表其他客户端已启用）" : "未设置"}。日志最早可见记录：${escapeHtml(fmtTime(report.usage.recordedSince))}。</p><p>Token 使用 ${escapeHtml(report.context.method)} 粗估：ASCII / 4 + 非 ASCII 码点 × 1.5，向上取整。不是模型 tokenizer 或账单，不保证误差界；不含工具定义、JSON 封装、历史与缓存。模型真实 Token 和费用未知，不假设全库正文会注入。</p></details>`;
      const update = (focus) => {
        for (const key of ["query", "days", "origin", "tag", "status", "sort"])
          filters[key] = document.getElementById(`usage-${key}`).value;
        filters.offset = 0;
        viewUsage(focus);
      };
      document.getElementById("usage-filters").onsubmit = (event) => {
        event.preventDefault();
        update("usage-query");
      };
      for (const key of ["days", "origin", "tag", "status", "sort"])
        document.getElementById(`usage-${key}`).onchange = () => update(`usage-${key}`);
      document.getElementById("usage-refresh").onclick = () => update("usage-refresh");
      document.getElementById("usage-reset").onclick = () => {
        state.usage = {
          days: "30",
          origin: "mcp",
          query: "",
          tag: "",
          status: "all",
          sort: "usage-desc",
          offset: 0,
        };
        viewUsage("usage-query");
      };
      document.getElementById("usage-prev").onclick = () => {
        filters.offset = Math.max(0, filters.offset - PAGE_SIZE);
        viewUsage("usage-prev");
      };
      document.getElementById("usage-next").onclick = () => {
        if (report.nextOffset !== null) {
          filters.offset = report.nextOffset;
          viewUsage("usage-next");
        }
      };
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    } catch (err) {
      if (request === usageRequest && location.hash === "#/usage")
        app.innerHTML = `${errorBox(err)}<p>若服务仍运行旧版本，请由维护者重启 Web 进程后再打开使用与预算页。</p><button class="btn" id="usage-retry">重试</button>`;
      const retry = document.getElementById("usage-retry");
      if (retry) retry.onclick = () => viewUsage();
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
    document.title = `${name} · skill-hub`;
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
        ["路径", `<span class="mono">${escapeHtml(doc.path)}</span>`, "路径"],
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
          if (key === "scope") value = scopeBadge({ scope: explain.scope }) || "—";
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
        <a class="backlink" href="#/">${icon("arrowLeft")}返回技能库</a>
        <header class="detail-head">
          <div class="eyebrow">Skill / Detail</div>
          <h1>${escapeHtml(doc.name)}</h1>
          <p>${escapeHtml(doc.description || "")}</p>
          <div class="detail-tags">${tagBadges(doc.tags)}${scopeBadge({ scope: explain.scope })}</div>
        </header>
        <div class="detail-layout">
          <article class="doc" id="doc-body">
            ${renderMarkdown(stripFrontmatter(doc.body))}
            ${
              doc.truncated
                ? `<div class="doc-pager">
                    <span>已显示 ${doc.body.length} / ${doc.totalChars} 字符</span>
                    <button class="btn small" id="doc-more">继续读取</button>
                  </div>`
                : ""
            }
          </article>
          <aside class="side" aria-label="技能诊断信息">
            <section class="panel">
              <h3>${icon("info")}元信息</h3>
              <dl class="kv">${metaRows}</dl>
            </section>
            <section class="panel">
              <h3>${icon("layers")}Agent 投影状态</h3>
              ${agents || '<div class="empty compact">无配置</div>'}
            </section>
            <section class="panel">
              <h3>${icon("shield")}静态安全审计</h3>
              <button class="btn btn-dark small" id="run-audit">运行静态审计</button>
              <div id="audit-result">尚未扫描。审计只读，不执行脚本。</div>
            </section>
            <section class="panel">
              <div class="tabs" role="tablist" aria-label="附件与历史">
                <button role="tab" data-tab="files" class="active" aria-selected="true">${icon("folder")}文件</button>
                <button role="tab" data-tab="history" aria-selected="false">${icon("history")}历史</button>
              </div>
              <div id="tab-body" class="tab-body"></div>
            </section>
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
        tabButtons.forEach((b) => {
          const active = b.dataset.tab === tab;
          b.classList.toggle("active", active);
          b.setAttribute("aria-selected", String(active));
        });
        if (tab === "files") renderFiles(tabBody, name, "");
        else renderHistory(tabBody, name);
      };
      tabButtons.forEach((b) => (b.onclick = () => activate(b.dataset.tab)));
      activate("files");
    } catch (err) {
      app.innerHTML =
        `<a class="backlink" href="#/">${icon("arrowLeft")}返回技能库</a>` + errorBox(err);
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
        `<a data-dir="">${escapeHtml(name)}</a>`,
        ...parts.map(
          (p, i) =>
            `<a data-dir="${escapeHtml(parts.slice(0, i + 1).join("/"))}">${escapeHtml(p)}</a>`,
        ),
      ].join(" / ");

      const rows = data.files
        .map((f) => {
          const iconName = f.type === "directory" ? "folder" : f.type === "blocked" ? "x" : "file";
          const full = f.path;
          return `<div class="file-row" data-type="${f.type}" data-path="${escapeHtml(full)}">
            <span class="file-icon">${icon(iconName)}</span>
            <span class="fname">${escapeHtml(f.path)}</span>
            <span class="fsize">${f.type === "blocked" ? escapeHtml(f.reason || "blocked") : fmtSize(f.size)}</span>
          </div>`;
        })
        .join("");

      container.innerHTML = `
        <div class="crumbs">${crumbs}</div>
        ${rows || '<div class="empty compact">空目录</div>'}
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
            slot.innerHTML = `<div class="crumbs file-viewer-heading">${escapeHtml(p)}
                <span class="file-meta">（${file.totalChars} 字符${file.truncated ? "，已截断" : ""}）</span></div>
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
        container.innerHTML = `<div class="empty compact">暂无历史事件</div>`;
        return;
      }
      container.innerHTML = `<ul class="timeline">${data.entries
        .map(
          (e) => `<li>
            <div class="t-time">${fmtTime(e.at)}</div>
            <div class="t-action">${escapeHtml(e.type)}${e.action ? ` · ${escapeHtml(e.action)}` : ""}</div>
            ${e.source ? `<div class="t-source">${escapeHtml(e.source)}</div>` : ""}
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
    document.title = "多端盘点 · skill-hub";
    app.innerHTML = loading();
    try {
      const data = await api("/api/inventory");
      const directories = [
        ...data.agents.map((a) => ({ ...a, purpose: "兼容同步目标" })),
        ...data.sources
          .filter((s) => s.scope === "user")
          .map((s) => ({ ...s, purpose: "只读来源" })),
      ];
      const otherSources = data.sources.filter((s) => s.scope !== "user");
      const agentRows = directories
        .map(
          (a) => `<tr>
            <td class="mono">${escapeHtml(a.id)}</td>
            <td class="mono">${escapeHtml(a.path)}</td>
            <td>${a.exists ? '<span class="chip ok"><span class="dot"></span>目录存在</span>' : '<span class="chip missing" title="未找到此 Skill 目录；不代表 Agent 未安装，也可能使用共享目录或 Hub MCP。"><span class="dot"></span>目录未找到</span>'}</td>
            <td>${a.count}</td>
            <td>${escapeHtml(a.purpose)}</td>
          </tr>`,
        )
        .join("");
      const sourceRows = otherSources
        .map(
          (s) => `<tr>
            <td class="mono">${escapeHtml(s.id)}</td>
            <td>${scopeBadge({ scope: s.scope })}</td>
            <td class="mono">${escapeHtml(s.path)}</td>
            <td>${s.exists ? '<span class="chip ok"><span class="dot"></span>目录存在</span>' : '<span class="chip missing" title="未找到此 Skill 目录；不代表 Agent 未安装，也可能使用共享目录或 Hub MCP。"><span class="dot"></span>目录未找到</span>'}</td>
            <td>${s.count}</td>
          </tr>`,
        )
        .join("");
      app.innerHTML = `
        <section class="list-hero inventory-hero" aria-labelledby="inventory-title">
          <div class="hero-copy">
            <div class="eyebrow">Runtime inventory</div>
            <h1 class="hero-title" id="inventory-title">多端状态，<br /><em>一屏尽览。</em></h1>
            <p class="hero-description">对照 Agent 目标目录与技能来源，查看各路径的技能数量与目录状态。</p>
          </div>
          <div class="hero-index">
            <div class="hero-index-top"><span>INVENTORY / 002</span><span class="hero-live"><i></i>READ ONLY</span></div>
            <div class="hero-count">${data.unionApprox}</div>
            <div class="hero-count-label">项技能的跨端并集（约）</div>
            <div class="hero-metrics">
              <div><strong>${directories.length}</strong><span>Agent 目录</span></div>
              <div><strong>${otherSources.length}</strong><span>项目/工作区来源</span></div>
            </div>
          </div>
        </section>
        <section class="inventory-section">
          <div class="section-title">
            <div>
              <span class="section-kicker">Agent directories</span>
              <h2>Agent 目录</h2>
              <p class="section-subtitle">已配置目标与内置 Agent 来源的只读盘点；来源不会自动成为同步目标</p>
              <p class="section-subtitle">状态仅检查 Skill 目录，不检测 Agent 是否安装；使用共享目录或 Hub MCP 时，原生目录可以不存在。</p>
            </div>
            <span class="inventory-count">${directories.length} DIRECTORIES</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">Agent 目录、路径、状态、技能数与用途</caption>
              <thead><tr><th>Agent</th><th>路径</th><th>目录状态</th><th>技能数</th><th>用途</th></tr></thead>
              <tbody>${agentRows || '<tr><td colspan="5">无启用 Agent 目录</td></tr>'}</tbody>
            </table>
          </div>
        </section>
        <section class="inventory-section">
          <div class="section-title">
            <div>
              <span class="section-kicker">Project / workspace sources</span>
              <h2>项目/工作区来源</h2>
              <p class="section-subtitle">配置中显式声明的项目与工作区来源；只读盘点，不自动同步或导入</p>
            </div>
            <span class="inventory-count">${otherSources.length} SOURCES</span>
          </div>
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">本地来源、作用域、路径、状态与技能数</caption>
              <thead><tr><th>ID</th><th>scope</th><th>路径</th><th>目录状态</th><th>技能数</th></tr></thead>
              <tbody>${sourceRows || '<tr><td colspan="5">无 sources</td></tr>'}</tbody>
            </table>
          </div>
        </section>`;
    } catch (err) {
      app.innerHTML = errorBox(err);
    }
  }

  /* ── 路由 ──────────────────────────── */
  function setNav(tab) {
    document.querySelectorAll("[data-nav]").forEach((a) => {
      const active = a.dataset.nav === tab;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  function route() {
    const hash = location.hash.replace(/^#/, "") || "/";
    const seg = hash.split("/").filter(Boolean);
    if (seg[0] === "skill" && seg[1]) {
      viewDetail(decodeURIComponent(seg[1]));
    } else if (seg[0] === "inventory") {
      viewInventory();
    } else if (seg[0] === "usage") {
      viewUsage();
    } else {
      viewList();
    }
  }

  /* ── 搜索（防抖） ──────────────────── */
  let searchTimer = null;
  const applySearch = () => {
    state.query = searchInput.value;
    state.offset = 0;
    if (location.hash && location.hash !== "#/" && location.hash !== "#") {
      location.hash = "#/";
    } else {
      viewList();
    }
  };
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applySearch, 300);
  });
  document.addEventListener("keydown", (event) => {
    const typing =
      event.target instanceof window.HTMLElement &&
      (event.target.matches("input, textarea, select") || event.target.isContentEditable);
    if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      searchInput.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchInput) {
      if (searchInput.value) {
        clearTimeout(searchTimer);
        searchInput.value = "";
        applySearch();
      } else {
        searchInput.blur();
      }
    }
  });

  window.addEventListener("hashchange", route);
  loadStats();
  route();
})();
