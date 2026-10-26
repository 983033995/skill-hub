# 数据模型 — Skill Hub

状态：Active · v0.1.0 · 更新：2026-10-26

以packages中的TypeScript定义和[API](API.md)为准。元数据hash、目录版本、确认计划、使用记录是不同概念，不可互换。

## 1. Skill元数据与catalog

SkillMeta含name、description、path、hash、mtimeMs，可选keywords、agentsPresent、source和provenance。path是当前登记真源路径：受管Skill通常在canonical，显式登记的project/workspace条目也可在外部路径。hash是SKILL.md文本的SHA-256，不是完整树或Git commit。

provenance可记录scope（user/workspace/project）、sourceType、sourceRef、revision、status和overlayOf。旧数据缺省scope按user处理。overlayOf仅表示逻辑关系，不执行基底合并或继承。

catalog.json为version=1、updatedAt、skills[name]。目录冲突按name分组；provenance/scope/status及确定性排序可给出解释性代表项，不构成覆盖授权。

## 2. 受管来源与目录版本

managed-lock.json：version=1，skills[name]保存以下来源锁：

| 字段         | 语义                                             |
| ------------ | ------------------------------------------------ |
| type         | local或github                                    |
| path         | local来源的绝对根路径                            |
| url          | 规范化公开GitHub HTTPS仓库URL                    |
| ref / commit | 用户选择的Git引用与实际解析的完整commit          |
| subpath      | 相对来源根的Skill目录，单Skill根为.              |
| treeHash     | Skill完整目录内容、路径、执行位和空目录的SHA-256 |
| overlayOf    | 可选逻辑基底名称                                 |

完整树忽略.git和时间戳；链接按受限解引用后的内容处理，越界/环路拒绝。文件清单差异的path/change/before/after只保留类型、摘要、执行位，不含正文。

update/migrate-source的planToken是版本化内容指纹，绑定目标集合、真实Hub位置、旧/新来源锁和当前树。迁移使用独立合同；token不是身份、权限或离线包。目录和来源锁的事务边界见[ADR0011](../adr/0011-managed-update-plan-binding.md)。

managed备份位于唯一批次中；managed-rollback.json在Skill树外保存该批次旧锁，配合备份treeHash供单Skillrollback使用。早期没有侧车快照的备份不能等同于可回滚版本。

## 3. 路由产物

index/index-meta.json记录engine、builtAt、skillCount、catalogHash及artifact信息；bm25.json保存元数据和检索统计，不存正文。当前Bm25IndexArtifact version=2，过期算法/损坏artifact/catalog或内容漂移会影响freshness，读取层返回原因及重建建议。catalogHash不包含updatedAt。它不是使用次数、Skill安装锁或质量证明。

TypeSafe的RouterDecision是只读选择、概率、confidence和升级建议。最近请求metrics是实例级快照，不是并发逐调用关联结果；缺失usage保持null。

## 4. 生命周期与使用事件

| 数据           | 内容                                                                              | 默认写入                       |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------ |
| history.jsonl  | ingest/sync/index/overlay/fork等生命周期元数据                                    | 对应真实管理步骤；不是读取次数 |
| usage JSONL v1 | 时间、cli/mcp/web/library、search/read成功/错误码、Skill名、阶段、大小/启发式估算 | 仅显式SKILL_HUB_USAGE_LOG进程  |

usage不保存query、描述、正文、附件路径或错误详情。首段、续读和附件分列；无历史不等于零使用。聚合中的usageRate是在所选时间/来源内，该Skill首段次数除以当前catalog全库首段总数，再做UI过滤/分页。无观测或无分母保持null。字符/字节与启发式Token不同于真实计费；实际模型Token/费用保持null。完整schema与限制见[使用手册](../ops/USAGE_AND_CONTEXT.md)。

## 5. 兼容分发与备份

SyncPlan含mode、canonicalDir、items、summary。每项含agentId、skillName、action、target、source、expectedSkillHash；支持create/update/replace的symlink/copy动作及conflict/noop/skipped。apply需复验来源与路径边界，copy验证同时比较SKILL.md与完整目录，附件漂移也会失配。

BackupManifest version=1保存createdAt、backupDir、agents及可选canonical/hub信息；每个目标有path/backupPath/exists/entryCount，可附错误与跳过状态。它不是managed来源锁侧车。restore按真实manifest替换目标，不与catalog/index构成跨包原子事务。

## 6. 名称与一致性

名称执行trim/lowercase、空白与下划线转连字符、非法字符过滤、连字符折叠；空名或路径式名称拒绝。具体符号允许集合以shared/paths和调用方边界校验为准。

- catalog可以含外部project/workspace真源，不能假设所有path都在canonical。
- managed写入要求当前完整树等于锁基线；变更来源/内容需对应显式流程。
- 原生投影仅是兼容副本或链接，不应变成第二个可写真源。
- 索引、备份、manifest、使用记录存在，不证明宿主已执行Skill或模型任务成功。
