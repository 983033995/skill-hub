# 接口约定 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1（实现已跟进 Phase 1–4 垂直切片） |
| 最后更新 | 2026-08-16（Phase 4 index/explain 切片） |
| 对齐 | `ARCHITECTURE.md` · `HARNESS.md` |

> 约定：所有面向自动化的命令支持 `--json`。  
> 退出码：`0` 成功；`1` 一般错误；`2` 冲突/需人工；`3` 配置/环境错误。

---

## 1. CLI 接口

全局：

```text
skill-hub [--json] [--config <path>] [--verbose] <command> [options]
```

### 1.1 `doctor`

**用途**：环境与路径自检。

```bash
skill-hub doctor
```

**实现状态**：Done（Phase 1）

---

### 1.2 `inventory`

```bash
skill-hub inventory \
  [--agents workbuddy,cursor] \
  [--sources project-claude,workspace-skills] \
  [--scope user|workspace|project] \
  [--out ./matrix.md]
```

**行为**：`agents` 是已有 Agent 目录盘点；`sources` 是配置中显式声明的本地 Skill 目录。两者只扫描含 `SKILL.md` 的目录，不扫描普通 Markdown/知识库文件。JSON 会返回 scope、source、hash、provenance，以及冲突的 winner/winner_reason。

**实现状态**：Done（Phase 1 + Phase 4 scope/source）

---

### 1.3 `backup`

```bash
skill-hub backup [--out ~/.skill-hub/backups/<ts>]
```

**实现状态**：Done（Phase 2）

---

### 1.4 `init`

```bash
skill-hub init [--force]
```

**实现状态**：Done（Phase 1）

---

### 1.5 `ingest`

```bash
skill-hub ingest [--sources <dir|source-id>[,<dir|source-id>...]] \
  [--prefer <dir>] \
  [--conflict report|skip] \
  [--dry-run] \
  [--no-materialize]
```

**行为**：扫描 →（默认）物化到 `~/.skill-hub/skills` → 写 catalog。省略 `--sources` 时使用配置中 enabled 的 `sources`；source id 会保留 scope/provenance。`project/workspace` Skill 可以进入 catalog，但不会默认被全局 `sync` 投影。
**实现状态**：Done（Phase 1 catalog + 验收期 materialize）

---

### 1.6 `index`

```bash
skill-hub index [--rebuild] [--catalog <path>] [--index-dir <dir>]
```

**实现状态**：Done（Phase 1）

`index` 同时生成 `index-meta.json`（catalog hash/freshness）和 `bm25.json`（BM25 可加载 artifact）。`--rebuild` 用当前 canonical 重新吸收 Skill 元数据并覆盖两份索引文件。`index-meta.json.catalogHash` 对比当前 catalog 的稳定 hash；`route` 在没有 profile/scope 过滤且 hash 匹配时直接加载 `bm25.json`，否则回退内存 BM25。

---

### 1.7 `route`

```bash
skill-hub route "<query>" [--top-k 5] [--scope user|workspace|project] [--profile coding|video] [--engine bm25|external-typesafe] [--profiles-dir <dir>] [--index-dir <dir>]
```

**JSON 结果**含：`engine`、`profile`、`scope`、`scope_matched`、`profile_matched`、`candidate_count`、`index_fresh`、`index_source`、`index_rebuild_recommended`、`index_reason`、`decision`、`results[]`；每个结果带 `provenance`。使用 Jev 时 `decision` 包含 `kind`、`model`、`selected`、官方 `confidence`、`selected_probability`、`none_probability`、`threshold`、`escalation_recommended` 与按 Skill 名称映射的 `probabilities`，BM25、空候选或降级时为 `null`。显式 scope 无命中时不会回退到全量候选。

