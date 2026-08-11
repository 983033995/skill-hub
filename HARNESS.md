# HARNESS — skill-hub 工程规范

> **状态**：Baseline v0.1  
> **生效日期**：2026-08-10  
> **适用范围**：本仓库全部文档、代码、脚本、配置与交付物  
> **维护原则**：规范变更须走 ADR；文档与实现不一致时，以可运行代码 + 最新 ADR 为准，并在 24h 内回写本文件  

---

## 1. 工程使命

**skill-hub** 提供跨 Agent（WorkBuddy / Claude Code / Codex / Cursor 等）的：

1. **统一 Skill 真源与分发**（Canonical Store + Symlink/同步）
2. **智能选型**（按任务路由 Top-K Skill）
3. **上下文节省**（渐进披露：元数据常驻、正文按需）

HARNESS 的目标不是“多写文档”，而是让后续开发具备：

- 统一目录与命名  
- 可执行的质量门槛  
- 可追踪的协作与交付节奏  
- 人/Agent 均可理解的入口契约  

---

## 2. 文档导航（单一入口）

| 类别 | 路径 | 说明 |
|------|------|------|
| 本规范 | `HARNESS.md` | 工程总规范（必读） |
| Agent 路由 | `AGENTS.md` | 多 Agent 协作入口 |
| 人读摘要 | `README.md` | 项目简介与快速开始 |
| 产品需求 | `docs/product/PRD.md` | 目标/范围/验收 |
| 架构 | `docs/architecture/ARCHITECTURE.md` | 分层、模块、数据流 |
| 接口 | `docs/architecture/API.md` | CLI / MCP / 库 API |
| 环境 | `docs/ops/ENVIRONMENT.md` | 依赖、配置、安装 |
| 运维与风险 | `docs/ops/OPERATIONS_AND_RISKS.md` | 备份、迁移、故障 |
| 开发计划 | `docs/planning/ROADMAP.md` | 阶段、里程碑 |
| 任务板 | `docs/planning/TASK_BOARD.md` | 当前迭代任务与状态 |
| 进度日志 | `docs/planning/PROGRESS.md` | 可追加的进度记录 |
| 决策 | `docs/adr/` | Architecture Decision Records |
| 模板 | `docs/templates/` | PR/Issue/ADR/Release 模板 |
| 文档索引 | `docs/INDEX.md` | 文档地图 |

**强制规则**：新增跨团队可读文档时，必须更新 `docs/INDEX.md`。

---

## 3. 仓库目录结构（冻结区 + 扩展区）

```text
skill-hub/
├── HARNESS.md                 # 工程规范（本文件）
├── AGENTS.md                  # Agent 工作指引
├── README.md
├── package.json               # monorepo 根（后续落地）
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .editorconfig
├── apps/
│   ├── cli/                   # skill-hub CLI
│   └── mcp-server/            # MCP 暴露路由/同步能力
├── packages/
│   ├── core/                  # Skill 解析、清单、存储模型
│   ├── router/                # 路由/索引/Top-K
│   ├── sync/                  # 多端 symlink/分发
│   └── shared/                # 类型、日志、错误码
├── configs/
│   ├── agents/                # 各 Agent 目标路径映射
│   └── profiles/              # 场景子集（coding/video/...）
├── scripts/                   # 运维与脚手架脚本
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/              # 样例 SKILL.md
├── docs/                      # 全部工程文档
├── outputs/                   # 本地运行产物（默认 gitignore）
└── .github/workflows/         # CI（后续）
```

### 3.1 目录职责

| 路径 | 可写方 | 禁止事项 |
|------|--------|----------|
| `packages/*` | 开发 | 不放端侧配置密钥 |
| `apps/*` | 开发 | 不直接写业务核心算法（放 packages） |
| `docs/*` | 人/Agent | 不写可执行业务代码 |
| `configs/*` | 开发 | 不存 token/私钥 |
| `outputs/*` | 运行时 | 默认不提交 |
| 用户 `~/.skill-hub` | 运行时真源 | 不在仓库内镜像完整用户 skill 库 |

### 3.2 命名约定

