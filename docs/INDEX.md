# 文档索引（docs/INDEX）

> 与 `HARNESS.md` 保持一致。新增文档必须登记到本表。

**项目**：skill-hub  
**基线版本**：v0.1.0 · 公开源码文档更新2026-10-09

---

## 0. 根入口

| 文档 | 说明 |
|------|------|
| [../HARNESS.md](../HARNESS.md) | 工程总规范 |
| [../AGENTS.md](../AGENTS.md) | Agent 协作入口 |
| [../README.md](../README.md) | 英文源码使用入口 |
| [../README.zh-CN.md](../README.zh-CN.md) | 中文使用入口 |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | 贡献流程 |
| [../SECURITY.md](../SECURITY.md) | 安全边界与私有报告 |
| [../CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | 社区规范 |
| [../NOTICE.md](../NOTICE.md) | 第三方许可边界 |
| [../CHANGELOG.md](../CHANGELOG.md) | 未发布更新记录 |

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
| [architecture/API.md](./architecture/API.md) | CLI / MCP / Web / 库接口 | 接口变更 |
| [architecture/MODELS.md](./architecture/MODELS.md) | 自定义模型配置（可选增强层） | 模型接入变更 |
| [architecture/DATA_MODEL.md](./architecture/DATA_MODEL.md) | 领域模型与存储 | 模型变更 |

---

## 3. 运维（ops）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [ops/OPEN_SOURCE_RELEASE.md](./ops/OPEN_SOURCE_RELEASE.md) | 公开仓库社区/安全/CI设置和发布边界 | GitHub配置变更 |
| [ops/JEV_SETUP.md](./ops/JEV_SETUP.md) | Jev token、CLI/MCP/宿主配置与回退排查 | Jev配置变化 |
| [ops/ENVIRONMENT.md](./ops/ENVIRONMENT.md) | 环境依赖与配置 | 依赖升级 |
| [ops/OPERATIONS_AND_RISKS.md](./ops/OPERATIONS_AND_RISKS.md) | 运维流程、风险、回滚 | 运维策略变更 |
| [ops/MCP_INTEGRATION.md](./ops/MCP_INTEGRATION.md) | MCP 宿主配置（WorkBuddy/Cursor/…） | MCP/集成变更 |
| [ops/OPENCODE_HUB.md](./ops/OPENCODE_HUB.md) | OpenCode 零单项 Skill 安装入口与验收 | 运行时/验收变更 |
| [ops/WORKBUDDY_HUB.md](./ops/WORKBUDDY_HUB.md) | WorkBuddy用户Skill停用、Hub接入、备份和待验证限制 | WorkBuddy接入/回归 |
| [ops/QODER_HUB.md](./ops/QODER_HUB.md) | Qoder原生Skill停用、Hub接入和分层验收/登录阻塞 | Qoder接入/回归 |

---

## 4. 计划（planning）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [planning/PR_REVIEW_20261009.md](./planning/PR_REVIEW_20261009.md) | 开放依赖PR的兼容性、CI及合并前提 | PR状态变化 |
| [planning/STATUS.md](./planning/STATUS.md) | 当前实现、验证与限制（优先阅读） | 状态变化 |
| [planning/ROADMAP.md](./planning/ROADMAP.md) | 阶段与里程碑 | 里程碑调整 |
| [planning/TASK_BOARD.md](./planning/TASK_BOARD.md) | 任务状态板 | 每个工作日/每个 PR |
| [planning/PROGRESS.md](./planning/PROGRESS.md) | 进度追加日志 | 每次实质交付 |
| [planning/SKILL_HUB_UPGRADE_PLAN.md](./planning/SKILL_HUB_UPGRADE_PLAN.md) | 升级方案、产品审计与推进计划 | 版本/策略调整 |
| [planning/OPEN_SOURCE_COMPARISON.md](./planning/OPEN_SOURCE_COMPARISON.md) | 同类开源项目对比与统一接管决策 | 生命周期/产品范围变化 |
| [planning/COMPETITOR_RESEARCH_20261006.md](./planning/COMPETITOR_RESEARCH_20261006.md) | 2026-10-06 一手竞品/规范/决策项目调研 | 功能优先级或外部证据变化 |
| [planning/DELIVERY_PLAN_20261006.md](./planning/DELIVERY_PLAN_20261006.md) | 可落地功能顺序、验收与停止条件 | 里程碑/范围调整 |
| [ops/UNIFIED_SKILL_MANAGEMENT.md](./ops/UNIFIED_SKILL_MANAGEMENT.md) | 统一安装、更新与迁移操作入口 | CLI/接管流程变化 |
| [planning/HANDOFF.md](./planning/HANDOFF.md) | **跨会话交接（新对话必读）** | 阶段切换/换 Agent |

---

## 5. 研究（research）

| 文档 | 说明 | 维护触发 |
|------|------|----------|
| [research/JEV_DECISION_LAYER.md](./research/JEV_DECISION_LAYER.md) | Jev 决策层观察、取舍与验证边界 | Jev 能力或外部证据更新 |

## 6. 决策与模板

| 路径 | 说明 |
|------|------|
| [adr/](./adr/) | ADR 决策记录 |
| [adr/0004-sync-copy-fallback.md](./adr/0004-sync-copy-fallback.md) | symlink 默认与 copy fallback 决策 |
| [adr/0005-skill-scope-and-sources.md](./adr/0005-skill-scope-and-sources.md) | Skill scope、provenance 与独立 sources 决策 |
| [adr/0007-hub-runtime-loading.md](./adr/0007-hub-runtime-loading.md) | Hub MCP 按需加载与 OpenCode 独立接入 |
| [adr/0009-open-source-publication.md](./adr/0009-open-source-publication.md) | MIT公开源码、隔离CI与非npm发布边界 |
| [adr/0008-typesafe-jev-semantic-router.md](./adr/0008-typesafe-jev-semantic-router.md) | Jev 可选语义路由与 BM25 降级 |
| [adr/0006-managed-skill-lifecycle.md](./adr/0006-managed-skill-lifecycle.md) | 来源锁与完整目录版本管理 |
| [adr/0000-template.md](./adr/0000-template.md) | 已归档的模板指针 |
| [templates/](./templates/) | PR / Issue / ADR / Release / Task 模板 |
| [harness/QUALITY_GATES.md](./harness/QUALITY_GATES.md) | 质量门禁展开清单 |

---

## 7. 文档维护规则

1. **中文为主**，接口标识与代码标识保持英文  
2. 状态字段统一：`Draft | Active | Deprecated`  
3. 每个主文档头部含：状态、版本、最后更新、Owner  
4. 过时内容先标 Deprecated，再在下个里程碑删除  
5. 链接失效视为文档缺陷，与代码缺陷同级处理  

---

## 8. 建议阅读顺序（新人/新 Agent）

```text
HARNESS → AGENTS → PRD → ARCHITECTURE → API → ROADMAP → TASK_BOARD
```