`external-typesafe` 使用 Jev 对 Skill 的 `name/description/keywords` 做 Choice 概率排序，不上传 `SKILL.md` 正文；缺少 `TYPESAFE_API_KEY`、请求失败或响应异常时自动降级 BM25。成功调用时结果包含只读 `decision` 元数据（选择、概率、置信度和升级建议），供上层决定是否交给更强模型或人工复核；它不触发任何执行动作。默认引擎仍为 `bm25`，使用 `--engine external-typesafe` 显式启用。

**实现状态**：Done（Phase 1 BM25 + Phase 3 profile/engine + Phase 4 scope + Jev 可选语义路由）

---

### 1.8 `audit`

```bash
skill-hub audit [name] [--fail-on high|critical|warning|info] [--catalog <path>] [--config <path>]
```

只读扫描一个 Skill 或整个 canonical catalog。审计不执行 Skill、不联网、不修改 catalog；扫描私钥/令牌、远程管道执行、破坏性命令、动态执行、编码载荷、网络请求、疑似 prompt injection、执行权限和越界链接。默认 `--fail-on high`，命中策略返回退出码 2；JSON 报告包含文件、行号、规则、严重级别和摘要，不输出源代码行。达到扫描上限、遇到跳过目录/特殊文件或不支持编码时 `complete=false` 并按失败策略处理。它是静态启发式，不替代人工代码审查。

**实现状态**：Done（Phase 11 P11-02）

### 1.9 `explain` / `path` / `history`

```bash
skill-hub explain <name> [--catalog <path>] [--history <path>]
skill-hub path <name> [--catalog <path>]
skill-hub history [name] [--history <path>] [--limit 50]
```

- `explain`：只读展示 catalog 代表项、scope/source/revision/status/hash、同名变体、winner 原因、overlay/fork 基准、Agent 投影状态和该 Skill 的历史事件。
- `path`：只读展示 catalog 记录路径、canonical 预期路径、source ref，以及每个 Agent target 的 `ok`、`missing`、`wrong_target`、`broken_symlink` 或 `content_mismatch` 状态。
- `history`：读取 `~/.skill-hub/history.jsonl`，默认按最近事件倒序展示；可按 Skill 名过滤。文件只含生命周期元数据，不含 `SKILL.md` 正文。

`ingest` 的实际创建/更新、`index` 构建和 `sync --apply` 会追加 history；`--dry-run` 不写 history。缺失 Agent/source 目录在 explain/path 中显示为缺失，不会阻断诊断。

**实现状态**：Done（Phase 4 P4-06）

---

### 1.10 `sync`

```bash
skill-hub sync --dry-run [--agents workbuddy] [--create-only]
skill-hub sync --apply --yes --allow-write --backup-dir <dir> [--agents ...] [--create-only]
```

`sync.mode` 决定投影方式：

- `symlink`：默认模式；目标为正确 symlink 时 `noop`。
- `copy`：目标不存在时创建实体副本；已有 symlink 会转为实体副本；实体目录的完整目录 hash 不一致时仍报告 `conflict`，只有 `--replace-real` 才会先 stash 再复制。

JSON 计划会返回 `mode`；动作还包括 `create_copy`、`update_copy`、`replace_real_copy`。

带 `provenance.scope=workspace|project` 的 Skill 默认不会进入全局 Agent 投影；旧 catalog 未带 provenance 的条目按 `user` 兼容处理。

**实现状态**：Done（Phase 2 + P2-08 create-only + v0.2 copy fallback）

---

### 1.11 `verify` / `restore`

```bash
skill-hub verify
skill-hub restore --from <backup> --dry-run
skill-hub restore --from <backup> --apply --yes   # 需明确授权
```

**实现状态**：Done（Phase 2）

`verify` 会按 `sync.mode` 检查：symlink 模式验证 realpath；copy 模式验证实体目录及完整目录 hash（包含脚本/附件/执行位）。copy 模式额外报告 `not_copy` 与 `content_mismatch`。

---

## 2. 库 API（TypeScript）

### `@skill-hub/router`（Phase 3 扩展）

