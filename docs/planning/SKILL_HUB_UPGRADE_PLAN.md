# skill-hub 升级方案与推进计划

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.2 upgrade plan |
| 最后更新 | 2026-08-16 |
| Owner | script |

## 1. 产品审计结论

### 总判断

`skill-hub` 的总体方向是合理的：Canonical Store、元数据路由、按需读取正文、dry-run/backup/冲突保护，和本地多 Agent 的真实痛点高度匹配。它现在更准确的定位是“本地 Skill 控制平面”，而不是知识库本身，也不是替代 Agent 原生 discovery 的万能入口。

当前基线已经具备可用闭环，但在进入稳定 v1 前还需要补齐三个产品契约：

1. 目录扫描必须对真实目录和目录 symlink 等价处理；
2. 配置声明的分发模式必须和实际行为一致；
3. Skill 的作用域、来源和版本信息要能解释“为什么这个实例胜出”。

### 审计范围与证据

本次以 CLI/MCP 的核心任务流作为产品流程审计对象：

```text
inventory → ingest/canonical → index → route → fetch/MCP → sync → verify
```

已检查仓库实现、项目文档、fixture/integration 测试，并在用户目录执行了只读 `inventory`/`doctor` 回归。当前仓库没有可视化界面，因此这不是基于截图的视觉或 WCAG 审计；可访问性结论仅限 CLI 文案、错误恢复和 JSON 可观测性。X 上的讨论作为社区经验线索，不作为实现正确性的单独证据。

### 已确认的优势

- Canonical Store + 端侧投影的边界清楚，适合本地优先和可回滚操作。
- `route` 默认只返回元数据与 Top-K，符合“搜索 → 读取正文”的渐进披露模式。
- `sync --dry-run`、backup、冲突不覆盖和 `replace-real` 形成了可审计的写入闸门。
- MCP 保持只读，CLI 与 MCP 共用 `hub-service`，减少两套行为漂移。
- 本项目不接管 Obsidian Vault、普通 Markdown 或本地知识库；相关内容属于另一个 memory plane，本轮只保证 Skill plane 边界清晰。

### 本轮已修复的高风险问题

| 问题 | 影响 | 处理 |
|------|------|------|
| 扫描器只接受 `Dirent.isDirectory()` | Agent 目录中的 Skill symlink 全部漏报 | 扫描目录 symlink，跳过坏链/文件链，并按 realpath 防循环 |
| `sync.mode: copy` 只有配置没有执行 | 配置与实际投影行为不一致 | 新增 copy 计划、apply、内容校验和回归测试 |
| lint 5 个错误 | 质量门禁无法闭环 | 修复无效可变声明与 Node 脚本全局声明 |

### 仍然存在的产品风险

- `index` 当前持久化的是 `index-meta.json`，路由仍从 catalog 在内存重建 BM25；应在文档中明确语义，后续再决定是否做真正的持久化索引。
- route 阶段的 Top-K 不等于 Agent 原生启动时的 discovery 可见性收缩；后续要单独设计 hook/MCP 注入策略。
- 真实 `doctor` 仍会报告本机 `~/.claude/skills` 缺失；这是当前环境状态，不应通过默认配置静默掩盖。

## 2. 与本地知识库的边界决策

保留两个互补平面，不合并成第二套 Obsidian：

| 平面 | 事实源 | 负责什么 | 不负责什么 |
|------|--------|----------|------------|
| Memory plane | Obsidian Vault Markdown、Properties、Wikilink/backlink、Inbox | 经验、事实、项目上下文、验证记录 | Agent Skill 的执行契约 |
| Skill plane | `SKILL.md` 及其 references/scripts | 可触发的操作规范、工具流程、可复用能力 | 全量知识沉淀 |

Skill plane 的最小路径是 `inventory → ingest → index → route/fetch → sync → verify`。任何 memory plane 查询或知识库读取都不由 skill-hub 实现；即使某个项目目录同时存在 `.claude/skills`，也只能把该目录作为显式本地 Skill source 纳入，普通 Markdown 永不进入 catalog。

## 3. 可执行推进计划

### P0：可靠性闭环（本轮完成）

- [x] symlink-aware scanner：真实目录、目录 symlink、坏链、文件链、环路。
- [x] copy projection：`create_copy` / `update_copy` / `replace_real_copy`，默认不覆盖实体目录。
- [x] copy verify：检查实体目录及 `SKILL.md` hash。
- [x] lint、typecheck、相关单测恢复为绿。
- [x] 真实用户目录只读 `inventory`/`doctor` 回归。

