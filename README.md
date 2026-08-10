# skill-hub

跨 **WorkBuddy / Claude Code / Codex / Cursor** 的本地 Skill **统一管理、智能选型与上下文节省** 工程。

> 当前状态：**Phase 0 文档与工程规范基线已完成**；运行时 CLI/MCP 进入 Phase 1 开发。  
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

## 规划中的 CLI（Phase 1）

```bash
skill-hub doctor              # 检查环境与 agent 目录
skill-hub ingest              # 扫描/导入 skill → 索引
skill-hub route "任务描述"     # 输出 Top-K
skill-hub sync --dry-run      # 预览分发
skill-hub sync --apply        # 确认后写入 symlink
skill-hub backup              # 备份各端 skills
```

实现进度见 ROADMAP，**以代码为准**。

---

## 开发前置

1. 阅读 `HARNESS.md` 与 `AGENTS.md`  
2. 从 `docs/planning/TASK_BOARD.md` 领取任务  
3. 所有对用户目录的写入先 dry-run  

---

## 许可

项目私有本地工程（默认）；若后续开源，在根目录补充 `LICENSE`。