```ts
// 检索
skillSearch({ query, topK?, scope?, profile?, engine?, indexDir? })
skillFetch({ name, maxChars? })
skillExplain({ name, catalogPath?, configPath?, historyPath? })
skillPaths({ name, catalogPath?, configPath? })
skillHistory({ name?, historyPath?, limit? })
skillStats()
skillInventorySummary({ agent?, scope? })

// 引擎
createRouterEngine({ engine })
routeWithProfile({ text, skills, topK?, scope?, profile? })
filterByProfile / loadProfile / parseProfileYaml
filterByScope
createExternalRouter // stdin/stdout 协议 + 降级 bm25
```

---

## 3. MCP 接口（Phase 3）

传输：**stdio MCP**。入口：`apps/mcp-server/dist/index.js`。

| Tool | 参数 | 返回 |
|------|------|------|
| `skill_search` | `query: string`, `top_k?: number`, `scope?: string`, `profile?: string`, `engine?: string` | Top-K 元数据 + provenance |
| `skill_fetch` | `name: string`, `max_chars?: number` | SKILL.md 正文 + meta |
| `skill_stats` | — | catalog 计数、索引时间 |
| `skill_inventory` | `agent?: string`, `scope?: string` | Agent/source 摘要矩阵 |
| `skill_explain` | `name: string` | 来源、冲突、overlay、投影与 history |
| `skill_path` | `name: string` | canonical/source/Agent 路径状态 |
| `skill_history` | `name?: string`, `limit?: number` | 本地生命周期元数据 |
| `skill_audit` | `name?: string` | 只读静态审计报告；不执行 Skill |

**安全**：MCP **只读**；不提供 `sync --apply` / `restore --apply`。

集成步骤：`docs/ops/MCP_INTEGRATION.md`。

**实现状态**：Done（P3-01 + scope/source 只读扩展）

---

## 4. 配置文件 schema（摘要）

路径：`~/.skill-hub/config.yaml`

```yaml
version: 1
canonical_dir: ~/.skill-hub/skills
index_dir: ~/.skill-hub/index
backup_dir: ~/.skill-hub/backups
agents:
  - id: workbuddy
    skills_dir: ~/.workbuddy/skills
    enabled: true
sources:
  - id: project-claude
    path: /project/.claude/skills
    scope: project       # user | workspace | project
    enabled: true
    source_type: local   # local | git | registry | generated
    source_ref: project-main
    revision: abc123
    status: active        # active | draft | deprecated
    # overlay_of: base-skill
router:
  top_k: 5
  engine: bm25   # bm25 | hybrid | external-*（可选 external-typesafe / Jev）
sync:
  mode: symlink
  conflict: report
  require_backup: true
privacy:
  telemetry: false
```

`mode: copy` 是 symlink 不可用时的显式 fallback，不会绕过 backup、dry-run 或冲突保护。

`agents` 只表示同步目标；`sources` 只表示本地 Skill 盘点/导入来源。`sources` 不会把普通 Markdown、Obsidian 笔记或知识库内容纳入 catalog。

Profile 模板：`configs/profiles/*.yaml`。

外部引擎：

- `SKILL_HUB_EXTERNAL_ENGINE_CMD`
- `SKILL_HUB_EXTERNAL_ENGINE_ARGS`
- `SKILL_HUB_PROFILES_DIR`

Jev token获取、默认引擎、进程环境继承与GUI配置见 [JEV_SETUP](../ops/JEV_SETUP.md)。

Jev 语义路由（`external-typesafe`）使用：

- `TYPESAFE_API_KEY`：必须通过环境变量或宿主密钥管理器提供，不写入仓库配置
- `TYPESAFE_API_URL`：可选，默认 `https://api.typesafe.ai/v1/systemone`
- `TYPESAFE_MODEL`：可选，默认 `jev-latest`
- `TYPESAFE_TIMEOUT_MS`：可选，默认 15000ms
- `TYPESAFE_MIN_CONFIDENCE`：可选，0 到 1 的升级建议阈值，默认 `0.65`

