# 开发计划 / 路线图 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-16 |
| 对齐 | `HARNESS.md` · `PRD.md` |
| 进度入口 | `TASK_BOARD.md` · `PROGRESS.md` |

---

## 1. 节奏原则

1. **先文档后代码**：Phase 0 未完成不开启大规模实现分叉  
2. **垂直切片**：每个里程碑交付可演示闭环，而非“全横切开花”  
3. **安全优先**：sync apply 永远落后于 dry-run/backup 能力  
4. **可持续更新**：里程碑状态只在 `ROADMAP` 改；日常任务在 `TASK_BOARD`；流水账在 `PROGRESS`  

---

## 2. 阶段总览

| 阶段 | 名称 | 目标 | 状态 |
|------|------|------|------|
| **Phase 0** | 工程化文档基线 | HARNESS + PRD + 架构 + 计划可支撑开发 | **Done（2026-08-10）** |
| **Phase 1** | MVP CLI | doctor/inventory/ingest/index/route/sync dry-run | **Done（2026-08-10）** |
| **Phase 2** | 多端生产同步 | backup + apply + verify + 沙箱演练 | **Done（能力 2026-08-10；生产 apply 待授权）** |
| **Phase 3** | 路由增强与 MCP | hybrid/MCP/hooks 文档与集成 | **Done（2026-08-10）** |
| **Phase 4** | 可靠性与作用域 | symlink/copy 投影、scope/provenance、索引 freshness、可解释同步 | **In progress（P4-01~06 核心切片完成）** |

---

## 3. 里程碑详情

### M0 — 文档与仓库骨架（Phase 0）

**完成标准**（DoD）：

- [x] 项目位于 `/path/to/skill-hub`
- [x] `HARNESS.md` / `AGENTS.md` / `README.md`
- [x] PRD、架构、API、数据模型
- [x] 环境、运维风险
- [x] ROADMAP、TASK_BOARD、PROGRESS
- [x] 模板与首批 ADR
- [x] 目录与 monorepo 骨架  

**出口**：可直接开 Phase 1 任务，无需再猜规范。

---

### M1 — MVP CLI（Phase 1）

**时间盒建议**：1–2 个迭代（按投入灵活，不以虚假日期锁死）

**交付**：

| 包/应用 | 能力 |
|---------|------|
| shared | 错误码、路径、logger |
| core | scan/parse/conflict/catalog |
| router | BM25 索引与 query |
| sync | plan only（dry-run） |
| cli | doctor, inventory, init, ingest, index, route, sync --dry-run |
| tests | unit + fixture integration |

**DoD**：

- [x] `pnpm test` 绿（33 tests）  
- [x] fixture 闭环：ingest→index→route  
- [x] 对本机 skill 只读 inventory 成功（`outputs/inventory-readonly.md`）  
- [x] API.md 标注实现状态更新  

**依赖**：无（本地）  
**风险**：外置盘 IO；Node 工具链初始化 

---

### M2 — 安全分发（Phase 2）

**交付**：

- backup / restore（最小）  
- sync --apply（symlink）  
- verify  
- 至少接入 workbuddy + cursor + codex（或 agents）  
- 回滚演练记录写入 PROGRESS  

**DoD**：

- [x] require_backup 生效（CLI：`--backup-dir` + manifest）  
- [x] 冲突不覆盖（真实目录 → conflict）  
- [x] 沙箱 verify 通过（`outputs/phase2-sandbox-drill.md`）  
- [ ] 用户确认后的真实多端 apply 有备份路径可查（待授权）  

**依赖**：M1  
**风险**：R1/R2（见运维风险）  

---

### M3 — 智能增强（Phase 3）

**交付**：

- MCP server 只读工具  
- profile 过滤  
- 可选 external engine（ASF/neuro-skill）适配层  
- Agent 集成文档（Claude/Codex/Cursor/WorkBuddy）  
- 中文查询改进  

**DoD**：

- [x] MCP 在至少 1 个宿主可用（stdio Client 冒烟 + 配置文档 WorkBuddy/Cursor）  
- [x] 10 条真实任务路由评估表（`outputs/phase3-route-eval.md`，Hit@1=10/10）  
- [x] token 节省粗测记录（相对全量 description ≈ **97%** 字符层）  

