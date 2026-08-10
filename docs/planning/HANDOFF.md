# skill-hub 交接文档（可直接开新对话）

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 生成时间 | 2026-08-10 15:24 (GMT+8) |
| 适用 | 任意新对话 / 新 Agent / 换机继续 |
| 项目根 | `/Volumes/13759427003/AI/skill-hub` |

---

## 0. 30 秒启动提示词（复制到新对话）

```text
继续 skill-hub 项目。

项目路径：/Volumes/13759427003/AI/skill-hub
先读：
1. docs/planning/HANDOFF.md（本交接）
2. HARNESS.md
3. AGENTS.md
4. docs/planning/TASK_BOARD.md
5. docs/planning/PROGRESS.md
6. docs/planning/ROADMAP.md

当前状态：Phase 0 文档与工程基线已完成；Phase 1 未开始（CLI 未实现）。
下一任务：从 TASK_BOARD 的 P1-01 开始（pnpm monorepo 初始化）。
硬约束：
- 未获我明确授权前，禁止对 ~/.workbuddy|~/.claude|~/.codex|~/.agents|~/.cursor 的 skills 做写入/删除/symlink apply
- sync 默认 dry-run
- 遵守 HARNESS 与中文回复
- shell 优先 rtk 前缀

请先汇报你读到的状态与下一步计划，再动手。
```

---

## 1. 项目一句话

**skill-hub**：跨 WorkBuddy / Claude Code / Codex / Cursor 的本地 Skill **统一真源管理 + 智能选型（Top-K）+ 省上下文** 工程。

---

## 2. 为什么做（背景）

用户多端各自装了大量 skill，本机扫描结论：

| 端 | 路径 | 约计 |
|----|------|------|
| WorkBuddy | `~/.workbuddy/skills` | 76 |
| Agents | `~/.agents/skills` | 49 |
| Cursor | `~/.cursor/skills` | 14 |
| Codex | `~/.codex/skills` | 5 |
| 去重唯一 | — | **~108** |

问题：版本漂移、上下文膨胀、选型变差、迁移高风险。

相关前期调研（WorkBuddy 会话产物，可选参考）：

- `/Volumes/13759427003/AppData/workbuddy/2026-08-10-11-08-54/outputs/skill-hub/unified-skill-hub-plan.md`
- `/Volumes/13759427003/AppData/workbuddy/2026-08-10-11-08-54/outputs/skill-hub/inventory.md`

生态参考（未强制绑定实现）：

- `npx skills`（vercel-labs/skills）：多端安装/symlink
- `agent-skill-finder`（ASF）：运行时缩到 3–5 skill
- `neuro-skill`：本地混合路由
- `graph-of-skills`：依赖感知

---

## 3. 当前完成度（事实）

### 3.1 已完成：Phase 0 / M0 ✅

仓库：`/Volumes/13759427003/AI/skill-hub`  
Git：已 init，`main` 首提 `558af90`（message: `docs(harness): bootstrap Phase 0 engineering baseline`）  
约 41 个文件，**以文档与脚手架为主**。

| 类别 | 文件 |
|------|------|
| 工程规范 | `HARNESS.md` |
| Agent 入口 | `AGENTS.md` · `CLAUDE.md` · `README.md` |
| 文档地图 | `docs/INDEX.md` |
| 产品 | `docs/product/PRD.md` · `USER_SCENARIOS.md` |
| 架构 | `docs/architecture/ARCHITECTURE.md` · `API.md` · `DATA_MODEL.md` |
| 运维 | `docs/ops/ENVIRONMENT.md` · `OPERATIONS_AND_RISKS.md` |
| 计划 | `ROADMAP.md` · `TASK_BOARD.md` · `PROGRESS.md` · **本 HANDOFF** |
| ADR | `0001` 真源+symlink · `0002` TS monorepo · `0003` 可插拔路由 |
| 配置模板 | `configs/agents/default.yaml` · `profiles/coding.yaml` · `video.yaml` |
| 代码骨架 | `apps/*` `packages/*` 仅 `.gitkeep`，**无业务实现** |
| 测试 fixture | `tests/fixtures/skills/sample-skill/SKILL.md` |

### 3.2 未完成（故意未做）

- [ ] pnpm/TS monorepo 真实初始化（`package.json` 等）
- [ ] 任何 CLI 可执行逻辑
- [ ] 对用户 home 下 skills 的写入 / symlink apply
- [ ] MCP server 实现
- [ ] ASF / neuro-skill 实际接入

**实现状态口头约定**：文档里的 `skill-hub doctor/route/sync...` 是 **API 契约**，不是已上线命令。

---

## 4. 已拍板的关键决策（ADR）

| ADR | 决策 |
|-----|------|
| 0001 | Canonical Store + 各端 **symlink 分发**；冲突不静默覆盖 |
| 0002 | 主栈 **TypeScript + pnpm monorepo**；Python 仅可选外部引擎 |
| 0003 | 路由引擎可插拔；默认 **内建 BM25**，可接 external-asf/neuro |

运行时用户数据规划路径（未强制已创建）：

```text
~/.skill-hub/
  skills/     # 唯一真源正文
  index/
  backups/
  config.yaml
  catalog.json
```

