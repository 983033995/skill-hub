# Skill 管理与 Agent 决策项目的一手调研

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 记录日期 | 2026-10-06 |
| 方法 | GitHub README/源码入口、GitHub REST 仓库元数据；未把 README 自述当成事务安全证明 |
| 用途 | skill-hub 功能优先级和落地验收输入 |

## 1. 当前快照

GitHub REST 元数据读取于 2026-10-05 UTC；星数只记录规模，不代表质量、生产稳定性或安全性。

| 项目 | Stars | 最近 push | 许可证元数据 | 一手入口 |
|------|------:|-----------|-------------|----------|
| `vercel-labs/skills` | 33,167 | 2026-10-02 | MIT | [README](https://github.com/vercel-labs/skills#readme) · [API](https://api.github.com/repos/vercel-labs/skills) |
| `numman-ali/openskills` | 10,772 | 2026-01-18 | GitHub API 未声明（README 自称 Apache-2.0） | [README](https://github.com/numman-ali/openskills#readme) · [API](https://api.github.com/repos/numman-ali/openskills) |
| `runkids/skillshare` | 2,712 | 2026-10-05 | MIT | [README](https://github.com/runkids/skillshare#readme) · [API](https://api.github.com/repos/runkids/skillshare) |
| `nibzard/skillctl` | 0 | 2026-09-03 | Apache-2.0 | [README](https://github.com/nibzard/skillctl#readme) · [API](https://api.github.com/repos/nibzard/skillctl) |
| `agentskills/agentskills` | 25,922 | 2026-08-09 | Apache-2.0 | [README](https://github.com/agentskills/agentskills#readme) · [Specification](https://agentskills.io/specification) |
| `browser-use/jev-ultrafast` | 22,071 | 2026-09-30 | MIT | [README](https://github.com/browser-use/jev-ultrafast#readme) · [performance limits](https://github.com/browser-use/jev-ultrafast/blob/main/docs/performance.md) |

## 2. 已核对的能力和可借鉴点

### `vercel-labs/skills`

README 当前写明支持 OpenCode、Claude Code、Codex、Cursor 和其他 Agent；`skills add` 安装来源，`skills use` 将选中 Skill 写入临时目录并生成 prompt，只有传入 `--agent` 才启动 Agent。可借鉴“先暂存/预览再使用”的路径，避免每次试用都污染 canonical。当前 skill-hub 已有 install/update 和 dry-run，但还没有独立的 `use` 临时上下文命令。

### `numman-ali/openskills`

README 写明通过 `AGENTS.md` 生成 `<available_skills>` XML，正文用 `read <skill-name>` 按需加载；支持项目/全局/universal 目录、GitHub/本地/私有 Git 来源。它证明“元数据发现 + 精确正文加载”可以脱离 MCP 工作。当前 skill-hub 已有 `browse/read` 和 MCP，但缺少可提交到项目的最小 manifest 导出。

### `runkids/skillshare`

README 当前版本为 v0.24.6，覆盖 skill、agent、MCP、plugin、hooks 和 project mode；它提供 `audit`、目标级 copy/symlink、GitHub Actions、桌面 UI 和 team onboarding。可借鉴的是审计先于 sync、按 target 过滤和项目级声明。它的范围明显大于 skill-hub，本项目不应现在复制插件/Hook/桌面平台。

### `nibzard/skillctl`

README 提供 `.agents/skillctl.lock`、导入缓存、overlay、`override`、`fork`、`pin`、`rollback`、`explain/path/doctor/history`，并声明 MCP v1 tool parity。它把“来源锁”和“本地覆盖”作为一等模型。当前 skill-hub 已有 managed-lock、history、explain/path 和更新保护，但还没有 pin/rollback/overlay 的用户工作流。

### `agentskills/agentskills`

README 定义 `SKILL.md` 加可选 scripts/references/assets 的目录格式，以及 discovery → activation → execution 三阶段渐进披露。它是格式和加载语义的规范入口，适合用来约束 manifest、审计和正文读取，不应把普通 Markdown 知识库混入 Skill catalog。

### `browser-use/jev-ultrafast`

README 采用动态、带索引的页面动作集合；一次 Jev 请求同时选择 operation 和兼容 target，执行前重新检查页面新鲜度、遮挡和邻近上下文，并独立验证 `DONE` 结果。README 同时明确 benchmark 只覆盖少量任务，shadow root、canvas、uploads 等仍是 MVP 边界。对 skill-hub 的启发是：Jev 结果必须绑定当前候选快照，并在执行边界前做确定性验证；不能把概率直接当授权。

## 3. 与当前项目的差距

| 优先级 | 功能 | 当前状态 | 来源启发 | 验收方式 |
|--------|------|----------|----------|----------|
| P11 | 静态安全审计 | 本轮落地 | skillshare `audit`、Jev 执行前验证 | CLI/MCP/Web 同一报告；危险规则命中返回非零策略码；不执行文件 |
| P12 | 最小 `available_skills` manifest | 缺失 | OpenSkills + Agent Skills progressive disclosure | 只写 name/description/path/MCP 读取提示；dry-run 与原子写；正文不注入 |
| P13 | pin/rollback/overlay/fork | 部分存在（lock/history/backups） | skillctl | 来源 commit、完整 tree hash、覆盖关系和回滚演练 |
| P14 | target/project 声明和导出 | scope 已有，manifest 缺失 | skillshare project mode | 项目目录显式声明，默认不污染全局 Agent |
| P15 | Jev 评估与置信度校准 | 有单次真实调用，缺标注集 | Jev Ultrafast 的测量边界 | ≥30 条本地任务、BM25 对照、混淆/升级率、延迟与费用 |
| P16 | 发布/CI 门禁 | 本地门禁存在，远端 workflow 未收敛 | 竞品 CI/发布脚本 | typecheck/build/lint/test/integration + 只读验收报告 |

## 4. 明确不复制的范围

本轮不接管第三方插件权限、MCP 连接、hooks、桌面 GUI、团队遥测或 Agent 自身执行器；这些会扩大安全边界并混淆 Hub 与宿主的职责。先把 Skill 的来源、审计、按需读取、投影和回滚做成可验证闭环。

## 5. 结论

skill-hub 的已有架构方向成立：canonical + managed lock + metadata route + MCP progressive read + explicit sync 已覆盖主干。下一阶段应按“审计 → manifest → pin/rollback/overlay → 评估/CI”推进；每一步都必须有沙箱闭环、真实 CLI/MCP/Web 证据和文档记录。 
