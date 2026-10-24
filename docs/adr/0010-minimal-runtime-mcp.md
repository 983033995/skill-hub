# ADR 0010 — 可选精简MCP运行时与证据分层

- 状态：Accepted
- 日期：2026-10-12
- 背景：Hub的11个工具是固定开销，仍可压缩；宿主原生Skill发现、工具定义和正文加载是不同的上下文来源。

## 决策

增加`SKILL_HUB_MCP_MODE=runtime`，仅暴露`skill_search`、`skill_read`、`skill_files`。复用已有安全读取接口，不新增`skill_load`别名或自动附件全集。默认仍为`full`，保留11个工具及原响应以兼容管理/浏览和既有宿主。

runtime默认Top-3、每次文本读取8000字符；搜索只返回候选name/description/score/scope、索引警告和简化Jev信号，不重复路径、完整来源和候选概率字典。正文与附件按需要分页，不要求为了激活Skill读完整大文件。隐藏工具在调用层也拒绝。

OpenCode隔离启动器增加显式`--mcp-mode runtime`和简短指引；不会改变原生发现禁用策略，也不会自动修改其它宿主。普通任务无需为了证明接入而强制检索。

## 验收与计量

- 默认full与runtime都能连接MCP；runtime分页、附件和路径拒绝保持原安全边界。
- 无模型离线基准测量实际stdio初始化instructions/tools及搜索响应的UTF-8 JSON字节，10/100/1000库下入口大小不随Skill数量增长。未知Token写null，不以字符/字节除常数假装实测。
- 显式模型的OpenCode对比脚本使用100个合成Skill、同模型/任务/非Skill工具设置，记录full/runtime两种Hub-only模式的任务成功、调用轨迹、延迟与原始用量。该小样本不替代Native/Hybrid/Hub-only评估，也不证明任务成功率不下降。
- 宿主可能延迟暴露工具或转换Schema；MCP定义字节与模型计费Token不是同一指标。官方Codex初始Skill清单还有预算上限，不能直接用全量catalog线性估计当前Codex开销。

## 暂缓

不默认生成全量`available_skills` manifest；它仅可作为显式兼容功能，不能作为Hub-only的自动入口。不添加未验证的Hook、Embedding默认路由或通用宿主改配置器。Codex用户/插件/项目发现关闭及完整三模式Token回归需要单独宿主验收。

## 回滚

取消runtime环境变量或设为full；OpenCode用`--mcp-mode full`。没有catalog迁移，不删除Skill或管理工具。
