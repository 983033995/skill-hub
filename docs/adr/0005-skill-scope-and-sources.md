# ADR 0005: Skill scope 与独立本地 sources

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-08-16 |
| 决策者 | script / agent |

## 背景

skill-hub 需要同时盘点多个 Agent 目录，以及用户显式指定的 workspace/project Skill 目录。原模型只有一个 `source` 字符串，无法解释同名 Skill 的来源、作用域和选择原因；如果把 Agent 同步目标与 Skill 来源混在一起，也容易把项目 Skill 意外投影到全局 Agent。

## 决策

1. `agents` 只表示同步目标；`sources` 只表示本地 Skill 盘点/导入来源。
2. Skill source 必须是本地目录，扫描器只接受目录内的 `SKILL.md`；普通 Markdown、Obsidian 笔记和知识库不属于管理对象。
3. `SkillMeta.provenance` 使用可选字段保存 `scope`、`sourceType`、`sourceRef`、`revision`、`status`、`overlayOf`。旧 catalog 缺省按 `user/local` 兼容读取。
4. 作用域固定为 `user`、`workspace`、`project`；显式 `inventory --scope` / `route --scope` 过滤不回退到全量。
5. 同名冲突报告保留所有不同 hash 变体，并按 `project > workspace > user` 及确定性 tie-break 生成解释性 winner；winner 不代表自动覆盖。
6. `workspace/project` Skill 默认不进入全局 Agent sync；未来若要显式投影，另行设计授权参数和审计行为。

## 后果

- catalog 可以追溯 Skill 来源并支持 scope-aware route。
- 旧 catalog 无需迁移即可读取，但未标 provenance 的条目无法恢复历史来源，只能按 user 兼容。
- project/workspace 目录需要显式配置，不会因为存在于某个知识库目录中而被自动扫描。
- `index freshness`、`explain/path/history` 已在后续 Phase 4 切片落地；本 ADR 的 scope/provenance 字段继续作为这些只读解释能力的输入。