阈值格式错误报 `E_CONFIG`；升级建议使用服务返回的 `confidence`，不使用 `selected_probability`。Choice 回包须覆盖全部候选、概率在 `[0,1]` 内且总和在 `1±0.001` 内，选择必须具有最高概率，confidence 须在 `[0,1]` 内；不合法时降级 BM25。

Jev 路由只提交 Skill 元数据；未配置或不可用时保留 BM25 主链路并返回 `degraded=true`。

---

## 5. 错误码（`SkillHubError.code`）

| Code | 含义 | 建议退出码 |
|------|------|------------|
| `E_CONFIG` | 配置无效 | 3 |
| `E_PATH` | 路径不存在/无权限 | 3 |
| `E_PARSE` | SKILL.md 解析失败 | 1 |
| `E_CONFLICT` | 同名冲突需人工 | 2 |
| `E_INDEX` | 索引缺失/损坏 | 1 |
| `E_SYNC` | 分发失败 | 1 |
| `E_BACKUP` | 备份失败 | 1 |
| `E_NOT_FOUND` | skill 不存在 | 1 |
| `E_INTERNAL` | 未分类内部错误 | 1 |

---

## 6. 版本与兼容

v0.x 允许破坏性调整；1.0 起走 semver。MCP 增工具 MINOR；改语义 MAJOR。


## 7. Phase 5 — Hub 安装生命周期（2026-09-05）

```bash
skill-hub install <local-path|owner/repo|https://github.com/owner/repo> [--skill name,...] [--ref main] [--apply --yes]
skill-hub adopt <source> [--skill name,...] [--ref main] [--apply --yes]
skill-hub update [name,...] [--apply --yes]
skill-hub list [name,...]
skill-hub takeover [--include-plugins] [--out report.json]
```

- install/update/adopt 默认 dry-run；同时带 `--dry-run --apply` 时 dry-run 优先。写 Hub 必须 `--apply --yes`。不写 Agent 目录。
- install 支持本地单 Skill/集合、GitHub owner/repo 或无凭据 HTTPS URL。使用 `./relative/path` 消除与 owner/repo 简写的歧义；不支持任意 Git host、URL tree 子路径、SSH URL 或归档包。用 `--skill` 选择技能，`--ref` 指定 Git ref（默认 HEAD）；锁记录实际 commit。
- adopt 只允许已有 canonical 实体目录与来源全目录内容完全相同；用于旧 ingest Skill 的上游绑定。不同来源已绑定条目不能被静默重绑。
- update 从锁中读取来源/ref；名字省略则更新全部已绑定技能，未绑定条目不伪造来源。任一目标本地完整目录偏离锁版本时整批预检失败。`update --ref` 拒绝隐式改跟踪分支。
- list 返回实体 canonical 中的条目与来源状态：present/modified/unmanaged/missing/blocked。内部环路等内容问题单列 blocked。不是全部未配置项目路径的扫描器。
- `managed-lock.json`：`version: 1`、`skills[name]: {type: local|github, path?|url?, ref?, commit?, subpath, treeHash}`。临时文件 + rename 更新；坏 JSON/schema 拒绝。安装器不在锁或错误详情中记录凭据 URL。
- 实际 managed 写入成功后 CLI 增量更新 catalog/history 并构建当前配置 index。若后续 catalog/index 失败，命令报错；已安装内容可用 list 检查，再 `index --rebuild` 恢复索引。
- takeover 输出 summary、roots、skills（ready/import/conflict/blocked）、external、issues。只读取配置的 canonical/agents/sources；include-plugins 额外读取已知 Codex/Claude 缓存及 Codex .system。external 不进入独立 Skill 冲突合并。
- Git dry-run 可克隆临时目录并清理；不写 Hub/canonical/Agent。Git 不执行仓库 scripts/hooks，不使用全局 Git 配置或继承 GIT_* 路径配置；本轮网络能力面向公开 GitHub。