**依赖**：M2（可部分与 M2 并行：MCP 只读）  

---

### M4 — 体验与规模（Phase 4）

**交付**：

- [x] symlink-aware inventory/doctor 扫描
- [x] symlink / copy 双投影模式与 verify
- [x] user/workspace/project scope 与 provenance 最小模型
- [x] 显式 Skill sources、inventory/route scope 过滤与冲突胜出解释
- [x] index freshness 与可加载 BM25 artifact
- [x] explain/path/history/overlay 只读诊断
- skill description lint
- depends_on 图扩展（可选）  
- 团队 git 同步指南  
- 可选轻量 GUI 或 TUI  
- Windows 调研备忘  

**DoD**：P0 投影可靠性、P4-03 scope/provenance、P4-05 sources/route scope、P4-04 index freshness/artifact、P4-06 explain/path/history 已完成；后续重点转向真实多端授权、Agent Trust 与规模评估。

---

## 4. 工作分解结构（WBS 摘要）

```text
skill-hub
├── P0 文档基线 ..................... Done
├── P1 平台与工具链
│   ├── monorepo 初始化（package.json/pnpm/tsconfig）
│   ├── CI 雏形（typecheck/lint/test）
│   └── shared 基础库
├── P1 领域核心
│   ├── core 解析与 catalog
│   ├── router BM25
│   └── sync plan
├── P1 CLI 装配与测试
├── P2 备份与 apply
├── P3 MCP 与集成
└── P4 增强项
```

细粒度任务见 `TASK_BOARD.md`。

---

## 5. 责任模型

| 角色 | 谁 | 职责 |
|------|----|------|
| Product Owner | script | 优先级、验收、生产 apply 授权 |
| Tech Lead / Implementer | script 或 Agent | 设计落地、代码、测试 |
| Doc Owner | 与实现者同一 | 文档同步 |
| Reviewer | script（或第二 Agent） | PR 审查 |

单人模式下：**实现者必须用 PR 自查清单代替“第二人”**。

---

## 6. 进度追踪机制

| 机制 | 文件 | 更新频率 |
|------|------|----------|
| 里程碑状态 | `ROADMAP.md` | 阶段完成时 |
| 任务看板 | `TASK_BOARD.md` | 领取/完成时 |
| 进度日志 | `PROGRESS.md` | 每次实质交付追加 |
| 决策 | `docs/adr/*` | 架构分叉时 |
| 质量门禁 | `docs/harness/QUALITY_GATES.md` | 门禁变更时 |

### 状态枚举（任务）

`todo` → `in_progress` → `blocked` → `done` → `cancelled`

### 迭代建议

- 每个迭代结束：整理 PROGRESS 三条结论 + 下迭代 TOP 5 任务  
- 被 block 超过 48h：升级到 Owner 决策（开放问题/ADR）  

---

## 7. 依赖与关键路径

```text
文档(M0) → 工具链 → core → router → cli(route)
                              ↘ sync(plan) → backup → apply(M2)
cli 稳定 ↘ mcp(M3)
```

---

## 8. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版路线图；M0 完成 |
| v0.2 | 2026-08-10 | Phase 2 能力完成；生产 apply 待授权 |


## 9. M5 — Hub 安装生命周期与真实接管（2026-09-05）

- [x] 对比 vercel-labs/skills、OpenSkills、skillshare 一手 README 并落决策。
- [x] install/adopt/update/list：来源锁、完整目录比较、本地修改保护、备份恢复。
- [x] 修复增量导入/多行描述解析/配置路径/目录冲突，新增 takeover 只读报告。
- [x] 全仓质量门禁与沙箱安装→索引→分发→更新验收记录（完成后写 PROGRESS）。
- [ ] Owner 选择 26 项冲突版本并确认精确修复/迁移目标，随后最新备份→apply→verify。

能力交付与生产接管分开记录，未完成真实迁移时不能标记“全面接管完成”。


## Phase 6 — Hub MCP 按需加载（2026-09-05）

当前目标为统一安装 → 目录浏览 → 精确加载/搜索 → 附件与续读 → OpenCode 真实验收。停止推进 P5 的默认 symlink 迁移。后续独立里程碑：安装/更新/读取内容风险扫描；可解释 token 估算和本地可选调用统计；建立真实中文查询评测后选择语义检索。