仓库内 `configs/` 只是模板，**不要**把用户完整 skill 库提交进 git。

---

## 5. 目录心智模型

```text
skill-hub/                 # 本仓库（外置盘 AI）
  HARNESS.md               # 规范最高优先级
  apps/cli · apps/mcp-server
  packages/core · router · sync · shared
  docs/                    # 产品/架构/运维/计划
  configs/                 # 默认映射与 profiles
  tests/fixtures/          # 样例 skill

~/.skill-hub/              # 用户运行时（home，规划中）
各 Agent skills 目录       # 应变成指向 hub 的 symlink（Phase 2）
```

---

## 6. 开发计划当前位置

| 阶段 | 状态 | 说明 |
|------|------|------|
| Phase 0 文档基线 | **Done** | 2026-08-10 |
| Phase 1 MVP CLI | **Next** | doctor/inventory/ingest/index/route/sync --dry-run |
| Phase 2 生产同步 | Planned | backup + apply + verify |
| Phase 3 MCP/增强 | Planned | MCP、profiles、外部引擎 |
| Phase 4 体验 | Planned | lint/GUI/团队 |

**看板下一票任务（按序）：**

1. `P1-01` 初始化 pnpm monorepo 与 tsconfig  
2. `P1-02` `@skill-hub/shared`  
3. `P1-03` `@skill-hub/core` scan/parse  
4. …见 `docs/planning/TASK_BOARD.md`

进度只追加：`docs/planning/PROGRESS.md`  
里程碑勾选：`docs/planning/ROADMAP.md`

---

## 7. 硬约束与安全红线（新对话必须继承）

1. **未明确授权，禁止**对用户 skills 目录做：删除、覆盖、symlink apply、批量移动  
2. 默认可做：读扫描、写本仓库代码/文档、在 sandbox/fixture 测试  
3. `sync` 默认 **dry-run**；apply 需 `require_backup` 思路  
4. 同名 skill 冲突 → report，**禁止静默覆盖**  
5. 用户 shell 惯例：命令优先 `rtk` 前缀  
6. 回复语言：**简体中文**  
7. 外置卷路径：`/Volumes/13759427003`（未挂载则先确认卷）  
8. 改行为必须同步文档（HARNESS 规则）并更新 TASK_BOARD / PROGRESS  

---

## 8. 建议的新对话开工清单

```text
[ ] 确认外置盘已挂载，cd 到项目根
[ ] 读 HANDOFF → HARNESS → TASK_BOARD → PROGRESS
[ ] 汇报：当前阶段、下一任务 ID、风险
[ ] 从 P1-01 开始；完成一条就更新 TASK_BOARD + PROGRESS
[ ] 不触碰用户 ~/.*/skills 写入
```

### 推荐第一刀实现顺序

```text
package.json / pnpm-workspace / tsconfig
→ packages/shared
→ packages/core（scan fixture）
→ packages/router（BM25）
→ packages/sync（plan only）
→ apps/cli 装配
→ vitest 闭环：ingest→index→route（fixture）
→ 可选：对本机 skills 只读 inventory
```

---

## 9. 验收锚点（避免“做完但不可演示”）

**Phase 1 DoD（摘自 ROADMAP/PRD）：**

- `pnpm test` 绿  
- fixture：ingest → index → route 可跑  
- 本机 **只读** inventory 能量级对齐 ~100 skills  
- `sync --dry-run` 有可读计划  
- `docs/architecture/API.md` 更新实现状态  

**Phase 2 才允许**：经用户确认后的 symlink apply + 备份演练。

---

## 10. 已知开放问题（未决，勿擅自拍板生产策略）

1. WorkBuddy 是否有特殊 skill loader 行为？  
2. v1 默认坚持内建 BM25，还是尽早接 ASF？  
3. `~/.agents/skills` vs `~/.codex/skills` 优先级？  
4. Claude 全局 skills 目前几乎空，是否默认 enable？  

决策后写 ADR，并回写 PRD 开放问题表。

---

## 11. 用户 / 协作信息

| 项 | 值 |
|----|-----|
| 用户称呼 | script |
| 城市 | 深圳 |
| Owner | script（优先级与生产 apply 授权） |
| 实现者 | 人 or Agent（按 TASK_BOARD 领取） |

---

## 12. 一键健康检查（新环境）

```bash
# 卷与项目
ls /Volumes/13759427003/AI/skill-hub
test -f /Volumes/13759427003/AI/skill-hub/HARNESS.md && echo OK_HARNESS

# git
cd /Volumes/13759427003/AI/skill-hub && git log -1 --oneline && git status -sb

# 文档入口
ls docs/planning docs/product docs/architecture docs/ops
```

预期：git 干净或仅有本地未提交实验；Phase 0 文件齐全。

---

## 13. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 首版交接文档；供新对话继续 Phase 1 |

---

## 14. 给下一位 Agent 的最后一句话

**不要重做 Phase 0。**  
从 `TASK_BOARD` 的 `P1-01` 开工，先工具链再 core/router，**读写分离**：可以读用户 skills 盘点，写入只限本仓库与将来用户明确授权的 `~/.skill-hub` 初始化。
