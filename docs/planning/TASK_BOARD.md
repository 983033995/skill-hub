# 任务看板 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 最后更新 | 2026-10-26 |
| 当前焦点 | **P25 全盘复核与公开文档交付；P11-05 仍待 Owner 标签/付费上传授权** |
| 用法 | 领取任务时改 Status/Owner；完成时改 `done` 并写 PROGRESS |

**状态**：`todo` | `in_progress` | `blocked` | `done` | `cancelled`

---

## 当前焦点

- 已实现：受管安装/更新/回滚/同内容来源迁移、按需 MCP、Web 使用率与预算、主流 Agent 来源盘点。
- 当前复核：见 [2026-10-26 完成情况审计](COMPLETION_REVIEW_20261026.md)；历史条目的测试数量与部署记录只描述当时状态。
- 待完成：Owner 复核路由标签及显式 live Jev 授权；WorkBuddy/Qoder 模型/GUI 回归；远端 MCP 与自动升级等尚未实现。
- 生产 Skill、客户端配置和运行服务变更仍须按当前任务的显式授权范围执行。

---

## Phase 0 — 文档与工程基线

| ID | 任务 | Status | Owner | 产出 |
|----|------|--------|-------|------|
| P0-01 | 在 AI 目录创建 skill-hub 工程树 | done | agent | 目录骨架 |
| P0-02 | 编写 HARNESS.md | done | agent | `HARNESS.md` |
| P0-03 | 编写 AGENTS/README/INDEX | done | agent | 根文档 |
| P0-04 | 编写 PRD 与用户场景 | done | agent | `docs/product/*` |
| P0-05 | 编写架构/API/数据模型 | done | agent | `docs/architecture/*` |
| P0-06 | 编写环境与运维风险 | done | agent | `docs/ops/*` |
| P0-07 | 编写 ROADMAP/看板/进度 | done | agent | `docs/planning/*` |
| P0-08 | 模板与 ADR 初稿 | done | agent | `docs/templates/*` `docs/adr/*` |
| P0-09 | 配置模板与质量门禁清单 | done | agent | `configs/*` `docs/harness/*` |
| P0-10 | gitignore/editorconfig 基线文件 | done | agent | 根配置 |

---

## Phase 1 — MVP CLI

| ID | 任务 | Status | Owner | 依赖 | 说明 |
|----|------|--------|-------|------|------|
| P1-01 | 初始化 pnpm monorepo 与 tsconfig | done | agent | P0 | package.json / workspace / vitest / eslint |
| P1-02 | 实现 `@skill-hub/shared` | done | agent | P1-01 | 错误码、路径、logger |
| P1-03 | 实现 `@skill-hub/core` scan/parse | done | agent | P1-02 | fixture 覆盖 |
| P1-04 | catalog 读写与 conflict 检测 | done | agent | P1-03 | |
| P1-05 | 实现 `@skill-hub/router` BM25 | done | agent | P1-04 | |
| P1-06 | 实现 `@skill-hub/sync` plan（dry-run） | done | agent | P1-04 | 不 apply |
| P1-07 | CLI：doctor / inventory | done | agent | P1-03 | 只读 home |
| P1-08 | CLI：init / ingest / index / route | done | agent | P1-05 | |
| P1-09 | CLI：sync --dry-run | done | agent | P1-06 | `--apply` 拒绝 |
| P1-10 | 单测 + 集成测 fixture 闭环 | done | agent | P1-08 | 33 tests |
| P1-11 | 更新 API.md 实现状态与 README 快速开始 | done | agent | P1-10 | |
| P1-12 | 本机只读 inventory 报告归档到 outputs/ | done | agent | P1-07 | `outputs/inventory-readonly.md` |

---

## Phase 2 — 生产同步