验收门槛：扫描不漏掉 canonical 指向的目录 symlink；copy dry-run/apply/verify 在沙箱闭环；用户目录无写入。

### P1：来源与作用域（本轮完成）

1. [x] 为 `SkillMeta` 增加向后兼容的可选 `provenance`：scope、sourceType、sourceRef、revision、status、overlayOf。
2. [x] 增加 `sources` 配置，区分 `user`、`workspace`、`project`；project/workspace source 不默认 sync 到全局 Agent 目录。
3. [x] 将同名 Skill 的胜出原因写入 inventory：scope 优先级、source、hash/revision。
4. [x] 增加 `inventory --scope`、`inventory --sources`、`route --scope`，显式过滤且不隐式收缩全局候选。

验收结果：同名实例可追溯；任意显式本地 Skill source 只识别 `SKILL.md`，不会导入普通 Markdown；旧 catalog 无新字段仍可读取并按 user 兼容。

### P1：索引与查询体验

1. [x] 明确 `index` 的产品语义：`catalog freshness + 可加载持久化 BM25 artifact`。
2. [x] 增加 catalog hash/staleness 检查，route 输出 `index_fresh`、index source 与 rebuild 建议。
3. 保留“元数据常驻、正文按需”的默认策略；为中文 query、scope 和 profile 增加评估集。

验收门槛：200 Skill 本地 route p95 ≤ 50ms；索引过期可解释；Top-3 评估不因 scope 过滤退化到不可用。

### P2：可解释同步与 Agent 可见性

- [x] `skill-hub explain <name>`：展示来源、scope、hash、胜出原因、overlay/fork 和投影端。
- [x] `skill-hub path <name>`：展示 canonical、各 Agent target、project source。
- [x] `skill-hub history [name]`：追加 ingest/index/sync/overlay 生命周期元数据。
- lock/update/prune 仍作为后续独立能力，不在本切片扩大范围。
- 将 Agent 原生 discovery、hook/MCP 注入和 route Top-K 分开测量，不宣称 route 已经替代宿主 discovery。

## 4. 实施顺序与停止条件

```text
P0 扫描/投影可靠性
  → P1 scope/provenance 最小模型
  → P1 index freshness/评估
  → P2 explain/path/history
  → 再评估 GUI/TUI 与团队 Git
```

每个切片都必须满足：相关测试新增或更新、`pnpm typecheck`、`pnpm lint`、`pnpm test` 通过，且对用户目录只做明确的只读检查或 dry-run。没有真实使用数据前，不提前引入 embedding、云端 registry、第二套 memory MCP 或复杂 GUI。

## 5. 回归清单

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm lint
node apps/cli/dist/index.js inventory --json --agents workbuddy
node apps/cli/dist/index.js inventory --json --scope user
node apps/cli/dist/index.js doctor --json
```

对用户目录的最后两项保持只读；`sync --apply`、`restore --apply` 仍需用户明确授权、备份和双重闸门。

## 6. 外部研究对齐

- [Agent Skills Specification](https://github.com/agentskills/agentskills)：采用开放的 `SKILL.md` 形态，保留来源与兼容性扩展空间。
- [Vercel skills](https://github.com/vercel-labs/skills)：参考目录 symlink 处理和 Agent 端投影思路。
- [skillctl](https://github.com/nibzard/skillctl)：参考 source/revision、lock/update 和 explain/path 方向。
- [AI Skills Librarian](https://github.com/tomkraaij/ai-skills-librarian)：参考本地 catalog、版本与维护工作流。
- [Skill Scope Manager](https://github.com/zero471/skill-scope-manager)：参考 user/project scope 与按需启用。
- [Kepano：Obsidian Skills](https://x.com/kepano/status/2039819457720430919)、[Obsidian Skills 社区讨论](https://x.com/simplifyinAI/status/2085148569062023525)：支持“Skill 与知识库分层、局部启用”的社区经验判断。
- [Hooks/Memory 讨论](https://x.com/affaan/article/2012378465664745795)、[分层上下文讨论](https://x.com/DanKornas/status/2087612833559375959)：支持把 memory capture、hook 注入和 Skill route 作为协同而非同一存储层。
