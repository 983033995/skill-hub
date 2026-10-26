# 本地使用观测与上下文预算

## Web 使用与预算

在运行最新构建的 Web 服务中，打开主导航“使用与预算”（`/#/usage`）。页面默认近30天、MCP来源，显示使用样本、元数据预算、逐项正文/首段预算和读取明细；不会通过浏览报告开启日志或增加使用次数。旧 Web 进程须重新启动才会加载新增服务端接口，仅刷新静态页面不能更新API。

- 支持近7天/30天/当前日志全部、MCP/CLI/Web/library/全部来源、分类、关键词、观测状态筛选。
- 支持使用率高到低/低到高、最近读取、正文Token粗估升降序、名称排序；在整个当前catalog筛选排序后分页，未知值始终排后。
- 使用率是所选时间和来源内，该Skill成功正文首段请求数除以当前catalog全部Skill的正文首段请求总数。分母在分类/关键词/状态筛选前计算；已移出catalog的记录不计入此分母，续读/附件不计入。切换时间或来源会改变分母，单纯筛选不会把一项自动变成100%。
- 没有该Skill观测记录时，次数/占比显示未知；有候选或附件记录但没有正文首段、且全库有首段分母时，占比可为0%。全库没有首段样本则不计算百分比。少于20次首段样本提示样本偏少；这是显示提示，不是使用质量门槛。
- 默认不混入Web人工浏览，选择“全部（含Web）”时明确包含它。使用率仅代表可见日志的读取分布，不是任务采用率或任务成功率。缺失/损坏日志和预算读取失败均有独立提示；预算仍是启发式估算，不是模型账单。

页面只调用固定只读接口`GET /api/usage-overview`，不能选择任意服务器文件路径；使用的日志由服务进程环境变量或状态目录默认路径确定。每次刷新重新观察本地记录与文本，不缓存历史为完整事实。筛选刷新会重新扫描当前预算，超大库应按实际响应时间评估，不承诺全库扫描p95。

`usage`回答Hub被如何读取，`context-cost`回答一段Skill文本大约多大。二者都不证明模型实际采用、执行成功或产生多少费用。设计决策见[ADR 0012](../adr/0012-local-usage-context-estimates.md)。

## 静态预估：不需要开启记录

先构建，再检查当前catalog或显式选择的catalog：

```bash
rtk pnpm build
rtk pnpm hub context-cost --json
rtk pnpm hub context-cost skill-name --max-chars 8000 --context-window 128000 --json
rtk pnpm hub context-cost --catalog /absolute/catalog.json --json
```

每项分别提供：

| 字段                      | 口径                                                                      |
| ------------------------- | ------------------------------------------------------------------------- |
| metadata                  | `name + 换行 + description`，不是完整宿主注入格式                         |
| fullBody                  | 当前完整SKILL.md，包括frontmatter，不含附件                               |
| initialPage               | 从第0个UTF-16位置起的maxChars首段，默认8000；实际宿主可能使用不同分页参数 |
| initialPageContextPercent | 首段粗估Token除以显式context-window；未指定窗口为null，不代表剩余上下文   |
| contentHash               | 当前读取的SKILL.md内容hash，不是整目录锁hash                              |

估算为`utf8-heuristic-v1`：ASCII字符每4个计1，其余Unicode码点每个计1.5，向上取整。同时报告UTF-16长度、Unicode码点和UTF-8字节。它是透明的粗略比较指标，不是模型tokenizer结果，不保证误差范围；代码、中文、特殊符号的实际tokenizer差异可能很大。单条文本粗估之和也不等于拼接后的真实tokenizer结果。

不要把metadata和fullBody自动相加当一次真实调用：按需加载不会必然注入全库正文，元数据也可能由宿主选择性提供。工具定义、协议JSON封装、对话历史、重复注入、缓存和模型定价不在此估算内。`model/actualModelTokens/actualCost`为null，不能推导实际节省或账单。

使用既有根内安全读取、UTF-8/二进制和10MiB限制；不执行Skill，不递归加载附件。逐项失败保留其他结果，失败项正文和首段为null，`complete=false`，CLI退出3。catalog缺失时扫描回退也标为不完整。静态盘点不产生usage事件，即使进程已开启记录。

## 记录使用：显式可选

默认关闭。只给需要记录的CLI/MCP/Web进程设置`SKILL_HUB_USAGE_LOG`，值为独立的**绝对.jsonl路径**。推荐放在Hub状态目录内，与canonical、catalog和生命周期history分开。示例仅影响这一次CLI调用：

```bash
rtk proxy env SKILL_HUB_USAGE_LOG=/absolute/hub-state/usage.jsonl pnpm hub read skill-name --max-chars 8000
rtk pnpm hub usage --log /absolute/hub-state/usage.jsonl --days 7 --json
rtk pnpm hub usage skill-name --log /absolute/hub-state/usage.jsonl --days 30 --origin mcp --json
```

MCP/Web要记录时，应由维护者给启动它们的进程配置此变量；给当前终端设置变量不会影响已经运行的客户端或服务。仓库不会自动编辑宿主配置、重启服务或开启用户的生产记录。`privacy.telemetry`原配置不启用此能力，没有远端遥测。

| 计数                        | 含义                                                |
| --------------------------- | --------------------------------------------------- |
| appearances                 | Skill出现在成功搜索候选中的次数，不代表被选择       |
| initialBodyReads            | 正文offset=0的成功服务读取请求，不是唯一任务/会话数 |
| continuationBodyReads       | 正文offset>0的续读请求，与首段分列                  |
| attachmentReads             | 文本附件成功读取请求，分页附件也按调用计            |
| errors                      | 已进入search/read服务层的失败请求，仅保留错误码     |
| returnedChars/returnedBytes | 成功读取实际返回的正文或附件文本大小；不含封装      |
| estimatedReturnedTokens     | 对上述返回文本的逐次启发式粗估之和，不是账单        |

fetch复用的内部read只记录一次；fetch在进入read之前的参数/元数据校验错误和MCP参数校验错误不在read服务失败计数内。目录files/list浏览不计为正文加载。重复首段请求会重复计数，不跨请求/会话猜测去重；Web人工浏览与cli/mcp/library分别分组。当前无法知道具体MCP客户端身份，也看不到绕过Hub的原生磁盘读取。服务返回不证明客户端已接收或模型最终保留了文本。

只保留时间、界面来源、Skill名称、阶段、大小/粗估及错误码；不存query、Skill描述/正文、附件路径、完整错误详情或凭据。日志新文件权限0600；同机Skill名称与频率仍属于私有元数据，不应提交Git或上传第三方。

缺失文件显示`exists=false`、`recordedSince=null`，不能解读为历史从未使用。recordedSince是当前文件最早可见记录，不保证连续采样；usage返回的recordingEnabled仅表示当前报告进程配置了变量，不证明其他客户端已启用或每次落盘成功。days范围1到3650，不传为当前文件全部；origin可选cli/mcp/web/library。坏行、未知schema和不完整末行保留健康记录并标记不完整，CLI退出3。未来时间记录作为异常行报告，避免时钟错误制造“最近使用”。

日志只追加，不跟随最终文件symlink，不截断已有文件；拒绝向首行不符合usage schema或末行不完整的文件追加。单事件上限64KiB，搜索最多记录100个候选；读写文件上限32MiB。写失败通过stderr显式告警，不把成功的搜索/读取改成失败；因此不能保证usage是无遗漏的审计账本。达到上限或不再需要记录时，维护者应先停用变量，再按个人文件管理规则归档；本版不自动删除/轮转日志或补造历史。
