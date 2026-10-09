# 用户场景 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-16 |
| 对齐 | `docs/product/PRD.md` |

---

## S1 — 多端盘点

**触发**：用户：“我到底装了哪些 skill？各端差在哪？”  
**步骤**：

1. 运行 `skill-hub inventory`；需要项目/工作区 Skill 时先配置 `sources`
2. 查看各端数量、同名交集、仅单端存在列表  
3. 按需用 `--scope`/`--sources` 过滤并导出矩阵（md/json）

**成功**：无需手工 `ls` 多个目录；冲突命名清晰。

---

## S2 — 建立真源

**触发**：决定“以后只维护一份”。  
**步骤**：

1. `skill-hub backup`  
2. `skill-hub init`  
3. `skill-hub ingest --sources ... --prefer <dir>`
4. 阅读 conflict 报告并人工处理  

**成功**：`~/.skill-hub/skills` 为唯一正文库；冲突有清单。

---

## S3 — 分发到 Claude / Codex / Cursor / WorkBuddy

**触发**：真源已稳定。  
**步骤**：

1. `skill-hub sync --dry-run`  
2. 确认计划  
3. `skill-hub sync --apply`  
4. `skill-hub verify`  

**成功**：各端同名 skill 指向同一 inode/target；Agent 能发现 skill。

---

## S4 — 任务智能选型

**触发**：“帮我做 PDF 合并 / 前端落地页 CRO / 视频分镜”  
**步骤**：

1. `skill-hub route "<任务>" --top-k 5`；项目 Skill 用 `--scope project` 显式选择
2. 将结果注入 Agent（手动或 hook/MCP）  
3. Agent 仅基于候选加载正文  

**成功**：相关 skill 出现在 Top-K；无关 skill 不占上下文。

---

## S5 — 日常新增 skill

**触发**：从市场或自建安装新 skill。  
**步骤**：

1. 将 skill 放入 hub（或 `ingest` 单目录）  
2. `skill-hub index`  
3. `skill-hub sync --apply`  

**成功**：全端同时可见；route 能命中。

---

## S6 — 误操作回滚

**触发**：sync 后发现错误链接。  
**步骤**：

1. 定位最近 backup  
2. 按 OPERATIONS 文档还原  
3. `verify`  

**成功**：恢复到备份点，无数据净损失。

---

## S7 — 场景化工作（P1）

**触发**：当天只做视频相关任务。  
**步骤**：

1. 启用 `profiles/video.yaml`  
2. route 仅在 profile 子集中检索  

**成功**：候选更准、列表更短。

## S8 — Skill 与知识库边界

**约束**：skill-hub 只管理本地 Skill 目录中的 `SKILL.md` 及其配套文件。普通 Markdown、Obsidian 笔记和本地知识库不参与 inventory、ingest、route 或 sync。

**成功**：Skill plane 可以独立演进，不会把知识库内容误导入 Canonical catalog。
