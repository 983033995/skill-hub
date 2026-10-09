# ADR 0008 — 以 Jev 作为可选 Skill 语义路由器

- 状态：Accepted
- 日期：2026-09-23
- Owner：script

## 背景

skill-hub 现有 BM25 路由具备本地、确定性、低延迟和离线可用的优点，但对中文自然语言、同义表达和跨领域任务的语义判断有限。TypeSafe AI 的 Jev 适合做“候选 Skill 中哪个最相关”的结构化 Choice 判断，但它是远程服务，不能成为核心链路的硬依赖。

## 决策

新增 `external-typesafe` `RouterEngine`：

1. 只发送候选 Skill 的 `name`、`description`、`keywords`，不发送 `SKILL.md` 正文、附件、用户目录路径或凭据。
2. 使用 Jev System One API 的单个 Choice 问题读取完整概率分布，以概率排序返回 Top-K。
3. `bm25` 仍是默认引擎；CLI、MCP 和 Web 可显式选择 `external-typesafe`。
4. 缺少 `TYPESAFE_API_KEY`、候选超过 Jev Choice 上限、网络/鉴权/超时/响应错误时，自动降级 BM25，并在结果中报告 `degraded` 和 `degrade_reason`。
5. 不把 Jev 塞入通用 `LlmProvider`，因为 Jev 的 System One API 不是 chat/embed 协议；它属于路由判定能力，不是文本生成 Provider。
6. 成功调用时透出只读 `decision` 元数据：按 Skill 名称映射的概率、`selected`、`confidence`、本地阈值和 `escalation_recommended`。该信号只供上层升级判断，不触发 Skill 执行或写操作。

## 取舍

- 优点：保留 BM25 的离线安全底座，同时获得自然语言语义排序；不需要引入 embedding 或新索引格式。
- 代价：每次 Jev 路由会产生外部网络请求和费用；候选元数据可能离开本机；延迟受服务和网络影响。
- 限制：当前单次 Choice 最多支持 254 个 Skill 候选（另保留 `none_of_the_above`），超过时直接走 BM25。
- 升级阈值默认 `0.65`，由 `TYPESAFE_MIN_CONFIDENCE` 调整；它是本地策略提示，必须用自己的任务数据校准。

## 验证

- `packages/router/src/typesafe.test.ts` 覆盖元数据最小发送、概率排序、无匹配、缺 Key、候选上限。
- 实际 catalog 运行 `external-typesafe`，Jev 返回 `jev-1.13.0`，能够返回语义相关的 `skill-hub-agent-distribution` 等结果。
- 清除 `TYPESAFE_API_KEY` 后，CLI 仍返回 BM25 结果且 `degraded=true`。

## 回滚

将 `router.engine` 保持为 `bm25`，或不传 `--engine external-typesafe`；不需要迁移 catalog、索引或用户 Skill 目录。
