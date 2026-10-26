# 用户场景 — Skill Hub

状态：Active · v0.1.0 · 更新：2026-10-26 · 对齐：[PRD](PRD.md)

| 场景            | 操作路径                                            | 成功标准/边界                                                  |
| --------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| 盘点散落的Skill | inventory，按sources/scope筛选；Web多端盘点         | 展示配置目标和内置来源的目录/用途；缺目录不等于Agent未安装     |
| 新建统一库      | 新状态根init → install预览 → 显式apply/yes          | 创建受管副本及来源锁；不自动写Agent目录                        |
| 迁入已有Skill   | 选择明确来源 → ingest --dry-run → 处理冲突后导入    | 增量保留catalog；未绑定上游不伪造受管来源                      |
| Agent按任务加载 | MCP search → read → files/read附件                  | 精确名直接read，按页读取；正文不是执行授权                     |
| 检查/升级Skill  | check-updates → update预览 → token+apply+yes        | 单项失败可观察，实际写入严格；漂移拒绝旧计划，本地修改受保护   |
| 来源移动        | migrate-source name --source新位置预览 → token确认  | 新来源与安装基线同内容；保留旧锁备份，不升级内容               |
| 回滚受管版本    | rollback name --from精确backupPath预览/确认         | 当前树和备份锁一致；旧来源路径不会被重新创建                   |
| 查看使用率      | Web使用与预算，选时间/来源、分类/关键词，使用率排序 | 先全库筛排再分页，筛选不改分母；无历史显示未知                 |
| 估计上下文预算  | context-cost或Web预算                               | 元数据/全文/首段分列，字符/字节和粗估Token明确，不冒充账单     |
| 做静态风险检查  | audit单项/全库                                      | 发现项与不完整状态可见；不执行Skill，不保证绝对安全            |
| 兼容原生目录    | backup → sync --dry-run → 明确确认apply → verify    | 限定目标、备份有效、冲突不静默覆盖；不以目录一致证明上下文减少 |
| 导出兼容清单    | manifest预览 → --out/--apply/--yes                  | name/description及Hub使用提示，不含正文；不是默认全库注入      |
| 可选语义决策    | 显式选择Jev及允许query/metadata传输                 | 返回概率与建议；失败回退，不把建议当执行权限                   |

默认先使用Hub MCP，不需要全量sync。涉及用户目录写入、真实服务/客户端配置和付费模型时，按当前任务显式授权范围执行。[运维与恢复](../ops/OPERATIONS_AND_RISKS.md)提供实际支持的命令与恢复边界。