| 类型 | 规则 | 示例 |
|------|------|------|
| 包名 | `@skill-hub/<name>` | `@skill-hub/router` |
| CLI 命令 | `skill-hub <verb> [args]` | `skill-hub route "fix pdf"` |
| 文档 | `UPPER_SNAKE` 或 `Title` | `PRD.md`, `API.md` |
| ADR | `NNNN-title.md` | `0001-canonical-store.md` |
| Skill 名 | 小写连字符 | `frontend-design` |
| 分支 | `type/short-desc` | `feat/router-bm25` |
| 提交 | Conventional Commits | `feat(router): add rrf fusion` |

---

## 4. 编码规范

### 4.1 技术栈基线（v0.1）

| 层 | 选型 | 说明 |
|----|------|------|
| 语言 | TypeScript (Node ≥ 20) | CLI/MCP 主栈；Python 可选 bindings |
| 包管理 | pnpm workspace | monorepo |
| 运行时目标 | macOS 优先 | 当前用户环境；Windows 二期 |
| 日志 | 结构化 JSON + 人类可读 | `shared/logger` |
| 测试 | Vitest | unit + integration |
| Lint/Format | ESLint + Prettier | CI 必须通过 |

### 4.2 代码原则

1. **小模块、可测试**：路由、同步、解析解耦  
2. **纯函数优先**：检索打分逻辑无 IO；IO 在 adapters  
3. **错误可分类**：`SkillHubError` + `code`（见 API 错误码）  
4. **禁止静默吞错**：失败须有可操作信息  
5. **路径一律绝对路径规范化**后再写 symlink  
6. **不递归删除**用户 skill 目录；破坏性操作需 `--yes` + 先 backup  
7. **RTK**：本机 shell 调试时按用户惯例优先 `rtk` 前缀  

### 4.3 Skill 内容规范（被管理对象）

| 规则 | 要求 |
|------|------|
| 必备 | 目录内 `SKILL.md` + frontmatter `name`/`description` |
| description | 写清：做什么 + 何时触发 + 不适用场景 |
| 正文长度 | 建议 < 200 行；长内容进 `references/` |
| 可执行 | 脚本放 `scripts/`，声明运行时依赖 |
| 禁止 | 在 skill 中硬编码某单一 Agent 专有私有路径作为唯一路径 |

---

## 5. Git 与提交规范

### 5.1 分支模型

| 分支 | 用途 |
|------|------|
| `main` | 可发布基线；受保护 |
| `develop` | 集成（可选；早期可直接 PR 到 main） |
| `feat/*` | 功能 |
| `fix/*` | 修复 |
| `docs/*` | 纯文档 |
| `chore/*` | 工程杂项 |

### 5.2 Conventional Commits

```text
<type>(<scope>): <subject>

# type: feat | fix | docs | refactor | test | chore | perf | ci
# scope: core | router | sync | cli | mcp | docs | harness
```

示例：

```text
docs(harness): bootstrap engineering baseline
feat(sync): symlink agents from canonical store
fix(router): handle empty description skills
```

### 5.3 PR 门槛

PR 描述必须包含：

1. **动机**（问题/需求链接）  
2. **变更摘要**  
3. **测试说明**（命令 + 结果）  
4. **风险与回滚**  
5. **文档是否同步更新**（是/否 + 路径）  

模板：`docs/templates/PULL_REQUEST.md`

---

## 6. 质量门槛（Definition of Done）

任何进入 `main` 的变更须满足：

| 门禁 | 要求 |
|------|------|
| 类型检查 | `pnpm typecheck` 通过 |
| Lint | `pnpm lint` 通过 |
| 单测 | 变更相关包单测通过；新增逻辑必须有测 |
| 集成测 | 触及路径/同步/索引的 PR 跑 integration |
| 文档 | 行为变更同步更新 PRD/API/ROADMAP/PROGRESS 中对应项 |
| 破坏性变更 | 有 ADR + 迁移说明 |
| 安全 | 不提交密钥；用户目录操作有 dry-run |
| 路由/同步 | 对 fixture skill 可演示最小闭环 |

### 6.1 测试分层

| 层级 | 覆盖 |
|------|------|
| Unit | 解析、打分、路径映射、冲突检测 |
| Integration | ingest → index → route；sync dry-run |
| Manual/E2E（阶段后期） | 真实多 Agent 目录（沙箱 home） |