| ID | 任务 | Status | Owner | 依赖 |
|----|------|--------|-------|------|
| P2-01 | backup 命令与 manifest | done | agent | P1 |
| P2-02 | sync --apply symlink | done | agent | P2-01 |
| P2-03 | verify + 死链修复建议 | done | agent | P2-02 |
| P2-04 | restore 最小实现 | done | agent | P2-01 |
| P2-05 | 三端真实演练 + 回滚演练记录 | done | agent | P2-04 |
| P2-06 | 生产 backup 双副本 + 恢复手册 | done | agent | P2-01 |
| P2-07 | 真实验收 V0/V1 + materialize ingest | done | agent | P2-06 |
| P2-08 | create-only sync apply（跳过真实目录 conflict） | done | agent | P2-07 |
| P2-09 | replace-real：真实目录 stash 后换链 | done | agent | P2-08 |
| P2-10 | workbuddy 全套 replace-real apply 验收 | done | agent | P2-09 |

---

## Phase 3 — MCP 与增强

| ID | 任务 | Status | Owner | 依赖 |
|----|------|--------|-------|------|
| P3-01 | mcp-server skill_search/fetch/stats | done | agent | P1-05 |
| P3-02 | profiles 过滤 | done | agent | P1-05 |
| P3-03 | external engine 适配接口 | done | agent | P1-05 |
| P3-04 | 集成文档（各 Agent） | done | agent | P2/P3-01 |
| P3-05 | 路由评估 10 任务 | done | agent | P3-02 |

---

## Blocked

| ID | 原因 | 需要谁 | 备注 |
|----|------|--------|------|
| 生产 apply | 代码已支持，但默认不对 home skills 写入 | script | 需口头/文字授权后再执行 |
| 生产 restore --apply | 备份已就绪，仅 dry-run 验证过 | script | 非故障勿授权；见 runbook |

---

## Phase 4 — 可靠性与作用域

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P4-01 | symlink-aware scanner：目录链、坏链、文件链、环路 | done | agent | core 测试 + 真实只读 inventory |
| P4-02 | `sync.mode=copy` 计划/apply/verify fallback | done | agent | 沙箱 copy 闭环 + conflict/backup 闸门 |
| P4-03 | SkillMeta scope/provenance/revision 最小模型 | done | agent | 旧 catalog 兼容；同名胜出原因可解释 |
| P4-04 | index freshness 与持久化语义收敛 | done | agent | catalog hash + bm25 artifact + stale route 建议 |
| P4-05 | project/workspace sources 与 route scope 过滤 | done | agent | 显式本地 Skill source；只识别 SKILL.md，不导入普通 Markdown |
| P4-06 | explain/path/history/overlay | done | agent | CLI/API 只读诊断；ingest/index/sync history |

---

## Phase 5 — 本地 Skill 统一接管（2026-09-05）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P5-01 | GitHub 同类项目对比与本机接管盘点 | done | agent | 引用一手资料；只读盘点和迁移报告 |
| P5-02 | Hub 安装/更新来源追踪与本地改动保护 | done | agent | 本地/Git 来源直接安装 Hub；更新预览；沙箱测试 |
| P5-03 | 导入/同步数据完整性与接管闭环 | done | agent | 增量导入不丢 catalog；附件漂移可检测；冲突不覆盖；沙箱验收 |


| P5-04 | 原 symlink 全端接管（由 P6 按需加载替代） | cancelled | Owner + agent | 先归档3个精确异常链接，再新备份→导入→sync→verify；26冲突版本需选择 |

## Phase 6 — Hub 按需加载与 OpenCode 零安装验收（2026-09-05）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P6-01 | 统一目录、分页正文及安全附件读取 | done | agent | CLI/MCP 共用；遍历与越界链接拒绝；长文可续读 |
| P6-02 | CLI/MCP 运行时入口与使用引导 | done | agent | browse/read/files；精确指定、搜索后加载；不建议默认 sync |
| P6-03 | OpenCode 真实零原生 Skill 验收及文档 | done | agent | MiniMax-M3 七场景/七断言通过；105项MCP读取；OPENCODE_HUB与报告 |

原 P5-04 的 symlink 生产接管方案不再执行；用户明确以 Hub MCP 按需加载为目标。内容扫描、成本审计、使用反馈和语义检索按验收需要逐步补充，不将预留能力标为完成。

