# 任务看板 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 最后更新 | 2026-10-09 |
| 当前焦点 | **Phase 15 公开发布文档/社区规范/CI与隔离验收** |
| 用法 | 领取任务时改 Status/Owner；完成时改 `done` 并写 PROGRESS |

**状态**：`todo` | `in_progress` | `blocked` | `done` | `cancelled`

---

## 当前焦点

**Phase 0 / Phase 1：完成**  
**Phase 2：backup / apply / verify / restore 已实现 + 沙箱演练**  
**生产 backup：双副本 `20260810-204134` + 恢复手册**  
**真实验收：`outputs/acceptance-report-20260810.md`（V0/V1 ✅）**  
**B 档 create-only + agnes update + 全套 replace-real：`outputs/acceptance-wb-full-replace-real.md`（workbuddy ✅）**  
**其它端 apply / restore --apply：仍须 Owner 明确授权**

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
| P11-03 | 最小 `available_skills` manifest 导出 | todo | agent | OpenSkills 风格 name/description + Hub 读取提示；原子写与 dry-run |
| P11-04 | pin/rollback/overlay/fork 工作流 | todo | agent | 来源 commit、tree hash、覆盖关系、失败恢复与迁移说明 |
| P11-05 | Jev 评估集与 CI 发布门禁 | todo | agent | ≥30 条匿名任务、BM25 对照、延迟/费用/升级率、全量 workflow |

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

## 看板维护规则

1. 同时 `in_progress` 建议 ≤ 3  
2. 完成必须写 `PROGRESS.md` 一条  
3. 取消任务写明原因  
4. 新增任务用 `P{阶段}-{序号}`  
