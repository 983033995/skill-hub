# 开发计划 / 路线图 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |
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
| **Phase 4** | 体验与团队化 | profiles、质量 lint、可选 GUI/git 协作 | Planned |

---

## 3. 里程碑详情

### M0 — 文档与仓库骨架（Phase 0）

**完成标准**（DoD）：

- [x] 项目位于 `/Volumes/13759427003/AI/skill-hub`
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

- skill description lint  
- depends_on 图扩展（可选）  
- 团队 git 同步指南  
- 可选轻量 GUI 或 TUI  
- Windows 调研备忘  

**DoD**：按当季目标裁剪，不阻塞 v1 主线。

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