## Phase 7 — Web 只读视图（2026-09-06）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P7-01 | apps/web 只读 HTTP API（复用 router hub-service，bind 127.0.0.1） | done | agent | 端点对齐 MCP 契约；无写操作 |
| P7-02 | Web 前端 SPA：浏览/检索/详情/文件树/history | done | agent | 深色主题；Markdown 渲染；分页 |
| P7-03 | 门禁 + 实机验证 + 文档同步（API/INDEX/ROADMAP/PROGRESS） | done | agent | typecheck/lint/test 通过 |
| P8-01 | llm 模块：可选模型配置（models.yaml/json + 环境变量）、OpenAI 兼容与 Ollama Provider、降级 | done | agent | 未配置=disabled 不抛错；配置错误友好提示 |
| P8-02 | Web /api/llm/status 端点 + 前端状态芯片 | done | agent | probe 健康探测；不影响只读主流程 |
| P8-03 | configs/models.yaml 示例 + docs/architecture/MODELS.md + 门禁 | done | agent | build/lint/test 全绿（117） |

## Phase 9 — Jev 可选语义路由（2026-09-23）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P9-01 | `external-typesafe` RouterEngine：Jev Choice 概率排序 | done | agent | 只发送 Skill 元数据；Top-K 概率排序；缺 Key/失败自动 BM25 |
| P9-02 | CLI/MCP/Web 暴露 engine 选择与运行文档 | done | agent | `--engine external-typesafe`、MCP/Web `engine` 参数、API/ADR 同步 |
| P9-03 | Jev 真实调用、BM25 对照与回退验收 | done | agent | 真实 catalog 调用通过；无 Key 回退通过；单测/构建/lint 通过 |

## Phase 10 — Jev 决策信号与证据归档（2026-10-05）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P10-01 | 将外部 Jev 观察归档为设计输入 | done | agent | 研究文档、文档索引与验证边界齐全 |
| P10-02 | Router 暴露 Choice 决策元数据 | done | agent | CLI/MCP/HTTP 一致性集成测试；构建CLI真实Jev响应通过 |
| P10-03 | 配置优先级、回包契约与候选超限回退 | done | agent | 显式空 key 不被环境变量覆盖；异常回包拒绝；build/query 失败回退；136项测试及全量门禁 |

## Phase 11 — 竞品调研与安全落地（2026-10-06）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P11-01 | 一手竞品/规范/决策项目调研与功能排序 | done | agent | GitHub README/API/规范入口归档；星数不作为质量证明 |
| P11-02 | Skill 静态安全审计 core/CLI/MCP/Web | done | agent | 只读、不联网、不执行；CLI 策略码；三面一致性回归 |
| P11-03 | 最小 `available_skills` manifest 导出 | done | codex | name/description + Hub 提示；完整分页；默认 dry-run；`--apply --yes` 原子写普通文件；拒绝 symlink/目录；162 测试及 smoke 通过 |
| P11-04 | pin/rollback/overlay/fork 工作流 | done | codex | SHA pin 与来源锁迁移说明；rollback dry-run/锁快照/hash校验/反向恢复；复制改名 fork + `--overlay-of` 持久化、更新/回滚保留；overlay 不自动合并；dangling base 需人工维护；170 测试与隔离 smoke 通过 |
| P11-05 | Jev 评估集与 CI 发布门禁 | blocked | codex | 技术预备项完成：v1 固定 50 条（30/15/5）合同、离线 BM25、无网络本地 preview、Owner 复核工作表；解除阻塞需 Owner 复核标签、提供显式 catalog 路径，并授权最多 50 次付费 TypeSafe 请求及上传 query/candidate metadata；标签正确性和真实 Jev 指标仍未验收 |