### 6.2 性能/质量目标（产品门禁，与 PRD 对齐）

| 指标 | 目标（v1） |
|------|------------|
| route 延迟 | p95 ≤ 50ms @ 200 skills（本地索引已构建） |
| 注入 skill 数 | 默认 Top-K = 3~5 |
| sync dry-run | 明确报告将创建/更新/冲突项 |
| 备份 | 迁移前强制 backup 目录存在且可还原 |

---

## 7. 协作流程

### 7.1 角色

| 角色 | 职责 |
|------|------|
| Owner（script） | 优先级、验收、迁移风险拍板 |
| Implementer（人/Agent） | 按 TASK_BOARD 领取任务、提交 PR |
| Reviewer | 代码/文档审查 |
| Ops | 本机备份、真源合并、分发 |

早期一人兼多角时，**PR 自查清单不可省略**。

### 7.2 工作流

```text
读 HARNESS + 相关 docs
  → 在 TASK_BOARD 将任务标为 in_progress
  → 开发 / 写测 / 更新文档
  → 本地门禁通过
  → PR + 更新 PROGRESS.md
  → Review → 合并
  → 任务 completed，里程碑勾选 ROADMAP
```

### 7.3 Agent 协作约束

1. 先读 `AGENTS.md` 与目标文档，再改代码  
2. 优先改 `packages/*`，避免在 docs 中“假装实现”  
3. 文档任务可单独交付，但不得伪造“已实现 CLI”状态  
4. 涉及用户 `~` 目录时：**默认 dry-run**，写入需显式确认  
5. Shell 遵循用户 RTK 惯例  

---

## 8. 交付标准

### 8.1 阶段交付物

| 阶段 | 必须交付 |
|------|----------|
| Phase 0 文档基线 | HARNESS、PRD、架构、API、环境、运维风险、ROADMAP、TASK_BOARD、PROGRESS |
| Phase 1 可运行 MVP | CLI：`doctor`/`ingest`/`route`/`sync --dry-run`；基础测试 |
| Phase 2 多端可用 | 真实 symlink 分发 + ASF/内建路由二选一落地 |
| Phase 3 体验增强 | MCP、profiles、冲突 UI/报告、hooks 集成文档 |

### 8.2 发布清单

1. 版本号与 `CHANGELOG.md`  
2. `docs/planning/PROGRESS.md` 增加 release 记录  
3. 迁移说明（若有）  
4. 已知问题列表  

模板：`docs/templates/RELEASE_CHECKLIST.md`

---

## 9. 配置与秘密

| 允许进仓 | 禁止进仓 |
|----------|----------|
| 路径模板、profile、示例 config | API Key、Token、私钥 |
| 默认 agent 映射 | 用户真实 skill 全文镜像 |
| fixture skill | 含生产凭证的脚本 |

用户运行时配置默认：`~/.skill-hub/config.yaml`（见 ENVIRONMENT.md）。

---

## 10. 变更管理

1. **规范小改**（笔误、澄清）：直接 `docs` PR  
2. **规范大改**（目录/门禁/架构原则）：先 ADR，再改 HARNESS  
3. **接口变更**：同步 `API.md` +  semver（MINOR/MAJOR）  
4. **废弃**：标注 `Deprecated`、迁移窗口、删除日期  

ADR 模板：`docs/templates/ADR.md`

---

## 11. 当前基线声明

| 项 | 值 |
|----|----|
| 文档基线版本 | v0.1 |
| 代码实现状态 | **Phase 1+2 能力完成**；生产路径 symlink apply 须 --yes --allow-write + backup |
| 主语言 | TypeScript / pnpm monorepo（锁定） |
| 优先平台 | macOS + 外置卷 `/Volumes/13759427003` |
| 用户真源规划路径 | `~/.skill-hub` |

---

## 12. 快速检查表（每次开工）

- [ ] 读过本文件与 `docs/INDEX.md`  
- [ ] 任务已写入/更新 `TASK_BOARD.md`  
- [ ] 不直接删除用户 skill 目录  
- [ ] 公共 API/行为变更已改文档  
- [ ] 准备好 dry-run 证据再请求生产写入  

**Harness 一句话**：先规范、再实现；先 dry-run、再写入；先文档对齐、再合并。
