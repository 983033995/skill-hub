# Jev 作为 Agent 决策层：外部观察与项目落地

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v1 |
| Owner | agent |
| 来源 | [@Arindam_1729 X 帖子](https://x.com/arindam_1729/status/2106750207254032411?s=46) |
| 帖子日期 | 2026-10-04（用户提供的核对记录） |
| 记录日期 | 2026-10-05 |
| 官方核对 | [HTTP API](https://docs.typesafe.ai/api)、[Choice](https://docs.typesafe.ai/primitives/choice)、[Confidence](https://docs.typesafe.ai/confidence)（2026-10-05 实时读取） |
| 用途 | 设计输入，不作为第三方基准或正确性证明 |

## 1. 观察摘要

帖子把 Jev 放在 Agent 循环的“决策层”：LLM 负责生成，Agent 负责执行，Jev 负责从固定集合中做下一步选择。典型决策包括选择工具或页面元素、保留哪段工具上下文、选择 Skill/模型、是否重试或停止，以及下一步搜索位置。

Jev 是 TypeSafe AI 的 System One 模型。根据帖子所引用的官方说明，它接收状态和预先定义的问题，返回类型化答案与概率；问题类型包括 Choice、Score 和 Noul。它不生成文本，因此调用方不需要解析自由文本。并行评估多个窄问题适合放在高频 Agent loop 中。

用户提供的分析还记录了 2026-09-15 early access、Diogo Almeida 创办公司和 DCVC 领投 4000 万美元种子轮、约 70–500 ms 延迟、输入约 $0.042/百万 token、RLCD 训练，以及帖子当时的 397 赞/795 收藏/约 7.3 万浏览。以上发布信息、报价与互动数据在本轮没有独立核实，不用作实现验收。帖子引用作者自己的 9 月 25 日 X 长文，附短视频并后续补 YouTube 讲解；本轮没有取得这些原始内容。

这组仓库示例覆盖了浏览器操作、上下文压缩、交易决策、Skill 路由、代码审查、监督 coding agent、搜索、移动端动作和模型路由。它们说明“决策层”是一个可复用位置，而不是某个单独产品形态：

| 仓库 | 帖子中的决策位置 |
|------|------------------|
| `browser-use/jev-ultrafast` | 从页面元素中选择动作和目标 |
| `tamaratran/fast-jev-compaction` | 判断哪些 tool call 结果仍需保留 |
| `TheoLeeCJ/SemIf` | 本地 Jev 风格决策实现 |
| `jarrodwatts/jev-trader` | Monad 区块上的买/卖/等待 |
| `kerpopule/hermes-jev-skills` | Skill、记忆、路由与压缩选择 |
| `devagrawal09/jev-review` | 代码审查判定 |
| `thruwire/foreman` | coding agent 的继续、重试、验证或停止 |
| `superagents-lab/jev-search` | 搜索位置和搜索方式 |
| `droidrun/mobile-jev` | Android agent 下一步动作 |
| `gargpratyush/jev-router` | 不同任务的模型路由 |

## 2. 对 skill-hub 的取舍

skill-hub 当前最适合把 Jev 放在“Skill 候选决策”这一窄边界：候选集合固定、调用频率可能很高、结果可以回退到本地 BM25。Jev 只接收 `name`、`description`、`keywords`，不接收 `SKILL.md` 正文、附件、用户路径或凭据。

本轮新增的决策元数据包括：

- `selected`：Jev 选择的本地 Skill 名称；
- `probabilities`：按 Skill 名称映射的 Choice 概率；
- `selected_probability`：被选项概率；
- `confidence`：直接使用官方 Choice answer 的置信度，与被选项概率分别保存；官方计算为 `(p_max - 1/n)/(1 - 1/n)`，`n` 包含无匹配选项；
- `threshold`：本地升级建议阈值，默认 `0.65`，可用 `TYPESAFE_MIN_CONFIDENCE` 调整；
- `escalation_recommended`：`confidence` 低于阈值或选择 `none_of_the_above` 时为 `true`。`0.65` 是未经本地数据校准的初始提示值。

这个信号只用于让上层决定是否交给更强模型或人工复核，不会自动执行 Skill、交易、脚本、重试或停止。默认引擎仍是本地 BM25；Jev 缺 Key、超时、鉴权失败或响应不符合契约时继续降级 BM25。

## 3. 需要打折的结论

- “不能幻觉”只能理解为输出受 Choice 集合和类型约束；不等于单次选择正确。
- 概率校准是群体统计属性，不能直接当作交易、代码审查或点击动作的执行授权。阈值应由各自数据集校准。
- 速度、价格、星数和第三方仓库的演示结果属于发布期观察；本项目不把它们写成生产质量承诺。
- `jev-trader` 的 mock 启发式、开放权重替代和供应商锁定风险需要独立复核；它们不构成本仓库的依赖。
- 复杂任务仍应拆成多个窄问题，由代码组合结果；Jev 当前在本项目中只承担一个 Choice 路由问题。

## 4. 验证边界

本仓库验证的是请求只发送 Skill 元数据、Choice 概率能排序候选、无 Key/网络失败/候选超限能回退，以及决策元数据能从 Router 传到 CLI/MCP/Web。它没有独立核实上述十个仓库和星数，也没有验证其生产质量、TypeSafe 的独立基准、交易收益或任何自动执行安全性。