### 既有行为修正

- ingest 增量合并 catalog；`--config` 的 canonical_dir/backup_dir 被使用。完整目录冲突默认阻断未解决批次，`--conflict skip` 只导入无冲突项；`--prefer` 显式选择 source。canonical 不同内容默认保留，`--force` 先归档再替换，失败恢复。
- ingest dry-run 实际检查目标完整目录，和真实写入采用相同分类；坏 catalog/配置、扫描遗漏不视为空库。
- index rebuild 使用配置 canonical，保留 catalog 中外部项目来源与既有 provenance；扫描失败显式报错。
- sync/verify 使用配置 canonical；损坏 catalog 不再被吞掉并伪装成空库成功。create 不覆盖预览后出现的新目标；stash 已存在则拒绝；投影失败恢复旧目录/旧链。
- 所有完整目录 hash 忽略 .git，不执行 Skill；内部 symlink 越界/环路拒绝 copy。原 SKILL.md hash 继续用于元数据兼容。

库入口：core `manageSkills`、`hashSkillTree`、`inspectTakeover`；具体 TypeScript 接口见同名模块。生产迁移流程见 [UNIFIED_SKILL_MANAGEMENT](../ops/UNIFIED_SKILL_MANAGEMENT.md)。


备份闸门补充：backup 使用时间戳加随机后缀，避免同秒覆盖；Agent 复制失败不会生成成功 manifest。sync apply 验证 manifest 中现有来源均成功、快照目录存在、目标 Agent ID/路径被覆盖；备份时不存在而此刻新出现的目标需要重新备份。旧 manifest 仍可读取，但不完整快照不再被接受。


## Phase 6 — 目录浏览与按需读取

CLI：

```bash
skill-hub browse [query] [--offset 0] [--limit 50] [--catalog path] [--json]
skill-hub files <name> [--path references] [--offset 0] [--limit 50] [--catalog path] [--json]
skill-hub read <name> [--file SKILL.md] [--offset 0] [--max-chars 20000] [--catalog path] [--json]
```

`read` 默认仅正文写 stdout，续读提示写 stderr；JSON 返回 `{name,path,file,body,offset,nextOffset,totalChars,truncated,hash}`。offset/max_chars 使用 JavaScript UTF-16 字符偏移，续读应使用返回的 nextOffset；跨页检查 hash 不变，变化则重新读取。正文未必移除 frontmatter。每页 1–100000 字符，文件最大 10 MiB；只读 UTF-8 普通文本，拒绝 NUL/非 UTF-8/特殊文件。

| MCP Tool | 参数 | 返回 |
|---|---|---|
| skill_list | query?, offset?, limit? | total、offset、nextOffset、skills（name/description/path/provenance）；名字稳定排序 |
| skill_files | name, path?, offset?, limit? | 单层目录 total、nextOffset、files（path/type/size/reason）；异常条目 type=blocked |
| skill_read | name, file?, offset?, max_chars? | 分页文本及当前文件 SHA-256 |
| skill_fetch | name, offset?, max_chars? | 兼容旧元数据/SKILL.md 返回；新增 offset/nextOffset/totalChars，默认50000字符 |

列表每页默认50、最大100。无效类型/非整数/越界分页明确报错；不存在的名称报 E_NOT_FOUND。相对路径不得包含 `..`、`.git`，不得为绝对路径。根 symlink 支持；内部链接须解析到根内，环路/越界被拒绝。files 不递归预读文件内容；图片等二进制可以显示目录项但不能当文本加载。

Server instructions 提供精确名直接 fetch、未知先 search/list、附件 files/read、按需续读及内容权限边界。MCP 不提供 install/update/执行脚本等写操作。

---

## 8. Phase 7 — Web 只读视图（2026-09-06）

入口：`apps/web`（`@skill-hub/web`）。启动：`pnpm web`（或 `node apps/web/dist/index.js [--port 4173] [--host 127.0.0.1]`；环境变量 `SKILL_HUB_WEB_PORT` / `SKILL_HUB_WEB_HOST`）。默认 bind **127.0.0.1:4173**，仅本机访问。