## Phase 12 — OpenCode Hub-only 真实回归（2026-10-06）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P12-01 | 隔离 OpenCode 配置并将默认入口切到 Hub-only | done | agent | `~/.local/bin/opencode` 包装器生效；tools.skill=false；磁盘 Skill 发现=0；原配置和原目录保留 |
| P12-02 | 当前 catalog stdio MCP 全量读取/Hash 验收 | done | agent | 110/110 Skill 正文和目录读取一致，无错误 |
| P12-03 | OpenCode 真实模型八场景 + humanizer-zh 回归 | done | agent | 8/8 场景（含不指定 Skill 的内容自动路由）、Hub-only 工具轨迹、更新后新会话通过 |

## Phase 13 — WorkBuddy 按需接入（2026-10-06）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P13-01 | 备份并正式停用用户Skill，保留其它工具 | done | agent | 147名称off、原生Skill拒绝配置、Hub MCP启用、自定义指引追加；备份hash核对 |
| P13-02 | 配置入口stdio MCP验证 | done | agent | 11工具/110项catalog；内容搜索humanizer-zh和读取成功 |
| P13-03 | WorkBuddy新会话模型回归 | todo | agent + user | 未重启运行中任务；UI不可操作；内置Skill发现不能宣称为0 |

## Phase 14 — Qoder 正式接入（2026-10-06）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P14-01 | 备份Qoder配置，停用原生Skill并启用Hub | done | agent | skills.enabled=false；provider/其它17个MCP保留；99个Skill目录保留 |
| P14-02 | Qoder配置和真实运行时初始化验证 | done | agent | 独立MCP搜索/读取通过；安装包runtime初始化skills=[]、Hub connected、11工具 |
| P14-03 | Qoder真实模型及GUI新会话回归 | todo | agent + user | CLI返回Not logged in；GUI任务输入未成功；不宣称模型通过 |

## Phase 15 — 开源发布（2026-10-09）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P15-01 | 公共README/状态/操作文档与开源社区规范 | done | agent | 中英README、MIT、贡献/安全/行为规范、API/状态真实对齐 |
| P15-02 | CI/文档链接/隔离smoke与发布检查 | done | agent | 本地门禁、无凭据历史扫描、fixture链路；远端Actions实际结果 |
| P15-03 | 提交推送并将GitHub仓库公开 | done | agent | 当前与远端SHA一致、visibility=public、安全和协作设置 |

## Phase 16 — PR兼容性检查与Jev配置说明（2026-10-09）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P16-01 | 5个开放Dependabot PR逐项评估 | done | agent | 精确SHA/CI/失败日志与SDK隔离回归；不绕过main检查 |
| P16-02 | Jev token与CLI/MCP/GUI设置文档 | done | agent | 官方Key页面、引擎选择、变量/进程继承、无自动.env/Keychain误解 |

## Phase 17 — 依赖合并与远端MCP说明（2026-10-09）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P17-01 | 更新基线并顺序合并#5/#1/#2/#3 | done | agent | 每个新head三组CI成功/CLEAN，精确SHA合并；#4不动 |
| P17-02 | 同步合并后本地/远端验证与文档 | done | agent | frozen-lockfile/typecheck/build/lint/test/docs/smoke和最终main CI |
| P17-03 | 说明远端MCP当前支持与部署边界 | done | agent | stdio与HTTP/REST区别、服务端持久Skill、HTTPS/鉴权、两种token；不部署 |

## Phase 18 — MiniMax网页端音乐检索诊断（2026-10-12）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P18-01 | 区分Skill能力、元数据、排序和索引漂移 | done | agent | 7次真实MCP搜索、7查询×2元数据内存对照、正文/脚本核对；docs:check通过；不生成音乐或改个人配置 |
| P18-02 | 修复目标Skill网页端元数据及Hub词项权重/中文噪音 | done | agent | 真源备份/预览；六条部署MCP查询首位；OpenCode真实默认模型通过搜索/加载/附件识别 |
| P18-03 | 内容漂移和算法版本检查，刷新部署并同步文档 | done | agent | 旧索引拒绝、hash漂移/坏链提示；156测试及完整门禁通过；ChatCut既有缺失保留，旧连接需重连 |

