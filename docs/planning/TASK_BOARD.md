# 任务看板 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 最后更新 | 2026-08-11（workbuddy 全套 replace-real apply 通过） |
| 当前焦点 | **workbuddy catalog 105 全 symlink 真源化**；其它端 apply / MCP Trust / Phase 4 |
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

## 看板维护规则

1. 同时 `in_progress` 建议 ≤ 3  
2. 完成必须写 `PROGRESS.md` 一条  
3. 取消任务写明原因  
4. 新增任务用 `P{阶段}-{序号}`  