**安全边界**：与 MCP 一致，**只读**。仅支持 GET；不提供 sync/restore/install/update 等任何写操作；不写 history。复用 `@skill-hub/router` hub-service 全部读取能力，无独立数据通路。

| HTTP 端点 | 对应能力 | 参数 |
|-----------|----------|------|
| `GET /api/health` | 探活 | — |
| `GET /api/stats` | skill_stats | — |
| `GET /api/tags` | 全库标签汇总（skillTagSummary） | — |
| `GET /api/llm/status` | 可选模型增强层状态（getLlmStatus） | `probe?`（=1 时实际请求服务做健康探测） |

`/api/llm/status` 属可选增强层：**永不抛错**，未配置返回 `state=disabled`；配置非法返回 `misconfigured`、服务不可达返回 `unreachable`，错误信息内联于 `error.message`/`error.hint`。响应只含 `apiKeyConfigured` 布尔值，密钥不出进程。配置方式与降级语义详见 [MODELS.md](./MODELS.md)。
| `GET /api/inventory` | skill_inventory | `agent?` `scope?` |
| `GET /api/skills` | skill_list | `query?` `tag?` `offset?` `limit?`（≤100） |
| `GET /api/search` | skill_search（BM25 / Jev） | `q`（必填）`top_k?` `profile?` `engine?` `scope?` `tag?` |
| `GET /api/audit` | canonical 全库/单 Skill 静态审计 | `name?` |
| `GET /api/skills/:name` | skill_fetch | `offset?` `max_chars?` |
| `GET /api/skills/:name/files` | skill_files | `path?` `offset?` `limit?` |
| `GET /api/skills/:name/read` | skill_read | `file?` `offset?` `max_chars?` |
| `GET /api/skills/:name/explain` | skill_explain | — |
| `GET /api/skills/:name/history` | skill_history | `limit?` |
| `GET /api/skills/:name/audit` | skill_audit | — |

错误：`SkillHubError.code` 映射 HTTP 状态（E_NOT_FOUND→404、E_CONFIG/E_PARSE→400、E_CONFLICT→409、其余 500），响应体 `{ok:false, code, message, details}`。分页/续读语义与 Phase 6 MCP 完全一致（UTF-16 offset、nextOffset、hash 校验、附件越界拒绝）。

前端：`apps/web/public` 静态 SPA（无构建依赖，hash 路由），由同一进程托管。视图：技能库浏览/检索、技能详情（Markdown 渲染 + 元信息 + Agent 投影状态 + 附件文件树 + history 时间线）、多端盘点。Markdown 渲染器经 CDN 加载失败时降级为纯文本预格式化展示。

### Taxonomy 自动打标签（内建分类能力）

模块：`packages/router/src/taxonomy.ts`。规则驱动、纯函数、确定性：

- **规则**：`name_globs` 命中 +3；`keywords` 命中 name +2、命中 description +1；每个 Skill 取 Top 3 标签，无命中归入 `other`（其他）。
- **覆盖**：加载顺序为显式路径 > `SKILL_HUB_TAXONOMY` 环境变量 > `~/.skill-hub/taxonomy.yaml` > 内置 `DEFAULT_TAXONOMY`。模板见 `configs/taxonomy.yaml`；显式文件解析失败直接报 E_CONFIG，不静默回退。
- **派生数据**：标签不写回 catalog，任何用户的 skill 库载入即自动生效；未来模型打标（embedding/LLM）输出复用同一 `SkillTag` 结构。
- 库 API：`tagSkill` / `loadTaxonomy` / `parseTaxonomyYaml` / `skillTagSummary`；`skillList` 与 `skillFetch` 返回项含 `tags`，`skillSearch` 支持 `tag` 过滤。

**实现状态**：Done（P7-01/02/03）