## Phase 19 — 精简运行时与开销证据（2026-10-12）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P19-01 | 核对会话建议和官方宿主发现边界 | done | agent | 官方预算与单项禁用文档；Codex当前非零注入，Host/完整A-B-C保持未验证 |
| P19-02 | 可选三工具runtime MCP与紧凑返回 | done | agent | 默认full兼容、隐藏调用拒绝、读取/附件/分页；实际部署三工具握手/音乐检索读取通过 |
| P19-03 | 可复现MCP开销测量及真实OpenCode验证 | done | agent | 10/100/1000实际stdio字节；同模型full/runtime四场景成功，原始用量保留；完整Native A/B另列待办 |

## Phase 20 — 复核修正与召回/宿主基线（2026-10-12）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P20-01 | 修正跨模式引导与英文措辞 | done | agent | 项目/宿主指南统一read；Qoder已有全局段备份后更新；runtime指引回归 |
| P20-02 | 建立含无Skill任务的召回集，比较中文分词 | done | agent | 50草案标签、30需Skill/15无需/5单字；主Recall28→29/30，单字回退恢复2/5 |
| P20-03 | 确认旧artifact回退，建立Native及Codex隔离证据 | done | agent | 旧artifact memory回退测试；Native六模型任务通过；Codex临时HOME58enabled→0但不声明零注入 |
| P20-04 | 完整验证、文档与按逻辑拆分提交 | done | agent | router、runtime/benchmark、文档三组本地提交；159测试/完整门禁；个人Skill/凭据/outputs不进Git |

## GitHub 贡献治理（2026-10-24）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| GOV-01 | main强制PR、双语Issue表单与贡献文档 | done | codex | ruleset要求PR/三组CI/讨论解决；Issue使用Bug/Feature表单或私密安全渠道；Actions本地门禁通过 |

## 看板维护规则

1. 同时 `in_progress` 建议 ≤ 3  
2. 完成必须写 `PROGRESS.md` 一条  
3. 取消任务写明原因  
4. 新增任务用 `P{阶段}-{序号}`  

## 单技能维护接入（2026-10-21）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| OPS-QWEN-01 | qwen-image-edit 统一到 skills 项目并补生成/4K/8K能力 | done | codex | 单源链接；Hub fetch/首位路由；32测试、结构/审计；真实生成/编辑/4096×2304/8192×4608 |

| OPS-H3-01 | HomeHub已验H3流程沉淀、OpenMontage/CreatorOps路由与单技能投影 | done | codex | 单真源/4链接；结构、附件、持久fresh路由、真实MCP读取与独立情境审阅；Windows8文件SHA回执；无生成/服务切换 |

## Phase 21 — 本地 Skill 管理体验与 DSH 调研（2026-10-25）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P21-01 | DSH本地Skill管理与下一步优化调研 | done | codex | 用户已确认MichengAI/dsh-skills-manager；固定公开仓库SHA、源码/官方文档/远端CI状态核对、DeepSeek审查；研究报告与建议顺序；未实施代码/安装/用户目录写入 |
| P21-02 | 统一只读来源更新检查与列表容错 | done | codex | check-updates独立local/upstream/applyBlocked；逐项错误+complete/退出3；单次同repo/ref共享临时快照；list保留健康项、扫描失败不冒充删除；dry-run文案修正；45文件/199测试与smoke通过；既有授权真实只读检查/状态内容哈希未变；apply保护不变 |
| P21-03 | 文件级差异与版本绑定确认计划 | done | codex | update预览返回文件/目录/执行位差异和planToken；写入必须绑定token+apply/yes，漂移拒绝；ADR0011记录v0.x兼容变化；47文件/209测试、强制构建及smoke通过；真实Skill未升级 |
| P21-04 | 显式受管来源迁移与来源失效诊断 | done | codex | migrate-source单项同内容迁移；旧/新锁预览、独立planToken、canonical目录保留、旧锁备份/rollback、上游错误路径与hint；拒绝本地修改/来源漂移/自引用；49文件220测试（maxWorkers=2）、强制构建/lint/docs/eval/smoke通过；仅合成沙箱，真实来源未迁移 |

