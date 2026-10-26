# DeepSeek Harness 本地 Skill 管理调研与优化建议

> 后续交付更新（2026-10-26）：P21-02/03/04、Web使用预算与主流来源盘点已落地；本报告保留公开源码调研时点。当前能力见[完成情况复核](../planning/COMPLETION_REVIEW_20261026.md)。

状态：Active（公开源码历史调研；后续建议实现状态以当前完成情况复核为准）

日期：2026-10-25（Asia/Shanghai）

范围：公开仓库与官方文档静态核对、skill-hub 源码对照；后续 P21-02 已实现并做合成沙箱与既有授权真实只读验收。未安装第三方项目，未修改宿主配置或生产 Skill。

## 1. 项目辨认与证据边界

用户已明确确认研究对象为 **MichengAI/dsh-skills-manager**。本报告以它为目标插件，另将同名的 daha1216 项目和官方 Harness Skill 子系统作为对照。不能把官方 Harness 的整体热度归给某个社区插件。

| 对象                                                                            | 本轮固定快照                                                             | 定位                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| [MichengAI/dsh-skills-manager](https://github.com/MichengAI/dsh-skills-manager) | `40677d74f53805c99d183c202cd67ea5bb6294e2`；package `1.2.18`；Apache-2.0 | 社区 DSH 插件；本机/项目 Skill 面板、发现、GitHub 安装、更新预览、备份和回收站 |
| [daha1216/dsh-skills-manager](https://github.com/daha1216/dsh-skills-manager)   | `1bdb764af42643e8fe3a6cf74f826c284dcf956b`；package `0.3.3`；MIT         | 以 DSH 本地编辑、调用策略、预览与回收为主的面板                                |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`；MIT                          | 完整 Agent 宿主；Skill provider/registry/consumer 是其子系统                   |

公开 GitHub API 快照中目标插件为 327 stars；数字随时变化，不作为可靠性、采用度或安全证明。第三方插件站的下载量/“verified”标签未用于结论。

核对了目标插件的 README、核心发现/策略/仓库更新源码及相关测试断言。GitHub 报告该固定 SHA 的[验证 workflow](https://github.com/MichengAI/dsh-skills-manager/actions/runs/40117168186)成功；这不是本机宿主验收。本轮没有执行第三方代码、安装其依赖、运行其测试，或确认截图对应的完整交互体验。DeepSeek Web 的方案审查仅接收公开设计与通用问题摘要，未接收用户 Skill 内容/清单。

## 2. 目标插件确实实现了什么

| 能力                            | 源码证据                                                                                                                                                                | 对 skill-hub 的意义                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 多来源/工作区视图与独立启停策略 | `core.ts` 的 `managerSkillOverride`、`setPolicySkillEnabled` 将策略写入管理器状态；第三方源文件不随启停改写                                                             | 可以借鉴来源/工作区/可写性分组；启停效果只对接入该策略的 DSH 生效，不能推断其他 Agent 同时停用 |
| 本地修改与更新可用性同时呈现    | `repositories.ts` 的 `list()` 分别计算 `updateAvailable` 和安装副本的 `conflict`                                                                                        | “有新版本”和“允许覆盖”应是两个维度；本地修改不应阻止只读查询上游                               |
| 文件差异与确认版本绑定          | `repository-updates.ts` 的 `prepare()` 生成 added/removed/modified 清单；token 绑定来源身份、目标位置、当前/目标摘要与版本；`replace()` 重新计算并校验 token 和当前目录 | 借鉴“用户确认的就是本次应用的版本”，避免分支在 dry-run 与 apply 之间变化而静默换包             |
| 备份、目录切换和失败恢复        | 更新先保存旧目录，用 stage/rename 切换；状态写入失败尝试恢复；备份指纹不符拒绝 rollback                                                                                 | 已有机制可作为交叉审查输入，不等于端到端事务已在本机验证                                       |
| 仓库快照缓存                    | `repositories.ts` 的 `cacheArchive()` 保存归档并校验摘要；刷新网络阶段不长期持写队列                                                                                    | 可以降低同仓库多 Skill 重复下载；必须显示缓存时间、检查结果和未知状态                          |

固定源码：[仓库列表/刷新](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/src/repositories.ts)、[更新预览/应用/回退](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/src/repository-updates.ts)、[本地策略](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/src/core.ts)、[测试断言](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/test/repositories.test.mjs)。

## 3. 不能照搬的部分

1. **版本字段含义不同。** 目标插件新扫描路径把 ZIP 的 SHA-256 摘要存进 `commit`，并依靠归档缓存固定快照；旧记录才可能是 40 位 Git commit。不能将其所有 `commit` 都展示成 Git 提交。skill-hub 已区分 Git `commit` 与 Skill `treeHash`，应保留这个语义。
2. **文件摘要不等于本项目完整树哈希。** 目标插件的 `fileIndex/signature` 包含文件路径和内容摘要；其目录读取没有将空目录和执行位纳入摘要。skill-hub 的树哈希覆盖这些属性，不能换成较窄的文件列表摘要。
3. **发现容错不能变成静默丢失。** 目标插件只读发现器对失效链接/不可读目录有跳过路径，并返回扫描预算截断标志。skill-hub 应返回逐条 issue 和 `complete=false`，而不是照搬 catch 后忽略，或把失败显示成“没有这个 Skill”。
4. **可写根不同。** 目标插件可写 DSH、Shared Agent 和已登记项目 DSH 目录；“支持查看许多 Agent 来源”不等于“可安全更新全部 Agent 的目录”。skill-hub 应继续以 canonical 为唯一真源。
5. **较小同名项目的宣传需降级理解。** daha1216 的源码确有 Origin/Host 检查、mtime 冲突检查和保存备份，但 `atomicWrite()` 中备份失败是 best-effort catch，mtime 检查也在参数缺失时跳过。因此不能只凭 README 的“生产级”“完整快照”来替换本项目的强制保护。
6. **接口兼容不等于内容范围相同。** DSH 支持平铺 Markdown Skill；本仓库 HARNESS 明确只将含 `SKILL.md` 的目录纳入 Skill 管理，普通 Markdown/知识库属于另一个 plane，不建议为了兼容而扩大扫描。

固定源码：[归档版本实现](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/src/repositories.ts)、[只读发现](https://github.com/MichengAI/dsh-skills-manager/blob/40677d74f53805c99d183c202cd67ea5bb6294e2/src/readonly-discovery.ts)、[较小同名项目](https://github.com/daha1216/dsh-skills-manager/blob/1bdb764af42643e8fe3a6cf74f826c284dcf956b/index.js)。本轮未复制第三方实现；若后续复用 Apache-2.0 代码，须保留相应许可/NOTICE 要求。

## 4. 官方 Harness 的 Skill 架构与 Hub 的差异

官方拆为 provider → registry → tool consumer：文件系统 provider 处理项目/自定义/用户根与 watcher；registry 合并来源；tool-skill 给模型目录和按需正文。文件变更可触发后续步骤目录刷新；发现不完整时保留最后可用视图，避免将读取失败误当删除。

但官方 tool-skill 仍将全体可见 Skill 的名称和截断描述注入会话；目录变化会追加完整替换。官方文档列明正文无大小上限、正文不分页、资源仅返回指引而不列举/获取附件。它和 Hub 的搜索 Top-K、正文分页、附件安全读取并不等价，不能据“按需加载”一词推断上下文成本相同。

来源：[官方文件系统 provider](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/skill-filesystem/README.zh.md)、[官方 tool-skill 机制与限制](https://github.com/deepseek-ai/deepseek-harness/blob/22ddee3792402c3e70ec5f86a63c3e3e895a2f60/packages/skill/tool-skill/README.zh.md)。本轮核对官方文档，未对官方宿主做运行验证。

## 5. 当前项目最该优化的顺序与进展

P11-05 的 Owner 标签复核与真实付费 Jev 评估仍保持 blocked；这不应阻塞无关的管理可靠性工作。

| 顺序 | 切片                                                                | 目标与验收                                                                                                                                                             |
| ---- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 统一只读检查结果；`check-updates` 已实现（P21-02） | 单个坏条目/来源/网络错误不遮住健康条目；逐项报告 error/checkedAt，整体 `complete=false`；本地修改与上游更新分别报告；未检查不得标成 latest；dry-run 文案不再声称已更新 |
| 2    | 文件 Diff 与现有来源的确认计划已实现（P21-03） | 列出文件/目录/执行位增删改；planToken绑定确切commit、当前/目标完整树和位置，apply需token+yes；漂移拒绝；保留备份/回滚，见ADR0011 |
| 3    | 显式来源迁移与修复                                                  | 来源移动/应用版本目录变化先只读诊断，给候选和迁移计划；人工选择后才重绑；不能自动猜上游、改 lock 或接受本地改动为干净基线                                              |
| 4    | 管理视图                                                            | 展示来源健康、可升级、本地修改、检查失败和备份历史；复用同一 core。现有 Web 是无鉴权只读，不能直接加写 API；先设计本机访问、请求来源和确认边界                         |
| 5    | 可选 DSH adapter 与刷新机制                                         | 让 DSH 使用 Hub provider/MCP 能力，验证同名覆盖、启停与更新可见性；避免再物化一套可写真源。必要时引入索引失效 watcher，并测试不完整扫描不清空 catalog                  |

调研时源码问题已核对：`planUpdate` 对单条异常直接 throw，且本地树偏离锁时在读取上游前停止；`listManagedSkills` 对扫描 issues 全局 throw；CLI 的 JSON `next` 在 dry-run 也写“Hub 已更新”。P21-02 已新增独立只读检查并修复列表容错及 dry-run 文案；实际 update/apply 的整批严格预检仍保留。这里不记录用户私有 Skill 名称、目录或清单。已实现契约见 [API](../architecture/API.md)。

来源：[当前 managed 实现](../../packages/core/src/managed.ts)、[CLI managed 返回](../../apps/cli/src/commands/manage.ts)、[现有管理手册](../ops/UNIFIED_SKILL_MANAGEMENT.md)。

## 6. 第一切片的最小边界

- 复用已有扫描/来源解析/树哈希；统一只读结果与错误隔离，避免 `list`、检查器、未来 UI 各写一套。
- 只读状态至少分开：本地 clean/modified/missing、上游 changed/unchanged/unknown、当前/目标版本与 hash、检查时间与 error；扫描不全必须可见。
- 只读检查可以逐条继续；apply 的预检和事务语义保持严格，不能借“容错”静默部分写入或覆盖本地修改。
- 同仓库/ref 的网络查询可共享快照，限制并发、超时和缓存寿命；第一次实现先保证语义和错误透明，不先造通用插件框架。
- 合成沙箱验收：坏来源 A 与健康 B 同时存在时 B 仍有结果；本地修改 C 仍能查上游且 apply 不可覆盖；固定 SHA 不被自动跟随新版本；缓存/超时不是最新证明；所有检查不改变 canonical/lock/catalog/index/Agent 目录。
- 第一切片不做市场聚合、自动安装、无人值守升级、依赖解析器或写 UI；之后独立评估。

## 7. 审查与未解决问题

DeepSeek Web 对上述事实摘要完成独立方案审查，建议先统一只读结果模型，将现有来源的 preview/apply 与来源迁移拆开，并保留不完整结果标志。主模型已按现有源码核对后采纳这些范围约束；没有采纳其泛化到所有系统都必须含 DSH root/workspace 字段的暗示，也不会因外部 ZIP 字段设计给当前 Git 锁增加无用字段。

研究对象已确认。用户随后授权自主推动项目，P21-02只读检查和P21-03版本绑定更新计划已实现并由合成沙箱验收。P21-03收紧旧update写入口的兼容变化及限制见 [ADR0011](../adr/0011-managed-update-plan-binding.md)。其余建议仍待后续切片推进；尚未决定是否需要 DSH 宿主适配和可写管理 UI。Gemini 的既有认证问题未重试或切换账号。