2026-09-06：Phase 6 读取链路与 OpenCode MiniMax-M3 七场景真实验收完成；当前catalog105项MCP读取/hash一致。真实其他宿主接入、未登记项/冲突治理以及审计/语义能力仍为后续工作。

## Phase 10 — Jev 决策信号（2026-10-05）

- [x] 归档 Jev 作为 Agent 决策层的外部观察、仓库清单与风险边界。
- [x] 将 Choice 概率映射为 Skill 名称，分别返回官方置信度和被选项概率，附阈值和升级建议。
- [x] 保持 BM25 离线回退；覆盖 build 候选超限与 query 失败，显式空 API key 不被环境变量覆盖。
- [x] CLI/MCP/HTTP 一致性集成测试及构建CLI真实调用通过；136项测试、类型检查、构建、lint通过。
- 升级阈值校准需要真实标注任务数据；当前0.65只作为初始提示，不作为执行闸门。

## Phase 11 — 竞品调研与安全落地（2026-10-06）

- [x] 核对 `vercel-labs/skills`、OpenSkills、skillshare、skillctl、Agent Skills 规范、Jev Ultrafast 的一手入口和当前 GitHub 元数据。
- [x] 实现只读 Skill 静态审计：CLI `audit`、MCP `skill_audit`、Web `/api/audit` 与详情页。
- [ ] 生成最小 `available_skills` manifest，支持项目级渐进披露。
- [ ] 完成 pin/rollback/overlay/fork 及来源锁迁移说明。
- [ ] 建立 Jev 评估集并收敛 CI/release 门禁。

## Phase 12 — OpenCode Hub-only 真实回归（2026-10-06）

- [x] 使用隔离 profile 并将 PATH 前置的 `opencode` 默认入口切到 Hub-only，关闭原生 Skill 工具、项目 Skill、Claude/共享 Skill 和默认外部插件。
- [x] 当前 catalog 110 个 Skill 的真实 stdio MCP 分页/目录/hash 验收通过。
- [x] MiniMax-M3 八场景和 `humanizer-zh` 代表任务通过，包含不指定 Skill 名的内容自动路由；普通 `opencode` 配置和原 Skill 目录未删除。

## Phase 13 — WorkBuddy 接入（2026-10-06）

- [x] 用户Skill的147名称off，原生Skill拒绝配置；其它模型/插件/业务MCP保留。
- [x] 备份3份配置、独立stdio MCP搜索/正文验证。
- [ ] WorkBuddy新会话模型回归；受保护内置Skill仍可能发现，不能等同OpenCode零发现。

## Phase 14 — Qoder 接入（2026-10-06）

- [x] 原生skills.enabled=false，保留原99个Skill目录、provider/其它17个MCP；追加全局Hub读取指引。
- [x] 配置MCP独立握手、任务内容搜索/读取；当前安装包runtime1.1.64初始化skills=[]、Hub connected、11工具。
- [ ] 模型回归与GUI新会话验证：独立runtime未登录，GUI输入未成功；未将服务测试冒充模型通过。

## Phase 7 — Web 只读视图（2026-09-06）

- [x] `apps/web` 只读 HTTP API：复用 router hub-service，端点对齐 MCP 契约，bind 127.0.0.1，无任何写操作。
- [x] 前端 SPA：技能库浏览/BM25 检索/分页，详情页（Markdown 渲染、元信息、Agent 投影状态、附件文件树、history 时间线），多端盘点视图。
- [x] 门禁：typecheck/build/lint/97 测试通过；真实 catalog（105 项）全部端点 curl 验证。
- 后续候选：技能内容风险扫描展示、冲突治理操作台（仍只读+引导 CLI）、语义检索切换开关。

## Phase 15 — 公开开源（2026-10-09）

- [ ] 文档统一公开源码使用入口，中英README、状态/边界、MIT和社区文件。
- [ ] CI覆盖类型/构建/lint/test/docs/sandbox，不依赖私有catalog或模型Key。
- [ ] 提交当前实现、校验远端、切public，启用私有漏洞报告和依赖安全能力。
- manifest、pin/rollback/overlay、标注Jev质量集、WorkBuddy/Qoder模型回归仍是后续工作。
