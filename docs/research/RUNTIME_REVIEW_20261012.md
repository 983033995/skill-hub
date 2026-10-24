# Runtime复核修正与基线试验

状态：Active · 日期：2026-10-12

## 复核意见处理

| 问题 | 处理与证据 |
|------|------------|
| 全局指导写死skill_fetch | Qoder真实AGENTS备份后仅改已有Hub段，项目AGENTS及Qoder/WorkBuddy/MCP指南统一search→read。runtime不新增别名，仍3工具。Codex全局AGENTS未找到该旧指导段，没有无依据追加。 |
| runtime英文措辞歧义 | 改为“This server does not disable native Skill discovery.”；集成测试断言指引不含skill_fetch。协议入口runtime从2263变2262字节，full仍5442；历史记录不覆盖，当前指南同步。 |
| 中文bigram可能损伤短查询 | 50条草案任务比较旧排序、加权+unigram、加权+bigram；单字退化已复现并用单字专用回退修复。 |
| v1 artifact会否直接报错 | inspectBm25Index返回fresh=false/router=null，skillSearch回退现catalog内存BM25；已有测试验证结果存在、indexSource=memory与rebuild提示。 |
| full/runtime没有Native基线 | 新增显式运行脚本benchmark:native，真实110项元数据加1个合成验收Skill，三模式六任务已跑。它是上下文基线试验，不是生产Skill执行/质量验证。 |
| Codex隔离禁用是否可行 | 当前CLI 0.162.0-alpha.17.2的skills/list只读验证及临时CODEX_HOME配置已跑；未调用模型或修改个人配置。列表仍存在，只是enabled=false，不能由此宣称零注入。 |

## 召回草案集

`evals/router/recall.v1.json`包含30条需Skill的中英任务、15条基模型通常可直接完成的任务和5条歧义单字探针。标签由Agent基于现有catalog能力拟定，待Owner复核；不是匿名真实用户历史，也不是已批准产品门禁。公开数据不包含私人Skill正文。

```bash
pnpm build
pnpm eval:router
# 或传入指定catalog：pnpm eval:router /absolute/path/catalog.json
```

离线只用元数据，不执行Skill、不调用Jev或模型。三种排序使用同一份当前catalog；不把之前元数据缺词问题混进算法比较，也不称为历史快照。缺少标签所需Skill时明确失败。

| 同一110项catalog下的排序 | 主任务Hit@1 | 主任务Recall@5 | 无Skill任务返回候选 | 单字探针Hit@5 |
|-------------------------|--------------|----------------|---------------------|----------------|
| 原排序参考：全字段去重+unigram/bigram | 23/30 | 28/30 | 15/15 | 2/5 |
| 字段加权+unigram/bigram | 23/30 | 28/30 | 15/15 | 2/5 |
| 字段加权+bigram+单字回退 | 25/30 | 29/30 | 7/15 | 2/5 |

移除多字串unigram的初版单字探针为0/5；修正只在查询确实为一个汉字时从name/keywords/description覆盖回退，内存/持久化一致。单字意图歧义很大，2/5不说明模型一定调用错误。主任务剩余漏召回是英文“Humanize Chinese text and remove AI writing patterns”查中文humanizer-zh；当前不具跨语言语义保证。

无Skill任务候选率不是误激活率。BM25既没有经过标定的概率，也没有本次数据支持的拒答门槛；不要按raw score硬设阈值掩盖7/15残余。模型是否误调用须独立观测，因此`falseActivationRate=null`。5条单字探针不计入主Recall指标。

## Native/Hybrid/Hub-only试验

```bash
OPENCODE_NATIVE_BIN=/absolute/path/to/native/opencode pnpm benchmark:native provider/model
```

显式模型、110项现有catalog元数据和相同合成正文，加一个求和验收Skill；不读取原Skill正文，也不执行业务能力。三模式使用相同模型/任务/非Skill指导与配置，隔离默认外部Skill、项目配置和其它MCP。实际debug列表验证Native/Hybrid各111磁盘Skill，Hub-only为0；三者另有1个内置项，Hub-only原生skill工具关闭。描述短的100项合成试验仍保留独立结果，不混算。

本次模型`cliproxyapi/gemini-3.8-flash-high`：

| 模式 | 任务 | 首请求报告input | 各步input之和 | 各步cache.read之和 | 成功 |
|------|------|-----------------|---------------|----------------------|------|
| Native | 求和/标记 | 23347 | 25879 | 21296 | 是，原生skill调用 |
| Hybrid | 求和/标记 | 23998 | 26728 | 21948 | 是，Hub read调用 |
| Hub-only runtime | 求和/标记 | 5483 | 17734 | 0 | 是，Hub search→read |
| Native | 普通2+2 | 23318 | 23318 | 0 | 是，无工具 |
| Hybrid | 普通2+2 | 23969 | 23969 | 0 | 是，无工具 |
| Hub-only runtime | 普通2+2 | 5454 | 5454 | 0 | 是，无工具 |

Hub-only首请求报告input比Native低约76.5%。这是两任务单次试验，不能推出普遍节省率、长会话表现或计费比例；Native/Hybrid后续有缓存，不可只看input差额。原始cache/input语义来自宿主/代理报告，cost=0不证明免费。此试验只验证发现与合成任务链路，30–50真实业务质量/重复采样/缓存对照仍待实施。

脚本输出`outputs/opencode-native-comparison-latest.json`；原始描述仅进入临时fixture，不提交真实catalog或输出。

## Codex隔离发现

- 独立临时app-server进程，`initialize`→`skills/list`，不启动模型任务。官方依据：[Skills](https://learn.chatgpt.com/docs/build-skills)、[App server](https://learn.chatgpt.com/docs/app-server)。
- 当前配置的进程级`-c skills.config`覆盖：125发现项（repo1/user119/system5），enabled从123到0，列表数量仍125；个人config内容hash不变。
- 临时CODEX_HOME，仅创建合成home/project Skill并写临时config：58发现项（repo1/user52/system5），enabled从58到0，列表数量仍58；home-probe和project-probe均禁用。全局.agents仍可能被扫描，因此隔离CODEX_HOME不等于隔离整个Home。
- 未复制认证/插件缓存，没有证明插件Skill控制或模型初始上下文排除。当前会话原生清单仍在，仍不可宣称Codex已切Hub-only。

## 验证与部署边界

相关单字回退、旧索引和runtime指引回归通过，全量37文件159测试、build/lint/smoke和离线基准已执行；最终类型/文档/差异检查见PROGRESS。本机部署需更新构建并重连才能加载新代码；未重启运行中任务、未更换Skill目录或个人模型配置。Hook路由、通用Adapter框架和语义引擎继续暂缓。
