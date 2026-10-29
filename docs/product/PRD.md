# PRD — skill-hub 产品需求文档

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-10-26 |
| Owner | script |
| 对齐规范 | `HARNESS.md` |

---

## 1. 背景与问题

本地开发者同时使用 **WorkBuddy、Claude Code、Codex、Cursor** 等多种 Agent，各自在：

- `~/.workbuddy/skills`
- `~/.claude/skills`
- `~/.codex/skills`
- `~/.agents/skills`
- `~/.cursor/skills`

等路径分别安装和发现 Skill。数量增长后，副本漂移、来源失效和上下文开销需要统一管理。

导致：

1. **管理碎片化**：同名 skill 多份拷贝、版本不一致  
2. **上下文膨胀**：每次会话塞入过多 skill 元数据/正文  
3. **选型变差**：LLM 在超长列表中命中率下降  
4. **迁移高风险**：手动拷贝/删除易丢数据  

---

## 2. 产品目标

### 2.1 一句话目标

> 让用户在**一份真源**上管理全部 Skill，并在任意 Agent 中获得**智能选型**与**省上下文**的一致体验。

### 2.2 目标拆解（OKR 风格）

| 目标 | 关键结果（可度量） |
|------|--------------------|
| G1 统一管理 | Skill 统一安装到 Canonical Store；默认 Agent 只接 Hub MCP，不注册单个 Skill |
| G2 智能选型 | 常用任务 Top-3 主观可用；路由 p95 ≤ 50ms @200 skills（本地索引） |
| G3 省上下文 | 相对“全量 description 注入”，单次相关注入 token 下降 ≥ 70% |
| G4 安全迁移 | 生产写入前必有 backup + dry-run 报告；冲突不静默覆盖 |
| G5 可维护工程 | 文档/质量门禁齐全，可持续迭代（HARNESS 基线） |

### 2.3 非目标（Out of Scope · v1）

- 不做云端 skill 市场账号体系  
- 不替代各 Agent 官方插件商店本身  
- 不管理本地知识库、Obsidian Vault 或普通 Markdown；skill-hub 只识别本地 Skill 目录中的 `SKILL.md`
- 不自动执行 skill 内任意网络攻击/破坏性脚本  
- 不以 Windows 一等公民为 v1 目标（可兼容调研）  
- 不在 v1 强制接入付费 embedding API（可选插件）  

---

## 3. 用户与场景

### 3.1 主角用户

| 角色 | 描述 |
|------|------|
| 重度本地 Agent 用户 | 多端装了大量 skill，需要统一与省 token |
| 个人效能工程向用户 | 接受 CLI/配置，重视可回滚与可审计 |
| 后续：小团队 | 共享同一套 skill hub（git 分发） |

### 3.2 核心场景（摘要）

完整展开见 `USER_SCENARIOS.md`。

| ID | 场景 | 期望结果 |
|----|------|----------|
| S1 | 盘点多端 skill | 输出存在矩阵与冲突列表 |
| S2 | 合并为 Canonical Store | 唯一真源；冲突显式列出 |
| S3 | 接入多 Agent | MCP 按需读取同一 Hub；symlink 为显式兼容 |
| S4 | 按任务智能选型 | 返回 Top-K + 分数/理由 |
| S5 | Agent 会话中自动缩候选 | hook/MCP/规则使模型只见 Top-K |
| S6 | 新增/更新 skill | Hub install/update 更新目录和索引 → 下次 MCP 加载可见 |
| S7 | 回滚错误迁移 | 从 backup 还原 |

---

## 4. 功能范围

### 4.1 P0 — MVP 必须

| 模块 | 功能 | 验收要点 |
|------|------|----------|
| Inventory | 扫描多端 skill 目录 | 统计数量、同名、缺失 SKILL.md |
| Canonical | 初始化 `~/.skill-hub` 结构 | 目录规范符合 ARCHITECTURE |
| Ingest/Merge | 导入 skill 到真源 | 冲突策略：skip/report，不静默覆盖 |
| Index | 构建本地检索索引 | 写入 catalog freshness + 可加载 BM25 artifact；过期 route 可解释并建议 rebuild |
| Route | 任务 → Top-K | CLI JSON/table；含 score |
| Sync | dry-run / apply 分发 | 默认 symlink；可显式使用 copy fallback；报告变更集 |
| Backup | 打包各端 + hub | 可还原说明 |
| Doctor | 环境自检 | Node、路径、权限、坏链 |
| Docs | HARNESS 文档体系 | 本 PRD 所属基线 |

