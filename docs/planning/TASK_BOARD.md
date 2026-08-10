# 任务看板 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 最后更新 | 2026-08-10 |
| 用法 | 领取任务时改 Status/Owner；完成时改 `done` 并写 PROGRESS |

**状态**：`todo` | `in_progress` | `blocked` | `done` | `cancelled`

---

## 当前焦点

**Phase 0 文档基线：完成**  
**下一焦点：Phase 1 monorepo 工具链 + core**

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
| P1-01 | 初始化 pnpm monorepo 与 tsconfig | todo | — | P0 | package.json / workspace |
| P1-02 | 实现 `@skill-hub/shared` | todo | — | P1-01 | 错误码、路径、logger |
| P1-03 | 实现 `@skill-hub/core` scan/parse | todo | — | P1-02 | fixture 覆盖 |
| P1-04 | catalog 读写与 conflict 检测 | todo | — | P1-03 | |
| P1-05 | 实现 `@skill-hub/router` BM25 | todo | — | P1-04 | |
| P1-06 | 实现 `@skill-hub/sync` plan（dry-run） | todo | — | P1-04 | 不 apply |
| P1-07 | CLI：doctor / inventory | todo | — | P1-03 | 只读 home |
| P1-08 | CLI：init / ingest / index / route | todo | — | P1-05 | |
| P1-09 | CLI：sync --dry-run | todo | — | P1-06 | |
| P1-10 | 单测 + 集成测 fixture 闭环 | todo | — | P1-08 | |
| P1-11 | 更新 API.md 实现状态与 README 快速开始 | todo | — | P1-10 | |
| P1-12 | 本机只读 inventory 报告归档到 outputs/ | todo | — | P1-07 | 不写入 skills |

---

## Phase 2 — 生产同步

| ID | 任务 | Status | Owner | 依赖 |
|----|------|--------|-------|------|
| P2-01 | backup 命令与 manifest | todo | — | P1 |
| P2-02 | sync --apply symlink | todo | — | P2-01 |
| P2-03 | verify + 死链修复建议 | todo | — | P2-02 |
| P2-04 | restore 最小实现 | todo | — | P2-01 |
| P2-05 | 三端真实演练 + 回滚演练记录 | todo | — | P2-04 |

---

## Phase 3 — MCP 与增强

| ID | 任务 | Status | Owner | 依赖 |
|----|------|--------|-------|------|
| P3-01 | mcp-server skill_search/fetch/stats | todo | — | P1-05 |
| P3-02 | profiles 过滤 | todo | — | P1-05 |
| P3-03 | external engine 适配接口 | todo | — | P1-05 |
| P3-04 | 集成文档（各 Agent） | todo | — | P2/P3-01 |
| P3-05 | 路由评估 10 任务 | todo | — | P3-02 |

---

## Blocked

| ID | 原因 | 需要谁 | 备注 |
|----|------|--------|------|
| — | — | — | 暂无 |

---

## 看板维护规则

1. 同时 `in_progress` 建议 ≤ 3  
2. 完成必须写 `PROGRESS.md` 一条  
3. 取消任务写明原因  
4. 新增任务用 `P{阶段}-{序号}`  
