# 接口约定 — skill-hub

| 字段     | 值                                       |
| -------- | ---------------------------------------- |
| 状态     | Active                                   |
| 版本     | v0.1（实现已跟进 Phase 1–4 垂直切片）    |
| 最后更新 | 2026-08-16（Phase 4 index/explain 切片） |
| 对齐     | `ARCHITECTURE.md` · `HARNESS.md`         |

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

盘点还合并内置用户级 Agent 来源：DeepSeek Harness、OpenCode、Gemini CLI、Qoder、GitHub Copilot、Windsurf/Devin、Cline、Roo Code、Kilo Code。路径和官方依据见[环境配置](../ops/ENVIRONMENT.md#agent-mappings-versus-sources)。既有配置无需重写；显式同 ID source 优先，停用设置保留，已声明路径不重复追加。`--sources` 可过滤内置 ID；缺失根仍返回 missing，不创建目录。CLI 与 `skill_inventory` / `GET /api/inventory` 共用来源解析；MCP/Web 的 `agent` 参数按 ID 同时过滤目标和来源，scope 过滤继续生效。内置来源不加入同步目标，不能据盘点结果宣称宿主已完成 MCP 接入。

显式 `ingest --sources <内置ID> --dry-run` 可预览导入；同 ID source 配置优先，即使该 ID 因已有 Agent 而从盘点来源去重，显式导入仍使用该 Agent 的配置路径（或占用预设路径的 Agent 路径），不会将 ID 当作当前目录下的同名文件夹。配置停用项不回退到其他预设路径；省略 `--sources` 时仍仅使用配置里显式启用的来源，不自动导入内置来源。takeover/backup/sync 的来源范围不变。库函数 `agentSkillSources(config, env?)` 返回合并来源而不修改 config；`skillInventorySummary` 另可传 `configPath` 做隔离查询，该路径选项不暴露为 HTTP/MCP 参数。

**实现状态**：Done（Phase 1 + Phase 4 scope/source）

Web 的“Agent 目录”表合并展示响应中的 `agents` 与 `scope=user` 的 `sources`，通过“用途”列区分兼容同步目标和只读来源；项目/工作区来源另表展示。此合并只影响展示，不改变 API 数组、sync 目标或写入权限。构建更新不会替换已运行 Node 进程中的模块；交付须核对实际地址的数据及页面。

`exists` 是指定 Skill 路径的文件系统观测，不是应用安装、进程运行、MCP连接或Skill调用状态。Web列名为“目录状态”，未找到路径显示“目录未找到”，并提示原生目录在共享目录/Hub MCP模式下可以不存在；不据此自动创建目录或复制Skill。

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

`index` 同时生成 `index-meta.json`（catalog hash/freshness）和 `bm25.json`（BM25 可加载 artifact）。`--rebuild` 用当前 canonical 重新吸收 Skill 元数据并覆盖两份索引文件；普通`index`使用现有catalog。当前artifact为v2（`skill-hub.bm25.v2`），旧v1不再加载，查询回退内存并提示重建。

`index_fresh=true`要求catalog hash匹配、artifact版本可加载、数量匹配，以及全部登记Skill的`SKILL.md`（兼容`skill.md`）当前内容SHA-256匹配。内容变化、缺失、越界链接、特殊文件、超过10MiB或读取异常返回false与原因；正文校验不将正文纳入检索或上传，也不扫描附件。内容漂移时返回现有catalog的内存检索结果并提示`index --rebuild`，不会自动写用户文件或偷偷吸收新元数据。坏链须先按来源修复再重建，不能靠重建绕过不完整扫描。

BM25按字段去重并累计名称×3、顶层keywords×3、description×1；中文多字串使用bigram。查询确实为一个汉字时，按各元数据字段的字符覆盖单独回退，不向普通查询恢复unigram噪音；reasons增加`single_char_fallback`。`reasons`区分`name_token`、`keyword_hit`和`desc_hit`。网页/API/本地等使用方式应写进description和keywords；当前检索仍是词项匹配，不能把排名当作执行授权或语义理解保证。

---

### 1.7 `route`

```bash
skill-hub route "<query>" [--top-k 5] [--scope user|workspace|project] [--profile coding|video] [--engine bm25|external-typesafe] [--profiles-dir <dir>] [--index-dir <dir>]
```

**JSON 结果**含：`engine`、`profile`、`scope`、`scope_matched`、`profile_matched`、`candidate_count`、`index_fresh`、`index_source`、`index_rebuild_recommended`、`index_reason`、`decision`、`results[]`；每个结果带 `provenance`。使用 Jev 时 `decision` 包含 `kind`、`model`、`selected`、官方 `confidence`、`selected_probability`、`none_probability`、`threshold`、`escalation_recommended` 与按 Skill 名称映射的 `probabilities`，BM25、空候选或降级时为 `null`。显式 scope 无命中时不会回退到全量候选。

`external-typesafe` 使用 Jev 对 Skill 的 `name/description/keywords` 做 Choice 概率排序，不上传 `SKILL.md` 正文；缺少 `TYPESAFE_API_KEY`、请求失败或响应异常时自动降级 BM25。成功调用时结果包含只读 `decision` 元数据（选择、概率、置信度和升级建议），供上层决定是否交给更强模型或人工复核；它不触发任何执行动作。默认引擎仍为 `bm25`，使用 `--engine external-typesafe` 显式启用。

TypeScript `TypeSafeRouterEngine` 实例另提供 `getLastRequestMetrics()`，供显式 opt-in 评估读取最近一次 query attempt 的响应 model、往返 `latencyMs`、API 返回的 input/output token counts 与 HTTP/JSON 完成状态。未报告或格式不合法的 usage 显示为 `null`；失败请求有延迟但没有 token counts；未发 HTTP 请求时返回 `undefined`。它是与 `getDecision()` 相同的实例级快照，不是并发 query 的逐请求结果。此对象不含 query、Skill metadata 或 API Key，不进入 CLI/MCP 返回值，也不自行估算 USD 成本；BM25 引擎没有 Jev usage/escalation 指标。

评估命令见 [环境与评估工具说明](../ops/ENVIRONMENT.md)：`pnpm eval:router:jev` 在同一个显式 catalog 上按 required/none/ambiguous 确定性轮询任务，再并列运行本地 BM25 与 Jev；低请求限额改变类别比例，结果仅描述该 draft 子集。`--preview` 用与线上 query 相同的 payload builder 在本地检查请求体，不读取 API Key、不联网、不写线上评估报告；默认只显示汇总，完整查询和候选元数据仅由显式 `--preview-out` 保存为权限受限的本地文件。在线模式只有显式 network/billing/metadata opt-in 后才发出最多 `max-requests` 个 TypeSafe 请求。它固定官方 endpoint，失败不重试；实际 USD 不由 API metrics 直接返回，只能在给出 rates 且 usage 完整时估算。此 runner 不属于默认 CLI route 或 CI。

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

### 使用观测与上下文预算（P23-01）

```bash
skill-hub usage [name] [--log /absolute/usage.jsonl] [--days 7] [--origin cli|mcp|web|library] [--json]
skill-hub context-cost [name] [--catalog /absolute/catalog.json] [--max-chars 8000] [--context-window N] [--json]
```

- `usage`默认读取`SKILL_HUB_USAGE_LOG`，否则读取状态目录下usage.jsonl；始终只读，未找到显示exists=false/recordedSince=null，不补历史。成功search候选出现、正文首段/续读、附件读取与服务错误按Skill及origin分组，包含最近读取、返回文本大小与启发式估算。可按Skill、最近1到3650天、origin过滤；不传days为当前文件全部。坏行保持部分报告、complete=false与退出3；文件超过32MiB或不是安全普通文件则拒绝读取。actualModelTokens/actualCost为null。
- `context-cost`通过既有安全读取逐项提供metadata（name+换行+description）、fullBody（含frontmatter）、initialPage、contentHash，以及显式contextWindow对应的首段估算比例。默认maxChars=8000（1到100000），不是自动探测宿主配置。仅比较文本大小，不读取附件或假定全库注入。未指定窗口为null；正文读取失败保留元数据，全文/首段为null，complete=false且退出3；catalog缺失的扫描回退也标为不完整。报告本身不产生使用事件。
- 使用`utf8-heuristic-v1`（ASCII/4 + 非ASCII码点×1.5，向上取整），同时报告UTF-16长度、码点数和UTF-8字节；这是粗略估算，不是模型tokenizer或计费结果，不保证误差界。协议封装、工具定义、历史、缓存、重复注入和实际费用不计。metadata合计是逐项估算相加，不能当实际启动开销或实际节省。
- search/read服务默认仍不写盘。只有进程显式设置`SKILL_HUB_USAGE_LOG`绝对.jsonl路径才追加独立usage日志（非history、非Skill/catalog），不上传query或Skill内容；写失败有stderr告警并保留原调用结果。记录不包含query、描述、正文、附件路径和错误详情。CLI/MCP/Web入口区分来源，但不能识别具体MCP客户端或原生磁盘读取；首段次数不是唯一任务数，服务返回不是模型采用/执行成功回执。MCP参数校验等进入服务前的失败不计。
- 库接口：core `estimateContext(text)`、`appendUsage(file,event)`、`readUsageReport({file,days?,origin?,name?,now?})`；router `skillContextCost({name?,catalogPath?,configPath?,maxChars?,contextWindow?})`、`withUsageScope(origin,call,record?)`。估算库接口与CLI同口径；不新增MCP工具。P23-02在下述Web接口复用这些能力。完整记录格式、权限/归档边界见[使用观测手册](../ops/USAGE_AND_CONTEXT.md)及[ADR0012](../adr/0012-local-usage-context-estimates.md)。

`GET /api/usage-overview`：固定当前配置的catalog与usage日志，不接受file/log/catalog路径参数，仅GET。支持`days`（1–3650，省略为当前文件全部）、`origin`（cli/mcp/web/library，省略合并全部）、`q`（name/description子串）、`tag`、`status`（all/read/observed/unobserved）、`sort`（usage-desc/usage-asc/recent/tokens-desc/tokens-asc/name）、`offset`（0–10000000）、`limit`（1–100，默认24）、`max_chars`（1–100000，默认8000）。未知参数和无效筛选返回400，POST返回405。

router `skillUsageOverview`复用同名camelCase选项，另接受显式catalogPath/configPath/taxonomyPath与测试用now。先按时间/来源聚合，再以当前catalog全部成功正文首段次数为分母，计算`usageRate`（0–1）；再按q/tag/status筛选、全局排序、分页。元数据、预算和原始次数同列，首段续读不混合，无记录的次数/占比为null，无全库首段分母时占比也为null；未知始终排后，同值按名称稳定排序。移出catalog的Skill日志不进入分母。

返回generatedAt、complete、usage/context独立完整性与诊断、catalogTotal/total/offset/nextOffset、items。日志缺失exists=false不推断历史零使用；日志读取异常保留预算、usage.complete=false与错误码。预算局部失败保留其他项。部分结果HTTP200并标明不完整，始终cache-control:no-store，不返回日志文件路径、正文或query记录，不写usage。Web视图`/#/usage`默认days=30/origin=mcp/sort=usage-desc，完整筛选/显示口径见手册。

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

当前源码仅支持 stdio MCP，入口 `apps/mcp-server/dist/index.js`。2026-10-29 按用户要求移除 HTTP MCP 入口、远端 exposure 与分发命令；Web `/api` 保持独立本机 REST，不能用作 MCP URL。既有 npm 0.2.1 发布字节不被修改，见 [REMOTE_MCP](../ops/REMOTE_MCP.md)。


`SKILL_HUB_MCP_MODE`可选`full`（默认、兼容下表11工具）或`runtime`（仅skill_search/skill_read/skill_files）；非法值报E_CONFIG，隐藏工具也不能直接调用。runtime默认Top-3/文本8000字符，搜索返回紧凑候选name/description/score/scope与索引警告/简化decision；读取返回和安全边界不变。`createSkillHubMcpServer({mode?})`可供本机库调用；HTTP 生命周期接口不再提供。配置与开销计量见[MINIMAL_RUNTIME](../ops/MINIMAL_RUNTIME.md)。

| Tool              | 参数                                                                                       | 返回                                |
| ----------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- |
| `skill_search`    | `query: string`, `top_k?: number`, `scope?: string`, `profile?: string`, `engine?: string` | Top-K 元数据 + provenance           |
| `skill_fetch`     | `name: string`, `max_chars?: number`                                                       | SKILL.md 正文 + meta                |
| `skill_stats`     | —                                                                                          | catalog 计数、索引时间              |
| `skill_inventory` | `agent?: string`, `scope?: string`                                                         | Agent/source 摘要矩阵               |
| `skill_explain`   | `name: string`                                                                             | 来源、冲突、overlay、投影与 history |
| `skill_path`      | `name: string`                                                                             | canonical/source/Agent 路径状态     |
| `skill_history`   | `name?: string`, `limit?: number`                                                          | 本地生命周期元数据                  |
| `skill_audit`     | `name?: string`                                                                            | 只读静态审计报告；不执行 Skill      |

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
    scope: project # user | workspace | project
    enabled: true
    source_type: local # local | git | registry | generated
    source_ref: project-main
    revision: abc123
    status: active # active | draft | deprecated
    # overlay_of: base-skill
router:
  top_k: 5
  engine: bm25 # bm25 | hybrid | external-*（可选 external-typesafe / Jev）
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

| Code          | 含义              | 建议退出码 |
| ------------- | ----------------- | ---------- |
| `E_CONFIG`    | 配置无效          | 3          |
| `E_PATH`      | 路径不存在/无权限 | 3          |
| `E_PARSE`     | SKILL.md 解析失败 | 1          |
| `E_CONFLICT`  | 同名冲突需人工    | 2          |
| `E_INDEX`     | 索引缺失/损坏     | 1          |
| `E_SYNC`      | 分发失败          | 1          |
| `E_BACKUP`    | 备份失败          | 1          |
| `E_NOT_FOUND` | skill 不存在      | 1          |
| `E_INTERNAL`  | 未分类内部错误    | 1          |

---

## 6. 版本与兼容

v0.x 允许破坏性调整；1.0 起走 semver。MCP 增工具 MINOR；改语义 MAJOR。

## 7. Phase 5 — Hub 安装生命周期（2026-09-05）

```bash
skill-hub install <local-path|owner/repo|https://github.com/owner/repo> [--skill name,...] [--ref main] [--overlay-of base-name] [--apply --yes]
skill-hub adopt <source> [--skill name,...] [--ref main] [--overlay-of base-name] [--apply --yes]
skill-hub update [name,...] [--plan-token token --apply --yes]
skill-hub migrate-source <name> --source <local-path|owner/repo|https://github.com/owner/repo> [--ref ref] [--plan-token token --apply --yes]
skill-hub check-updates [name,...] [--json]
skill-hub rollback <name> --from <managed-backup-skill-path> [--dry-run | --apply --yes]
skill-hub list [name,...]
skill-hub takeover [--include-plugins] [--out report.json]
```

- install/update/adopt 默认 dry-run；同时带 `--dry-run --apply` 时 dry-run 优先。写 Hub 必须 `--apply --yes`，update 还必须提供预览返回的 `--plan-token`。不写 Agent 目录。
- install 支持本地单 Skill/集合、GitHub owner/repo 或无凭据 HTTPS URL。使用 `./relative/path` 消除与 owner/repo 简写的歧义；不支持任意 Git host、URL tree 子路径、SSH URL 或归档包。用 `--skill` 选择技能，`--ref` 指定 Git ref（默认 HEAD）；锁记录实际 commit。
- `--overlay-of <base-name>` 可在 install/adopt 单个 fork 时记录逻辑基底；base 必须已在 catalog 中且路径存在。若来源扫描出多个 Skill，必须用 `--skill` 精确选择一个。fork 必须使用不同的 Skill 名称；overlay 关系保存在 managed lock 与 provenance 中，update/rollback 会保留。它只记录关系，不合并文件、不改同名冲突策略；改变已锁定 fork 的 base 需要显式迁移，不能通过 update 改写。base 后续改名/移除不会自动更新 fork，目前没有 dangling-base 扫描。
- install/adopt 的 GitHub `--ref` 可接受完整 commit SHA；隔离临时 Hub 上以 GitHub `pdf` Skill dry-run 验证，返回的 `provenance.revision` 与指定 SHA 相同。需要复现时优先使用完整 SHA，不使用会移动的分支名或 `HEAD`；锁同时记录 `ref`、解析后的 `commit`、`subpath` 和完整目录 `treeHash`。字段迁移、adopt 限制及 rollback 边界见 [统一管理手册](../ops/UNIFIED_SKILL_MANAGEMENT.md#来源锁迁移与固定-git-版本)。
- adopt 只允许已有 canonical 实体目录与来源全目录内容完全相同；用于旧 ingest Skill 的上游绑定。不同来源已绑定条目不能被静默重绑。
- `migrate-source` 显式迁移单个已受管 Skill 的来源：要求旧锁、当前 canonical、新来源三者 treeHash 一致，名称相同，自动保留原 overlayOf；旧来源可以已不可访问，不读取旧上游。新来源须独立于 canonical/state（按真实路径校验）；拒绝本地修改、不同内容、缺失目标、隐式批量和 overlayOf 改写。迁移不升级内容；新来源仅有较新内容时，应先提供与安装基线一致的来源版本，再另行预览 update。
- 迁移默认 dry-run，返回 `previousSource`、`nextSource` 完整来源锁、空 `changes`、`sourceLockChanged` 和 `planToken`。指纹复用 update 的字段绑定，但使用独立 `skill-hub-migrate-source-plan-v1` 合同，不能与 update token 互换。apply 必须重复名称、source/ref 并带 token + apply/yes；缺/错格式 E_CONFIG，锁/目标/来源版本/位置漂移 E_CONFLICT。Git 来源仍需重新联网获取，不能离线套用预览。
- 迁移在 state lock 内重新规划、确认并备份现有 Skill 与旧来源锁，返回可用于既有 rollback 的 `backupPath`；仅更新来源锁及后续 CLI catalog/history/index，不替换 canonical 目录。备份后重验 canonical、新来源 hash 与锁，失败保留恢复证据；同来源同版本是 noop，不创建新备份。rollback 可恢复旧来源锁，但不会让已失效的旧路径重新可访问。进程崩溃/断电、跨包事务边界同 update。
- update 从锁中读取来源/ref；名字省略则更新全部已绑定技能，未绑定条目不伪造来源。任一目标本地完整目录偏离锁版本时整批预检失败。`update --ref` 拒绝隐式改跟踪分支。
- update 预览返回 `planToken` 及每项 `changes[]`（path、added/removed/modified、before/after 的 kind/contentHash/executable，不含文件正文），包括空目录、文件类型和执行位变化；根条目和 `.git` 不列入差异。canonical Skill 根级 `.git` 元数据在更新与回滚时按原对象移动保留（目录、worktree 文件或外部符号链接），不参与 treeHash、锁基线和预览差异；根 `.git` 链接或 gitdir 文件若引用 Skill 内部内容则拒绝替换，避免目标被更新删除。来源包中的 `.git` 不物化；canonical 已有嵌套 `.git` 或回滚备份中的 `.git` 会显式拒绝替换，保留原内容。`sourceLockChanged` 与 current/upstream revision 单独报告来源元数据变化；Git commit 移动而 Skill 树相同可出现 `changes=[]`、action=noop、sourceLockChanged=true。
- update 实际写入在 core 要求 `ManageSkillsOptions.planToken`，CLI 对应 `--plan-token`；缺失/格式错误 E_CONFIG，重新获取上游并构建计划后指纹不符 E_CONFLICT。原始选择参数必须重复（或再次省略表示全部锁项）；目标集、canonical/state 真实位置、当前完整树、选中项旧/目标来源锁（含确切 Git commit/hash）均绑定在指纹中。名称顺序不影响同一集合；无关 Skill 在预览后正常更新不会使单项计划失效，但全集新增成员会改变全集计划。
- token 是版本化 SHA-256 内容指纹，不是签名、权限或持久缓存；仍需 apply/yes，不设时间到期，仅当前状态完全匹配时可用。上游不可访问时不能离线套用 token。state lock 覆盖重新规划到应用/恢复；备份前与锁提交前复验当前锁语义，检测到非协作修改则拒绝覆盖并恢复目录。既有 staging/备份/替换前树校验继续生效；不承诺对同用户主动并发篡改、进程崩溃或断电自动恢复。详见 [ADR 0011](../adr/0011-managed-update-plan-binding.md)。
- 事务发布状态在对应 rename 成功后更新；捕获到发布或来源锁写入失败时，恢复已移动的原目录及根 `.git`。成功或恢复完成后只清理 hash 仍匹配且不含 `.git` 的已知事务快照；未知内容、并发编辑或清理失败保留证据并报 E_SYNC。若错误详情 `committed=true`，目录/来源锁已提交，需检查保留的事务，不可把报错直接当作更新未发生。
- `check-updates` 只读检查 managed lock 中的来源；省略名称即检查全部锁定项，不把 catalog 中未受管条目伪装成可升级。拒绝 `--apply`/`--yes` 与来源/ref 覆盖，不读取或改写 catalog/history/index/Agent 目录；GitHub 来源会联网克隆到临时目录并清理。同一次检查中相同 URL/ref 共用快照（包括失败结果），不使用持久缓存；沿用 Git 子进程 120 秒超时，串行执行且不自动重试。
- 检查返回 `complete`、`issues[]` 及逐项 `localStatus`（clean/modified/missing/blocked/unmanaged）、`upstreamStatus`（changed/unchanged/unknown）、`updateAvailable`（true/false/null）、`applyBlocked`、`lockedTreeHash`、`currentTreeHash`、`sourceTreeHash`、`currentRevision`、`upstreamRevision`、`checkedAt` 与 `errors[]`。`applyBlocked=true` 表示当前本地状态不为 clean 或上游未知；false 也不是 apply 授权或确认计划。显式请求无来源锁的名称会返回 unmanaged/error 并使检查不完整，不证明该名称在磁盘存在；默认全量检查只枚举锁项。`currentRevision` 是已安装锁的 Git commit，不是本地修改的版本。local 来源的 revision 为 null；`updateAvailable` 比较锁基线与上游树，仓库 commit 移动但 Skill 树相同仍为 false。
- 本地修改是已知状态，不使只读结果不完整，也不阻止查上游；实际 update/apply 仍拒绝覆盖。来源失败、目标缺失、扫描或清理失败会使 `complete=false`，失败查询保持 unknown/null，不能显示为最新。`checkedAt` 为该项观测结束时间，结果不是原子快照、确认计划或将来可安全 apply 的承诺。
- `check-updates` 上游错误的 `path` 标明锁定来源，`hint` 提示核对路径/ref与访问错误，以及显式同内容 migrate-source 预览；它不猜测替代上游、不把认证/网络错误直接判为来源已删除。
- list 返回实体 canonical 中的条目与来源状态：present/modified/unmanaged/missing/blocked；扫描/条目错误通过同一 `issues[]` 格式报告并保留健康条目，`complete=false`，不静默清除失效项。坏来源锁/schema/配置仍整体失败。两种只读命令均在输出不完整结果后退出 3，完整结果退出 0；JSON `dryRun=true`、`indexUpdated=false`。错误项含路径，私有 Hub 报告应留本地。list 不是全部未配置项目路径的扫描器。
- update 成功时为每个旧 Skill 备份保存独立来源锁快照。`rollback` 一次接受一个 managed Skill 和之前 update/rollback 返回的精确 `items[].backupPath`；默认 dry-run，apply 必须 `--apply --yes`。它要求当前 canonical treeHash 与当前锁一致，且所选备份来自 `managed backups/<batch>/<name>`、批次侧车中的来源锁有效并与备份 treeHash 完全相等；旧版无快照备份、被修改的备份或本地已改动 Skill 均拒绝。成功 rollback 会把当前版本再备份，输出新的 backupPath，可用于反向回滚；过程只读取本地备份，不联网、不执行 Skill 脚本。
- `managed-lock.json`：`version: 1`、`skills[name]: {type: local|github, path?|url?, ref?, commit?, subpath, overlayOf?, treeHash}`。`overlayOf` 是可选的 base Skill 名，旧锁缺省兼容。临时文件 + rename 更新；坏 JSON/schema 拒绝。安装器不在锁或错误详情中记录凭据 URL。
- catalog 写入通过同目录 `<catalog>.lock` 排他锁串行。`updateCatalog(path, callback)` 在锁内重读最新 catalog 后执行合并并原子替换；CLI managed、ingest、index rebuild/init 使用该 read-modify-write 入口。直接 `writeCatalog(path, snapshot)` 仍表示整份替换，不应拿旧快照覆盖并发修改。锁竞争返回 E_CONFLICT，不自动排队重试；锁文件若因进程崩溃残留，需人工确认无写进程后清理。
- 实际 managed 写入成功后 CLI 增量更新 catalog/history 并构建当前配置 index。若后续 catalog/index 失败，命令报错但已完成的目录/锁事务不会跨包自动回滚；用 `list` 检查，并运行 `index --rebuild` 恢复索引。
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
skill-hub manifest [--out <path>] [--dry-run | --apply --yes] [--catalog path] [--config path] [--json]
```

`read` 默认仅正文写 stdout，续读提示写 stderr；JSON 返回 `{name,path,file,body,offset,nextOffset,totalChars,truncated,hash}`。offset/max_chars 使用 JavaScript UTF-16 字符偏移，续读应使用返回的 nextOffset；跨页检查 hash 不变，变化则重新读取。正文未必移除 frontmatter。每页 1–100000 字符，文件最大 10 MiB；只读 UTF-8 普通文本，拒绝 NUL/非 UTF-8/特殊文件。

| MCP Tool    | 参数                             | 返回                                                                                |
| ----------- | -------------------------------- | ----------------------------------------------------------------------------------- |
| skill_list  | query?, offset?, limit?          | total、offset、nextOffset、skills（name/description/path/provenance）；名字稳定排序 |
| skill_files | name, path?, offset?, limit?     | 单层目录 total、nextOffset、files（path/type/size/reason）；异常条目 type=blocked   |
| skill_read  | name, file?, offset?, max_chars? | 分页文本及当前文件 SHA-256                                                          |
| skill_fetch | name, offset?, max_chars?        | 兼容旧元数据/SKILL.md 返回；新增 offset/nextOffset/totalChars，默认50000字符        |

列表每页默认50、最大100。无效类型/非整数/越界分页明确报错；不存在的名称报 E_NOT_FOUND。相对路径不得包含 `..`、`.git`，不得为绝对路径。根 symlink 支持；内部链接须解析到根内，环路/越界被拒绝。files 不递归预读文件内容；图片等二进制可以显示目录项但不能当文本加载。

Server instructions 提供精确名直接 fetch、未知先 search/list、附件 files/read、按需续读及内容权限边界。MCP 不提供 install/update/执行脚本等写操作。

`manifest` 导出 `<available_skills>` XML，供需要静态发现清单的项目级 Agent 使用。清单只含已加载 Skill 的 `name`、`description` 和 Hub `skill_search`/`skill_read`/`skill_files` 使用提示，不包含正文或路径；会分页覆盖整个 catalog。未指定 `--out` 时输出清单到 stdout；指定 `--out` 时默认只预览、不写文件。写入必须同时提供 `--out <path> --apply --yes`，以同目录临时文件加 rename 原子替换普通文件；拒绝目录和符号链接目标；指定输出时先比对真实路径（包括父目录符号链接别名），禁止覆盖输入 catalog 与实际配置文件，默认 Hub 路径同样受保护。显式 `--dry-run` 优先于 `--apply`。JSON 预览在未指定输出路径时包含 `content`，指定路径时返回路径、Skill 数量和 dry-run 状态。

---

## 8. Phase 7 — Web 只读视图（2026-09-06）

入口：`apps/web`（`@skill-hub/web`）。启动：`pnpm web`（或 `node apps/web/dist/index.js [--port 4173] [--host 127.0.0.1]`；环境变量 `SKILL_HUB_WEB_PORT` / `SKILL_HUB_WEB_HOST`）。默认 bind **127.0.0.1:4173**，仅本机访问。

**安全边界**：与 MCP 一致，**只读**。仅支持 GET；不提供 sync/restore/install/update 等任何写操作；不写 history。复用 `@skill-hub/router` hub-service 全部读取能力，无独立数据通路。

| HTTP 端点             | 对应能力                           | 参数                                    |
| --------------------- | ---------------------------------- | --------------------------------------- |
| `GET /api/health`     | 探活                               | —                                       |
| `GET /api/stats`      | skill_stats                        | —                                       |
| `GET /api/tags`       | 全库标签汇总（skillTagSummary）    | —                                       |
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

## npm命令包（v0.2.0候选）

`pnpm pack:npm [--name <package-name>]`构建并输出独立tarball及完整路径/integrity/体积/文件数，`published: false`；`pnpm check:npm`生成自己的候选并真实安装验收。0.2.2候选包含四个bin：`skill-hub`、`skill-hub-mcp`、`skill-hub-web`、`skill-hub-opencode`；已移除 HTTP 命令，既有0.2.1注册库包不被重写。对外不承诺JS库exports；不引入安装脚本或改变已有工具语义。详见[npm发行](../ops/NPM_DISTRIBUTION.md)。

`publish-npm.yml`复用CI并在标签push时发布；manual dispatch只dry-run。`node scripts/publish-npm.mjs --report <acceptance.json> [--publish]`默认为dry-run；真实写入必须处于官方仓库GitHub Actions匹配版本tag push、有OIDC授权且HEAD已合入main。`check:npm --registry`直接核验官方发布字节并重新安装，见[npm发行](../ops/NPM_DISTRIBUTION.md)。


0.2.2 的 `skill-hub-opencode` 随 npm 包分发既有 Hub-only 启动器，默认 MCP 与 profiles 从安装包定位；显式传递 SKILL_HUB_HOME/CONFIG/MCP_MODE/USAGE_LOG，继续关闭该独立进程的原生 Skill 发现。它不安装或执行 OpenCode 本体，也不保证其他宿主关闭原生发现。
