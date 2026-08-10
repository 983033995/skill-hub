# AGENTS.md — skill-hub Agent 工作指引

**任何 Agent（WorkBuddy / Claude Code / Codex / Cursor 等）在本仓库工作前，必须先阅读：**

1. `HARNESS.md`（工程规范，最高优先级）
2. 本文件
3. 与任务相关的 `docs/**` 文档

---

## 1. 项目是什么

跨 Agent 的 **Skill 统一管理 + 智能路由 + 省上下文** 工程。

- 真源与分发：Canonical Store + 多端 symlink  
- 路由：按任务返回 Top-K skill  
- 不把用户 100+ skill 全文灌进每次对话  

---

## 2. 路由规则（接到用户请求后的第一动作）

| 用户意图 | 第一动作 |
|----------|----------|
| 改规范/流程/质量门禁 | 读并改 `HARNESS.md`，必要时补 ADR |
| 改需求/范围/验收 | 读并改 `docs/product/PRD.md` |
| 改架构/模块边界 | 读 `docs/architecture/ARCHITECTURE.md` + 新建/更新 ADR |
| 改 CLI/MCP/API | 读并改 `docs/architecture/API.md` |
| 环境安装/配置 | 读 `docs/ops/ENVIRONMENT.md` |
| 备份/迁移/故障 | 读 `docs/ops/OPERATIONS_AND_RISKS.md` |
| 排期/里程碑 | 读 `docs/planning/ROADMAP.md` + `TASK_BOARD.md` |
| 实现代码 | 确认任务在 TASK_BOARD；优先 `packages/*` → `apps/*` |
| 状态询问 | 读 `docs/planning/PROGRESS.md` |

**禁止**：未读 HARNESS 就重构目录；未 dry-run 就改用户 `~` 下 skill。

---

## 3. 修改文件优先级

1. 规范与文档（Phase 0）  
2. `packages/core` → `packages/router` → `packages/sync`  
3. `apps/cli` → `apps/mcp-server`  
4. `configs/*`、`scripts/*`、测试  

---

## 4. 安全红线

- 不 `rm -rf` 用户 skill 目录  
- 不提交密钥  
- 同步写入默认 `--dry-run`；真实写入需用户明确确认  
- 同名 skill 冲突不得静默覆盖  

---

## 5. 完成后必做

1. 更新 `docs/planning/PROGRESS.md`（追加记录）  
2. 关闭/推进 `TASK_BOARD.md` 对应项  
3. 行为变更同步 API/PRD/ROADMAP  
4. 说明如何验证  

---

## 6. 本地 shell

用户惯例：命令优先加 `rtk` 前缀（见用户 RTK 规则）。
