# 文档索引（docs/INDEX）

> 与 `HARNESS.md` 保持一致。新增文档必须登记到本表。

**项目**：skill-hub  
**基线版本**：v0.1（2026-08-10）

---

## 0. 根入口

| 文档 | 说明 |
|------|------|
| [../HARNESS.md](../HARNESS.md) | 工程总规范 |
| [../AGENTS.md](../AGENTS.md) | Agent 协作入口 |
| [../README.md](../README.md) | 人读摘要 |

---

## 1. 产品（product）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [product/PRD.md](./product/PRD.md) | 需求、范围、场景、验收 | 范围/验收变更 |
| [product/USER_SCENARIOS.md](./product/USER_SCENARIOS.md) | 关键用户场景展开 | 场景增减 |

---

## 2. 架构（architecture）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [architecture/ARCHITECTURE.md](./architecture/ARCHITECTURE.md) | 分层架构、数据流、模块 | 架构决策 |
| [architecture/API.md](./architecture/API.md) | CLI / MCP / 库接口 | 接口变更 |
| [architecture/DATA_MODEL.md](./architecture/DATA_MODEL.md) | 领域模型与存储 | 模型变更 |

---

## 3. 运维（ops）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [ops/ENVIRONMENT.md](./ops/ENVIRONMENT.md) | 环境依赖与配置 | 依赖升级 |
| [ops/OPERATIONS_AND_RISKS.md](./ops/OPERATIONS_AND_RISKS.md) | 运维流程、风险、回滚 | 运维策略变更 |

---

## 4. 计划（planning）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [planning/ROADMAP.md](./planning/ROADMAP.md) | 阶段与里程碑 | 里程碑调整 |
| [planning/TASK_BOARD.md](./planning/TASK_BOARD.md) | 任务状态板 | 每个工作日/每个 PR |
| [planning/PROGRESS.md](./planning/PROGRESS.md) | 进度追加日志 | 每次实质交付 |

---

## 5. 决策与模板

| 路径 | 说明 |
|------|------|
| [adr/](./adr/) | ADR 决策记录 |
| [adr/0000-template.md](./adr/0000-template.md) | 已归档的模板指针 |
| [templates/](./templates/) | PR / Issue / ADR / Release / Task 模板 |
| [harness/QUALITY_GATES.md](./harness/QUALITY_GATES.md) | 质量门禁展开清单 |

---

## 6. 文档维护规则

1. **中文为主**，接口标识与代码标识保持英文  
2. 状态字段统一：`Draft | Active | Deprecated`  
3. 每个主文档头部含：状态、版本、最后更新、Owner  
4. 过时内容先标 Deprecated，再在下个里程碑删除  
5. 链接失效视为文档缺陷，与代码缺陷同级处理  

---

## 7. 建议阅读顺序（新人/新 Agent）

```text
HARNESS → AGENTS → PRD → ARCHITECTURE → API → ROADMAP → TASK_BOARD
```