## Phase 22 — Web 视觉与交互重构（2026-10-26）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P22-01 | 重设计只读 Web 的技能库、详情与多端盘点视图 | done | agent | 保留现有 API 与只读行为；统一视觉系统、响应式与键盘可用性；桌面/375px 浏览器验收、49 文件/220 项测试及完整相关门禁通过 |

## Phase 23 — 使用观测与上下文预算（2026-10-26）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P23-01 | 本地使用统计与静态上下文估算 | done | codex | 显式可选search/read日志；CLI/MCP/Web/library归因、首段/续读/附件分列；不存query/正文；usage与context-cost报告、完整性/未知状态、字符/字节/启发式Token与实际账单区分；ADR0012及手册；新增11项回归，当前工作树53文件237测试及相关门禁通过；未改真实客户端配置/开启生产记录 |
| P23-02 | Web使用率与上下文预算、筛选排序 | done | codex | /#/usage与只读usage-overview API；使用率固定日期/来源全库首段分母，过滤/全局排序后分页、未知末尾；时间/来源/分类/关键词/状态过滤；预算字符/字节/Token及首段/续读分列；5项API回归、ego-browser桌面1360/375px交互通过、54文件242测试与相关门禁；独立只读真实库预览可看，未改旧4173/启用记录 |

## Phase 24 — 主流 Agent Skill 来源（2026-10-26）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P24-01 | 补充 DeepSeek Harness 与主流 Agent 来源 | done | codex | 官方路径核对；CLI/MCP/Web 共用10个内置来源路径，既有配置可见；显式覆盖/停用、路径去重、scope/ID过滤、显式选源导入；6项新增回归，全量53文件237测试及相关门禁通过；不扩展同步目标、不改用户配置、不重启服务 |
| P24-02 | 修正 Web Agent 目录展示并核对运行实例 | done | codex | 展示修正；6项相关回归/build/lint通过；用户明确授权后仅重启4173本项目Web，原地址HTTP/ego-browser确认15目录与用途，DeepSeek默认根如实显示缺失，无横向溢出 |
| P24-03 | 澄清目录状态与 Agent 安装状态 | done | codex | 只读确认DSH应用运行、数据根存在而原生skills子目录不存在，桌面已登记Hub MCP；Web改为目录状态/目录未找到及明确提示，原4173 ego-browser验收；lint/Prettier/docs/diff-check通过，不创建目录/改用户配置/重启服务 |


## Phase 25 — 项目复核与公开文档交付（2026-10-26）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P25-01 | 全盘完成情况审计与README/文档重整 | done | codex | 最新main隔离整合，Vitest4下54文件242测试；中英文README/合成截图/可复现沙箱；数据模型、运维、交接及完成矩阵刷新；个人笔记仅公开摘要；本地门禁通过，发布回执以实际PR/Actions为准 |

## Phase 26 — Streamable HTTP 托管（2026-10-26）

| ID | 任务 | Status | Owner | 验收 |
|----|------|--------|-------|------|
| P26-01 | 共享MCP处理器、独立HTTP入口和托管说明 | done | codex | 真实SDK/编译HTTP进程、SSE/中文检索/分页附件、鉴权与限制/断开超时回归；55文件251测试及完整门禁通过，公网部署另验 |
| P26-02 | 单包npm发行准备及真实安装验收 | done | codex | 0.2.0候选、93文件/143114字节；真实npm安装/exec及CLI/stdio/HTTP/Web验收，保留workspace private；本地门禁通过 |
| P26-03 | npm注册库发布与回读安装验收 | done | codex | @zhangheteng/skill-hub@0.2.0已发布，官方registry字节/integrity与新prefix CLI/stdio/HTTP/Web回读通过 |
| P26-04 | GitHub Actions OIDC自动发布 | in_progress | codex | 完整CI/标签版本与main祖先校验、精确tarball、registry回读、npm信任绑定及0.2.1真实Action回执 |
