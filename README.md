# skill-hub

跨 **WorkBuddy / Claude Code / Codex / Cursor** 的本地 Skill **统一管理、智能选型与上下文节省** 工程。

> 当前状态：**Phase 0–3 已完成**（CLI + 生产 backup/create-only + MCP 只读）。  
> 完整规范见 [`HARNESS.md`](./HARNESS.md) · 文档地图见 [`docs/INDEX.md`](./docs/INDEX.md)

---

## 解决什么问题

| 痛点 | skill-hub 做法 |
|------|----------------|
| 各 Agent 各自装 skill，版本漂移 | Canonical Store 唯一真源 + 分发 |
| 100+ skill 描述塞满上下文 | Router 只注入 Top-K |
| 选错 skill、命中率差 | 本地检索路由（BM25/混合信号，可插拔） |
| 迁移危险 | dry-run、备份、冲突显式报告 |

---

## 仓库结构（摘要）

```text
apps/          CLI、MCP
packages/      core / router / sync / shared
configs/       agent 路径映射、场景 profile
docs/          PRD、架构、运维、计划
tests/         单测、集成测、fixture skills
```

细节以 `HARNESS.md` 为准。

---

## 文档快速入口

| 文档 | 用途 |
|------|------|
| [HARNESS.md](./HARNESS.md) | 工程规范与质量门槛 |
| [PRD](./docs/product/PRD.md) | 需求与验收 |
| [ARCHITECTURE](./docs/architecture/ARCHITECTURE.md) | 技术架构 |
| [API](./docs/architecture/API.md) | 接口约定 |
| [ENVIRONMENT](./docs/ops/ENVIRONMENT.md) | 环境配置 |
| [OPERATIONS_AND_RISKS](./docs/ops/OPERATIONS_AND_RISKS.md) | 运维与风险 |
| [ROADMAP](./docs/planning/ROADMAP.md) | 里程碑 |
| [TASK_BOARD](./docs/planning/TASK_BOARD.md) | 任务板 |
| [PROGRESS](./docs/planning/PROGRESS.md) | 进度日志 |

---

## CLI / MCP

构建后通过 `node apps/cli/dist/index.js <cmd>` 调用。

```bash
pnpm build
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js route "pdf merge" --top-k 5
node apps/cli/dist/index.js route "frontend design" --profile coding --top-k 5
node apps/cli/dist/index.js sync --dry-run --agents workbuddy --create-only
# MCP（stdio 只读）
node apps/mcp-server/dist/index.js
```

| 能力 | 状态 |
|------|------|
| doctor / inventory / init / ingest / index / route | Done |
| backup / verify / restore / sync apply（闸门） | Done（Phase 2） |
| create-only / `--agents` | Done |
| MCP `skill_search|fetch|stats|inventory` | Done（Phase 3 只读） |
| profile `coding` / `video` | Done |

集成：[`docs/ops/MCP_INTEGRATION.md`](./docs/ops/MCP_INTEGRATION.md) · API：[`docs/architecture/API.md`](./docs/architecture/API.md)

---

## 开发前置

1. 阅读 `HARNESS.md` 与 `AGENTS.md`  
2. 从 `docs/planning/TASK_BOARD.md` 领取任务  
3. 所有对用户目录的写入先 dry-run  

### 本机安装与门禁

```bash
cd /Volumes/13759427003/AI/skill-hub
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm lint
```

| 要求 | 版本 |
|------|------|
| Node | ≥ 20（推荐 22） |
| pnpm | ≥ 9（锁 `packageManager: pnpm@10.27.0`） |

验证：`node apps/cli/dist/index.js version` · `pnpm test`（fixture 闭环）。

---

## 许可

项目私有本地工程（默认）；若后续开源，在根目录补充 `LICENSE`。