### 4.2 P1 — 增强

| 模块 | 功能 |
|------|------|
| Profiles | 按场景缩小候选池（coding/video/marketing） |
| MCP Server | `skill_search` / `skill_fetch` / `skill_stats` |
| Agent Hooks 集成文档 | ASF/Claude/Codex/Cursor 接入步骤 |
| 混合路由 | BM25 + 可选第二信号（特征/图） |
| 依赖边 | `depends_on` 拉取前置 skill |
| OpenSkills 风格目录 | 显式生成只含 name+description 的清单和 Hub 按需读取提示；默认预览，指定目标并确认后原子写入 |

### 4.3 P2 — 远期

| 模块 | 功能 |
|------|------|
| GUI | 可视化管理与冲突解决 |
| 团队 Git 同步协议 | 多人 hub |
| 执行反馈学习 | 个性化加权 |
| Windows 一等支持 | junction/ACL |
| Skill 质量评分 | description 质量 lint |

---

## 5. 功能需求明细

### 5.1 配置模型

- 默认用户配置：`~/.skill-hub/config.yaml`  
- 仓库内默认模板：`configs/agents/*.yaml`  
- `agents` 是同步目标；`sources` 是可选的本地 Skill 盘点/导入来源，二者独立
- Web“Agent 目录”须统一展示配置目标与用户级来源，并注明用途；不能为满足目录展示而自动将只读来源加入同步目标。项目/工作区来源另表展示。
- 盘点的目录状态仅说明指定 Skill 路径是否找到，不表示 Agent 是否安装、运行、连接 MCP 或实际调用 Skill；共享目录/Hub MCP 使用方式不要求每个原生目录都存在。不得为消除目录提示而自动创建目录或复制 Skill。
- 盘点补充 DeepSeek Harness、OpenCode、Gemini CLI、Qoder、Copilot、Windsurf/Devin、Cline、Roo Code、Kilo Code 的内置用户级来源；不改写已有配置、不扩大同步目标。显式同 ID source 可覆盖路径或停用，已声明路径不重复添加。导入内置来源必须显式选 ID，省略来源参数不自动导入。路径与范围见 [ENVIRONMENT](../ops/ENVIRONMENT.md#agent-mappings-versus-sources)。
- 关键字段：

```yaml
canonical_dir: ~/.skill-hub/skills
agents:
  - id: workbuddy
    skills_dir: ~/.workbuddy/skills
    enabled: true
  - id: claude-code
    skills_dir: ~/.claude/skills
    enabled: true
  - id: codex
    skills_dir: ~/.codex/skills
    enabled: true
  - id: agents
    skills_dir: ~/.agents/skills
    enabled: true
  - id: cursor
    skills_dir: ~/.cursor/skills
    enabled: true
sources:
  - id: project-claude
    path: /project/.claude/skills
    scope: project
    enabled: true
router:
  top_k: 5
  engine: bm25   # bm25 | hybrid | external-asf
sync:
  mode: symlink
  conflict: report  # report | skip
```

### 5.2 命令能力（逻辑需求，非最终实现绑定）

| 命令 | 输入 | 输出 |
|------|------|------|
| `doctor` | 无 | 健康报告 exit code 0/1 |
| `inventory` | agent/source/scope 过滤 | 矩阵、冲突、provenance 与胜出原因 |
| `backup` | 目标路径 | backup 路径 |
| `init` | — | 创建 hub 骨架 |
| `ingest` | source dirs | 导入报告 |
| `index` | — | 索引构建报告 |
| `route` | query, top_k, scope | 候选列表与 provenance |
| `explain` | skill name | 来源、scope、冲突、overlay、投影和 history |
| `path` | skill name | canonical/source/Agent target 状态 |
| `history` | optional skill name | append-only 生命周期元数据 |
| `sync` | dry-run/apply | 变更计划/结果 |
| `verify` | — | symlink 完好性 |

### 5.3 路由需求

1. 仅使用 skill **元数据**（name/description/keywords）做默认检索  
2. 默认不把 skill **正文**注入路由结果；提供 `fetch`/`--include-body` 显式开关  
3. 支持中文查询（至少分词/二元语法或等价策略）  
4. 空库、无匹配时返回明确空结果与建议
5. 可选 Jev 决策层返回 Choice 概率、选择、置信度与本地升级建议；默认保持 BM25，远程失败可降级。概率信号不等于执行授权，阈值需要基于本地任务集校准。
6. Skill 在进入 canonical 或投影前可执行只读静态审计；审计不得执行脚本或联网，并能按严重级别返回 CLI/CI 策略码。
7. 在线路由评估须可先在本地预览实际请求体；预览不读取 API Key、不联网，完整查询和候选元数据仅在明确指定私有输出路径时保存。

### 5.3.1 受管 Skill 的只读维护检查

- `check-updates` 区分本地修改与上游更新，只检查已绑定来源；未知状态不能冒称已是最新。
- 列表和更新检查逐项保留错误与健康结果；任何观察失败标记 `complete=false`，而不是返回看似完整的空清单。
- 检查不修改 Skill、来源锁、catalog/index/history 或 Agent 目录；实际写入保留显式确认、本地改动保护与备份/回滚闸门。
- managed update预览提供不含正文的文件/目录/执行位差异与版本绑定token；实际写入必须确认同一目标集合、位置、来源版本和当前内容。旧计划变化时拒绝应用，token不能替代用户授权。

### 5.4 同步需求

1. apply 前若无最近 backup，警告或拒绝（可配置 `require_backup`）  
2. 目标已是指向正确 hub 的 symlink → no-op  
3. 目标是实体目录且内容不同 → **conflict**，不覆盖  
4. 支持按 agent enable 列表过滤
5. 扫描必须识别指向目录的 symlink；坏链与文件 symlink 不应阻断盘点
6. `sync.mode: copy` 必须实际执行实体复制，并继续遵守冲突与 backup 闸门
7. `workspace/project` Skill 默认不投影到全局 Agent；只有显式 scope route/inventory 会读取它们
8. `route` 在 catalog hash 与持久化 BM25 artifact 不匹配时仍可内存查询，但必须返回 freshness 和 `index --rebuild` 建议
9. `explain/path/history` 只读诊断不修改 Skill 目录；history 不保存 `SKILL.md` 正文

---

## 6. 非功能需求（NFR）

| ID | 类别 | 要求 |
|----|------|------|
| NFR-1 | 性能 | route p95 ≤ 50ms @200 skills（冷索引加载另计） |
| NFR-2 | 性能 | index 全量 200 skills ≤ 5s（本机 SSD/外置盘可放宽记录） |
| NFR-3 | 可靠 | 任意失败可解释；exit code 区分 |
| NFR-4 | 安全 | 无默认网络上传用户 skill |
| NFR-5 | 安全 | 破坏性操作需二次确认标志 |
| NFR-6 | 可移植 | 配置路径支持 `~` 与绝对路径 |
| NFR-7 | 可观测 | 关键命令支持 `--json` |
| NFR-8 | 兼容 | Node ≥ 20；macOS 14+ 优先验证 |
| NFR-9 | 可维护 | 符合 HARNESS 质量门槛 |
| NFR-10 | 隐私 | 索引默认本地；telemetry 默认关闭 |

---

## 7. 边界与约束

### 7.1 系统边界

**内**：扫描、合并、索引、路由、分发、备份、报告  
**外**：各 Agent 自身推理循环、第三方 skill 市场、用户 skill 业务语义正确性  

### 7.2 假设

- 用户 skill 遵循 Agent Skills 开放格式（`SKILL.md` + frontmatter）  
- 用户有权读写其 home 下 agent 目录  
- 开发机可安装 Node/pnpm  

### 7.3 依赖

- 可选：agent-skill-finder / neuro-skill 作为外部路由引擎  
- 可选：MCP 客户端宿主  

---

## 8. 验收标准（Release Gates）

### 8.1 文档与工程基线

- [x] 源码可从任意checkout按锁定依赖构建，无固定个人路径要求
- [x] HARNESS / PRD / 架构 / API / 环境 / 运维风险 / 计划齐备  
- [x] 文档索引可导航  
- [x] 目录结构与 HARNESS 一致  

### 8.2 已交付的可复现软件能力

- [x] doctor、inventory、ingest/index/route、safe read/files可运行，合成单元/集成与编译CLI/MCP/HTTP覆盖。
- [x] managed安装/来源锁、检查、预览diff/token、严格写入、备份rollback及同内容来源迁移。
- [x] 显式兼容sync/verify/restore沙箱链路、附件与路径安全检查。
- [x] full/runtime MCP、manifest、静态审计、Web使用率/预算与筛选排序。
- [x] 使用记录默认关闭，坏条目/未知统计/草案评估标签不伪造完成。

### 8.3 单独保留的宿主/生产验收

- [ ] WorkBuddy/Qoder真实模型与GUI新会话回归，不能由配置或MCP连接替代。
- [ ] 完整Owner复核标签与真实BM25/Jev质量/费用/缓存对照；P11-05仍有显式付费/上传授权门禁。
- [ ] 新机器/目标目录的生产迁移须独立dry-run、备份、授权与实际验收，历史本机记录不自动泛化。

### 8.4 产品成功标准（v1）

§2.2的G1–G5是目标，不代表已全部达到；尤其Token降幅、任务质量和宿主覆盖需明确实测。当前证据及缺口见[完成情况复核](../planning/COMPLETION_REVIEW_20261026.md)。

---

## 9. 里程碑映射

| 里程碑 | 对应 |
|--------|------|
| M0 文档基线 | 已完成，当前能力以STATUS/完成情况复核为准 |
| M1 MVP CLI | P0 功能 |
| M2 多端同步生产可用 | P0 sync apply + backup |
| M3 路由增强与 MCP | P1 |
| M4 体验与团队化 | P2 |

详细排期见 `docs/planning/ROADMAP.md`。

---

## 10. 风险（产品视角）

| 风险 | 影响 | 缓解 |
|------|------|------|
| 同名 skill 语义不同 | 错误覆盖 | 冲突报告 + 人工决议 |
| Agent 不认 symlink | 分发失效 | doctor 检测；fallback copy 模式（P1） |
| 路由命中差 | 体验差 | description 治理 + 混合引擎 |
| 外置盘路径/权限 | 开发中断 | doctor；文档注明卷名 |
| 用户误 apply | 数据乱 | 强制 dry-run 习惯 + backup |

详情：`docs/ops/OPERATIONS_AND_RISKS.md`。

---

## 11. 开放问题

1. WorkBuddy 是否需要特殊 loader（相对标准 skills 目录）？  
2. v1 默认引擎用内建 BM25 还是直接集成 ASF？  
3. `~/.agents/skills` 与 `~/.codex/skills` 的优先级策略？  
4. 是否默认把 Claude 全局 skills 目录纳入（当前可能为空）？  

开放问题决策后写入 ADR。

---

## 12. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版 PRD，对齐 HARNESS 文档基线 |


## 13. Phase 5 统一安装入口与接管验收（2026-09-05）

新增目标：独立 Skill 不需要先在任意 Agent 安装，直接由 Hub 从本地/GitHub 安装、记录来源、检查更新并分发。用户自定义改动在更新前显式拦截；scripts/references/assets 和执行位属于被管理版本。

新增能力：install/adopt/update/list、只读 takeover、受管 Skill 的显式单项历史回滚，以及用不同名称 fork 并记录 `overlayOf` 来源关系。验收必须覆盖默认无写入、完整目录冲突、增量 catalog 保留、来源锁、更新备份与失败恢复、回滚前当前树/来源快照/hash 校验、rollback 备份可反向恢复、fork 目录与 frontmatter 名称一致、base 存在性与自引用拒绝、update/rollback 保留 overlay 元数据、Agent symlink 读取更新、copy 附件漂移。本轮不替代宿主插件商店/MCP/授权，也不宣称减少原生技能发现的上下文。

历史 rollback 仅接受 managed update/migrate-source/rollback 生成且含来源锁快照的新备份。旧式备份、canonical 本地改动、来源锁与备份树不匹配时必须拒绝。`overlayOf` 仅保存名称关系，不表示自动合并或运行时继承。

P21-04 来源迁移：单个受管 Skill 显式指定新来源，默认预览旧/新锁与独立确认 token；旧来源失效不妨碍预览，但当前树和新来源必须与安装锁基线完整内容一致。apply 必须重复来源并携带 token/确认，保留 canonical 目录及 overlayOf、建立旧锁恢复点；本地修改、内容升级、自身目录作来源和隐式批量必须拒绝。只读检查错误报告来源及排障提示，不自动猜上游。验收用合成沙箱覆盖本地/Git 来源、漂移拒绝、锁写失败及旧来源锁回滚，不涉及真实用户迁移。

真实多端接管必须另有当前 dry-run、冲突版本决策、备份与 apply 证据。本轮只读报告发现 111 个独立名称、26 项内容冲突、1 项内部环路及2条 Cursor 坏链；130个插件/系统条目列 external。该统计只覆盖配置和已知缓存路径，不等于递归检查整台电脑的每个项目。


## Phase 6 — Agent 零单项 Skill 安装

用户明确默认由 Hub 按需提供 Skill。验收要求：完整目录可分页浏览；精确指定无需检索；附件按根内相对路径读取；长文可续读并校验实际 hash；缺失/越界/无效分页明确拒绝。OpenCode 真实模型必须留下 Hub 工具轨迹；原生 Skill 工具不可用。原有独立 Skill 文件与其他 Agent 配置保留；全库读取与代表任务验证不等于执行所有技能脚本。旧目标中的 token 降幅须实测，不能将文件字符估算当作实际节省。

## 公开源码发行（2026-10-09）

仓库自身源码/文档采用MIT，从源码构建；不进行npm自动发布。公开入口以README和STATUS为准。社区规范、Issue/PR模板、CI/Dependabot、文档链接和sandbox验收是本次交付范围；宿主模型回归和新的产品能力不因仓库公开自动算完成。

## 检索质量与内容漂移验收（2026-10-12）

- 显式Skill名称与顶层keywords具有实际字段权重，避免重复拼接被去重抵消；中文多字查询不因共用单字召回无关Skill。
- 合成回归区分网页端生成、API/mmx生成和歌单推荐，覆盖中英文查询及内存/持久化一致性；不将用户Skill正文放进公开测试。
- 索引“最新”必须检查当前登记的SKILL.md内容hash；缺失、不可安全读取或算法版本过期须提示原因和刷新建议。附件漂移、跨语言语义匹配及自动修复仍不属于本次承诺。
- 真实库验证MiniMax网页端查询能召回具有web后端的Skill；回归只检索与加载，不生成音乐或验证音乐网站可用性。

## 精简运行时与计量验收（2026-10-12）

可选runtime只提供搜索/读取/附件发现，full保留兼容。原生发现禁用是宿主验收，不能由MCP连接状态推断。10/100/1000项合成库中初始化定义大小应固定，分页和拒绝越界保持一致。协议字节、宿主报告Token、缓存及真实计费分别记录；缺少数据保留null，不以字符估算替代。真实小样本用于验证链路，完整Native/Hybrid/Hub-only及质量标注集尚待验收。

复核补充：Native/Hybrid/Hub-only真实元数据两任务试验及50条任务草案已执行，见RUNTIME_REVIEW_20261012；生产业务质量/重复采样仍未验收。多字中文继续bigram降噪，仅明确单字查询专用回退。无Skill任务返回候选不构成激活许可，不将BM25 raw score当标定置信度。

## 本地使用观测与上下文预算（P23-01 · 2026-10-26）

提供可选本地search/read元数据日志和只读usage报告，区分候选出现、正文首段、分页续读、附件读取及错误，按CLI/MCP/Web/library分组并记录最近读取时间、返回文本字符/字节及粗估Token。不存query/正文/附件路径，不上传；默认关闭，仅显式环境变量配置的进程写独立日志，既有Skill/catalog/history不变。无历史保留未知，重复首段不冒充唯一任务；Hub服务读取不证明实际采用、执行或任务成功，原生磁盘读取不在覆盖范围。

context-cost分别报告name/description元数据、当前SKILL.md全文和可配置首段的长度与启发式估算，默认不含附件，不假设全库注入。字符/字节与模型Token分列，公开版本化算法，不保证误差范围；真实模型Token、费用保持null。可显式给上下文窗口计算首段比例，不猜宿主配置、剩余预算或缓存收益。坏条目不记零；部分报告标不完整，估算操作不污染使用记录。P23-01先实现CLI/library；P23-02增加下述Web展示，模型tokenizer适配仍为后续独立需求。详见[使用观测与上下文预算](../ops/USAGE_AND_CONTEXT.md)。

P23-02验收：Web主导航提供“使用与预算”，展示使用率、首段次数、续读/附件/候选、最近读取、元数据/全文/首段预算。使用率按所选日期/来源的当前全库首段读取次数作固定分母，分类/关键词/观测状态过滤不改变分母；支持使用率升降序、最近读取、正文Token升降序与名称排序，先全局过滤排序再分页，未知末尾。未记录历史不伪造0%，无分母不算百分比，小样本有提示；默认MCP，Web人工浏览可显式选择。合成API回归与ego-browser桌面/375px交互验收，不开启真实使用记录、不执行Skill内容。

## FR-P26 — Streamable HTTP 托管（2026-10-29 撤回）

按用户要求从当前源码移除 HTTP MCP 传输、配置和部署入口；MCP 继续使用 stdio，Web REST 不作为远端 MCP。已发布 npm 0.2.1 的历史字节不修改；不新建公网服务、迁移用户 Skill 或发布新版本。见[当前远端边界](../ops/REMOTE_MCP.md)。

### FR-P26-02 — npm命令分发

提供单个候选包及CLI/stdio/Web三个命令，安装时无需内部workspace包已发布；源码保留private、无install hook。以真实tarball安装、npm exec、配置模板/profile及MCP协议验收，CI加入独立包门禁。包内容/安装成功与注册库发布分开记录；发布需有效身份、包名权限、精确tarball与registry integrity回执。npm不承担远端运行托管；HTTP命令已从当前源码候选移除，已有发布记录保留。

### FR-P26-04 — 自动发布验收

Owner追加要求后续通过GitHub Actions自动发布。采用npm Trusted Publishing OIDC，不存长期token；标签对应版本、提交已合入main、全部CI/包验收通过后才发布，人工workflow dispatch只dry-run。首次以0.2.1真实发布/官方registry integrity/新prefix安装验收证明链路；后续按版本标签触发。不得将信任配置或dry-run当已发行。

## 2026-10-29 审查修复验收补充

- 失败恢复应覆盖旧目录移动、根 `.git` 移动、发布与来源锁写入失败；原内容/元数据和来源锁保持一致，不能把普通失败误判为并发变更而跳过恢复。
- 根 `.git` 的目录、worktree 文件与外部链接按原对象保留；指向 Skill 内部内容的根 `.git` 引用及 canonical 嵌套 `.git` 在替换前拒绝。成功事务清理已知且未变的快照；检测到未知/修改内容保留证据并显式报错。
- manifest 与离线/在线评测的输出不得覆盖其输入 catalog、dataset 或 manifest 使用的配置，路径别名同样拒绝；在线检查先于凭据读取和网络请求。
- 显式内置来源 ID 在已有 Agent 配置时使用已配置路径，盘点去重与默认导入范围不扩大；usage 对单事件大小范围内超过100项的搜索仍完整记录候选，并只计算一次搜索。
