# 进度日志 — skill-hub

> **只追加，不改写历史条目。**  
> 每条建议包含：日期、阶段、做了什么、证据路径、下一步。

## 2026-08-16 — P4-03/P4-05 scope、provenance 与独立 Skill sources

- **阶段**：Phase 4 作用域与来源垂直切片
- **状态**：**完成**
- **做了什么**：
  - `SkillMeta`/catalog 增加向后兼容的 `provenance`：scope、sourceType、sourceRef、revision、status、overlayOf；旧 catalog 缺省按 user 读取。
  - 配置增加独立 `sources`：只扫描包含 `SKILL.md` 的本地目录；`agents` 仍只表示同步目标。
  - `inventory` 增加 `--sources`/`--scope`，输出 source、scope、hash、effective skill 与冲突 winner/winner_reason。
  - `route`/MCP 支持显式 scope 过滤；project/workspace Skill 默认不进入全局 sync。
  - 补充 config/catalog/conflict/scope routing 回归测试。
- **证据**：`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm test`（18 files / 52 tests）均通过；本轮未执行用户目录写入。
- **边界确认**：skill-hub 不扫描、导入或管理 Obsidian/知识库/普通 Markdown；只有 `SKILL.md` 所在 Skill 目录可作为 source。
- **下一步**：P4-04 index freshness 与持久化索引语义；P4-06 explain/path/history。

---

## 2026-08-11 — WorkBuddy 全套 apply（replace-real）

- **阶段**：生产 apply 全套（仅 workbuddy）  
- **状态**：**通过**  
- **做了什么**：
  - 实现 `sync --replace-real`：真实目录/文件 → stash 到 `backup-dir/replaced-real/<agent>/<skill>` → symlink  
  - 新备份 `~/.skill-hub/backups/20260811-100852`  
  - dry-run：replace=71 conflict=0 noop=34  
  - apply：applied=71 failed=0；stash 71  
  - **verify workbuddy ok=105**；catalog 105 全部 realpath = hub  
  - 二次 dry-run：noop=105  
  - 测试：42 passed（含 replace-real 单测）  
- **证据**：`outputs/acceptance-wb-full-replace-real.md`  
- **未做**：其它 Agent apply；本地非 catalog 残留未动  
- **下一步**：其它端 create-only / 挂 WorkBuddy MCP / Phase 4  

---

## 2026-08-10 — Phase 3 MCP / profiles / 评估

- **阶段**：Phase 3 全量  
- **状态**：**Done**  
- **做了什么**：
  - P3-02：`profile.ts` + coding/video 过滤；CLI `route --profile`  
  - P3-03：`createRouterEngine` / `ExternalRouterEngine` + 失败降级 bm25  
  - P3-01：`apps/mcp-server` stdio MCP（skill_search/fetch/stats/inventory 只读）；Client 冒烟 4 tools OK  
  - 分词增强：连字符拆分（gitnexus-impact-analysis 命中）  
  - 统一 `hub-service`：CLI 与 MCP 共用  
  - P3-04：`docs/ops/MCP_INTEGRATION.md`  
  - P3-05：`outputs/phase3-route-eval.md` — **Hit@1=10/10**，description 层粗估节省 **~97%**  
  - 测试：41 passed  
- **安全**：MCP 无写操作；未做其它端 apply  
- **下一步**：宿主 Trust MCP；可选其它端 create-only；Phase 4 lint/GUI  

---

## 2026-08-10 — workbuddy 单条 update：agnes 旧链

- **阶段**：B 补充（仅修 1 条 wrong_target）  
- **状态**：完成  
- **做了什么**：
  - dry-run workbuddy：create=0 update=1 conflict=71  
  - apply：`agnes-video-v2-prompt-craft` 由 `~/.agents/skills/...` → `~/.skill-hub/skills/...`  
  - applied=1 failed=0；agents 端真实目录未动  
  - verify：agnes=ok；workbuddy ok=34 / not_symlink=71 / wrong_target=0  
  - 报告：`outputs/acceptance-b-agnes-update.md`  
- **下一步**：其它端 create-only / P3 MCP / 可选真实目录迁移专项  

---

## 2026-08-10 — P2-08 workbuddy create-only apply

- **阶段**：B 档生产小范围 apply  
- **状态**：完成  
- **做了什么**：
  - CLI/库：`--create-only` + `--agents`；非 create → skipped  
  - 生产：**仅 workbuddy** create-only → **applied=33 symlink，skipped=72，failed=0**  
  - 既有真实目录未动（如 agent-browser 仍为 dir）；其它 agent 零写入  
  - verify workbuddy：ok=33 / not_symlink=71 / wrong_target=1（agnes 旧链指 agents，未 update）  
  - 报告：`outputs/acceptance-b-workbuddy-create-only.md`；**37 tests** 绿  
- **安全**：backup-dir `20260810-204134` + `--yes --allow-write`  
- **下一步**：其它端 create-only / 可选 update 修 agnes 链 / P3 MCP  

---

## 2026-08-10 — 真实验收 V0/V1 + V2 dry-run

- **阶段**：投产验收（非 P3）  
- **状态**：**V0/V1 通过**；V2 仅 dry-run；**无**生产 apply  
- **做了什么**：
  - V0：doctor / inventory(union=105, conflicts=17) / 双副本备份确认  
  - **补齐** `materializeToCanonical` + `ingest` 默认物化（旧 ingest 只写 catalog）  
  - V1：`init` → ingest prefer workbuddy → **105 skills @ ~/.skill-hub/skills (~198M)** → index BM25 → route 抽样  
  - V2：`sync --dry-run` summary create=383 update=13 **conflict=129**（真实目录禁止覆盖）  
  - 验收报告：`outputs/acceptance-report-20260810.md`  
- **安全**：未 `sync --apply` / `restore --apply`；Agent 真实 skills 未改  
- **下一步**：P2-08 create-only apply / 授权指定端 apply / P3 MCP  

---

## 2026-08-10 — 生产 backup 双副本 + 可恢复验证（无 apply）

- **阶段**：M2 / Phase 2 生产加固（backup only）  
- **状态**：完成  
- **做了什么**：
  - 对生产 Agent skills 执行 **真实 backup**（用户授权范围：仅 backup，不含 apply/restore 写入）
  - 双副本：主 `~/.skill-hub/backups/20260810-204134` + 外置镜像 `outputs/production-backups/20260810-204134`（均 ~211MB，manifest SHA 一致）
  - 覆盖：workbuddy / codex / agents / cursor（14/16）；claude-code SKIP；canonical 当时不存在
  - cursor 源侧 2 条死链记为 `*.symlink-broken.txt`（`find-skills`、`vercel-react-best-practices`）
  - 完整性：抽检 hash match；CLI `restore --dry-run` → restored: workbuddy, codex, agents, cursor
  - 交付恢复手册：`outputs/production-backup-restore-runbook.md`
- **证据**：`manifest.json`（含 `recoverability`）；`node apps/cli/dist/index.js restore --from ... --dry-run` exit 0  
- **安全**：**未**对任何 `~/.<agent>/skills` 执行 restore --apply 或 sync --apply  
- **下一步**：待授权生产 apply / 小范围迁移；或进入 Phase 3 `P3-01` MCP

---

## 2026-08-10 — Phase 2 backup/apply/verify/restore（沙箱）

- **阶段**：M2 / Phase 2  
- **状态**：完成（能力 + 沙箱演练；生产 apply 未执行）  
- **做了什么**：
  - `@skill-hub/sync`：`createBackup` / `applySync` / `verifySync` / `restoreFromBackup`
  - CLI：`backup` `verify` `restore`；`sync --apply` 需 `--yes --allow-write`，默认 `require_backup` + `--backup-dir`
  - 真实目录冲突永不静默覆盖；原子 symlink
  - 单测 + `tests/integration/phase2-sandbox.test.ts`；CLI 沙箱演练记录 `outputs/phase2-sandbox-drill.md`
  - **36 tests** 全绿  
- **证据**：`pnpm typecheck|build|test|lint`；沙箱 create→verify OK  
- **安全**：未对 `~/.workbuddy|claude|codex|agents|cursor/skills` 执行 apply/restore  
- **下一步**：若授权生产迁移 → 先 `backup` 再小范围 dry-run；否则 Phase 3 MCP

---

## 2026-08-10 — Phase 1 全量推进（P1-03…P1-12）

- **阶段**：M1 / Phase 1  
- **状态**：完成  
- **做了什么**：
  - **core**：`scanSkills` / `parseSkillMd` / frontmatter / hash / `detectConflicts` / catalog 读写 / `loadHubConfig`
  - **router**：内存 BM25（name 加权 + 中英文分词）
  - **sync**：`planSync` dry-run；真实目录冲突检测；**禁止 apply**
  - **CLI**：`doctor` `inventory` `init` `ingest` `index` `route` `sync --dry-run` `version` `help`
  - **测试**：unit + integration，**33 tests 全绿**
  - **本机只读 inventory**：`outputs/inventory-readonly.md`（union≈104，conflicts=17）
  - fixture 闭环：ingest → index → route（`merge pdf` → `pdf-merge`）
- **证据**：`pnpm typecheck|build|test|lint` exit 0；`node apps/cli/dist/index.js …`
- **安全**：未对任何 Agent skills 做写入/symlink apply；`init` 仅在 `SKILL_HUB_HOME` 临时目录演练
- **下一步**：Phase 2 `P2-01` backup（apply 需用户授权）

---

## 2026-08-10 — P1-02 `@skill-hub/shared` 错误码/路径/logger

- **阶段**：M1 / Phase 1  
- **状态**：完成  
- **做了什么**：
  - 实现 `SkillHubError` + 错误码（含 `E_INTERNAL`）与退出码映射
  - 实现路径：`expandUserPath` / `resolveAbsolutePath` / `hubLayout` / `normalizeSkillName` / `isPathInside`
  - 实现 `createLogger`（人类可读 + JSON、child、级别过滤）
  - 共享类型：`HubConfig`、`Result`/`ok`/`err`
  - 单测：errors / paths / logger / 公共导出；全仓 22 tests 绿
  - 同步 `API.md` 实现状态表  
- **证据**：`packages/shared/src/**`；`pnpm typecheck && pnpm build && pnpm test && pnpm lint` 通过  
- **未做**：core scan/parse；CLI 业务命令；用户 `~` skills 写入  
- **下一步**：`P1-03` `@skill-hub/core` scan/parse（fixture）

---

## 2026-08-10 — P1-01 pnpm monorepo 工具链初始化

- **阶段**：M1 / Phase 1  
- **状态**：完成  
- **做了什么**：
  - 落地根 `package.json`（`packageManager: pnpm@10.27.0`，`type: module`）、`pnpm-workspace.yaml`、`tsconfig.base.json` / 根 `tsconfig.json` project references
  - 脚手架 6 包：`@skill-hub/shared|core|router|sync`、`@skill-hub/cli`、`@skill-hub/mcp-server`（workspace 依赖 + 占位 export）
  - Vitest / ESLint flat / Prettier 基线；根 scripts：`build` `typecheck` `test` `lint`
  - 烟雾测：`packages/shared` + `tests/unit/smoke.test.ts`（workspace import）
- **证据**（本机验证）：
  - `pnpm install` 成功（7 workspace projects）
  - `pnpm typecheck` / `pnpm build` / `pnpm test`（3 tests）/ `pnpm lint` 均 exit 0
  - `node apps/cli/dist/index.js --version` → `0.1.0`
- **未做**：业务逻辑、CLI 子命令、用户 `~` skills 写入、创建 `~/.skill-hub`
- **风险/备注**：外置卷上首次 `pnpm install` 较慢；`rtk pnpm install` 曾被 kill（137），直连 `pnpm` 更稳
- **下一步**：`P1-02` 实现 `@skill-hub/shared`（错误码、路径、logger）

---

## 2026-08-10 — 交接文档 HANDOFF

- **阶段**：M0 / 跨会话  
- **状态**：完成  
- **做了什么**：新增 `docs/planning/HANDOFF.md`（新对话启动提示词、完成度、红线、P1 下一步）  
- **证据**：`docs/planning/HANDOFF.md`；`docs/INDEX.md` 已挂接  
- **下一步**：新对话从 `P1-01` 继续  

---

## 2026-08-10 — Phase 0 工程化文档基线落地

- **阶段**：M0 / Phase 0  
- **状态**：完成  
- **做了什么**：
  - 在外置盘创建项目：`/path/to/skill-hub`
  - 按 monorepo 约定建立 `apps/` `packages/` `docs/` `configs/` `tests/` 等目录
  - 完成 `HARNESS.md` 工程规范（目录、编码提交、质量门禁、协作、交付）
  - 完成 PRD、用户场景、架构、API、数据模型
  - 完成环境配置、运维与风险说明
  - 完成 ROADMAP、TASK_BOARD、本进度日志
  - 完成模板、ADR、质量门禁清单、agent/profile 配置模板
  - 完成根级 `README` `AGENTS` `.gitignore` `.editorconfig`
- **依据**：用户本机 skill 碎片化扫描（workbuddy/agents/cursor/codex 约 108 唯一）
- **未做**（刻意）：未实现 CLI 逻辑；未对用户 `~` skill 做写入/symlink
- **下一步**：Phase 1 — monorepo 工具链初始化（TASK `P1-01`）

---

## 2026-08-16 — v0.2 scanner / copy projection / quality gates

- **阶段**：Phase 4 P4-01/P4-02
- **状态**：**完成**
- **做了什么**：
  - `packages/core/src/scan.ts` 跟随指向目录的 symlink，跳过坏链和文件 symlink，并按 realpath 防止环路。
  - `@skill-hub/sync` 真正实现 `sync.mode: copy`：`create_copy` / `update_copy` / `replace_real_copy`，copy verify 按 `SKILL.md` hash 校验。
  - 修复 router/scripts 的 5 个 lint 阻塞。
  - 新增 symlink、坏链、文件链、环路和 copy projection 回归测试。
- **证据**：
  - `pnpm typecheck` ✅
  - `pnpm build` ✅
  - `pnpm test`：**45 tests passed** ✅
  - `pnpm lint` ✅
  - 只读 `inventory --agents workbuddy --json`：**112 entries / 108 unique names** ✅
  - `doctor --json`：扫描链路正常；当前仅报告本机 `~/.claude/skills` 不存在
- **风险/阻塞**：Grok Build CLI 已尝试用 `grok-4.6` 进行只读复核，但当前认证/网络不可用；未将其未完成输出作为验收依据。索引仍是 catalog + meta marker，scope/provenance 尚未实现。
- **下一步**：P4-03 增加向后兼容的 scope/provenance/revision 最小模型，再接入 project/workspace source。

## 2026-08-16 — P4-04/P4-06 index freshness 与可解释诊断

- **阶段**：Phase 4 索引与可解释能力
- **状态**：**完成**
- **做了什么**：
  - `index` 生成 `index-meta.json` + 可加载 `bm25.json`；catalog hash 稳定化，不包含 `updatedAt`。
  - `route` 在索引新鲜且未做 profile/scope 过滤时直接加载持久化 BM25；过期、缺失或过滤场景回退内存，并输出 `index_fresh`、`index_source`、`index_rebuild_recommended`、`index_reason`。
  - 新增 `explain`、`path`、`history` CLI/API；解释 scope/source/revision/hash、同名变体、winner、overlayOf、canonical/Agent target 状态。
  - `ingest`、`index`、`sync --apply` 追加 `history.jsonl` 生命周期元数据；不记录 `SKILL.md` 正文，dry-run 不写 history。
  - 缺失 Agent/source 目录在 explain/path 中按 missing 诊断，不中断其它结果；修正 `SKILL_HUB_HOME` 无配置时默认路径跟随临时 Hub。
  - 新增 artifact round-trip、stale route、history、overlay/path/explain 集成测试。
- **证据**：
  - `pnpm typecheck` ✅
  - `pnpm build` ✅
  - `pnpm lint` ✅
  - `pnpm test`：**21 files / 59 tests passed** ✅
  - 临时 Hub CLI：`ingest → index → route` 返回 `index_source=persistent`、`index_fresh=true`，并完成 `explain/path/history` 只读回归。
- **风险/阻塞**：外部 Grok-4.6 仍未作为验收依据；当前 history 是 append-only 本地 JSONL，尚未提供 prune/lock/update 命令；copy 目录完整 hash 仍以 `SKILL.md` 为准。
- **下一步**：真实多 Agent apply 授权、MCP Trust 与 200 Skill route p95 评估。

## 模板（复制新增）

```markdown
## YYYY-MM-DD — 标题

- **阶段**：
- **状态**：
- **做了什么**：
- **证据**：
- **风险/阻塞**：
- **下一步**：
```


## 2026-09-05 — P5 统一安装生命周期、目录完整性和接管预览

- **阶段/状态**：P5-01/02/03 能力完成并验收；P5-04 真实迁移待 Owner 决策。
- **项目判断**：沿用已有 core/router/sync/CLI/MCP 分层，不重建仓库；保留开工前大量未提交 Phase 4 变更，未提交 Git。
- **同类项目**：实时读取 vercel-labs/skills、numman-ali/openskills、runkids/skillshare README；对比来源和边界见 OPEN_SOURCE_COMPARISON.md，决策见 ADR 0006。未运行竞品，不以 README 宣称其事务安全已被验证。
- **实现**：
  - core managed：本地/GitHub install、adopt、update、list；来源锁含实际 commit 和完整目录 hash；默认 dry-run，本地改动/不同来源冲突拒绝；暂存、唯一备份、原子锁更新、批量失败回滚，回滚失败保留事务目录。
  - CLI `rtk pnpm hub`：统一入口；managed 成功后增量更新 catalog/history/index；takeover 输出精确目录、冲突与 external 插件范围。
  - 修复 ingest 重建 catalog 导致原条目丢失、仅正文 hash 漏脚本/附件、force 直接删除旧版本、多行 description 解析遗漏、错误配置静默回退和 index/sync 错用默认 canonical 路径。
  - sync copy plan/verify 比较完整目录；create 不覆盖预览后出现的目标；stash 不覆盖历史；替换失败恢复旧目录/链；规范化名称与 canonical realpath 校验防止路径穿越或自覆盖。
  - backup 使用唯一批次；复制失败不生成成功 manifest；apply 检查快照存在及 Agent 覆盖，拒绝不完整或不匹配备份。
- **验收证据**：
  - `rtk pnpm typecheck`、`rtk pnpm build`、`rtk pnpm lint`、`rtk git diff --check` 通过。
  - `rtk pnpm test`：**28 files / 91 tests passed**。涵盖本地安装→catalog/index→backup→sync→update、附件漂移、来源绑定、本地修改保护、真实文件保护、故障注入恢复、损坏备份拒绝。
  - 真实公开 GitHub 获取：vercel-labs/agent-skills / web-design-guidelines；commit `063bee94c3f4df8453406c830b0a7df0f2860278`。默认预览没有创建输出沙箱 Hub 目录。
  - 实际构建 CLI 在仓库 outputs 隔离沙箱安装上述固定 commit、检索、备份、分发到2个模拟Agent，verify=2 ok/0 issues，update预览=noop。证据：`outputs/acceptance-managed-latest.json` 指向完整命令/结果记录。
  - 本机只读 takeover 刷新：111独立名称，80 ready、4 import、26 conflicts、1 blocked；130 external 条目；105个Agent路径已指向Hub。4条 issue 是同一内部自环在2个来源重复发现，加2条Cursor坏链。报告 `outputs/takeover-20260905.{json,md}`。
  - 首批精确计划：`outputs/migration-safe-plan-20260905.json`，84名称/4个现存Agent目录；80项现有投影计划198 create、3 update、39 replace、80 noop、0 conflict，另4项导入后复核16目标。
- **真实范围**：本机 Skill、插件缓存、Agent 配置均未写入；只在仓库/测试临时目录写代码、文档和沙箱证据。未归档3个异常symlink，未执行生产导入/投影。
- **未解决项**：Owner需确认3条精确异常链接的归档（保存rawTarget，不动目标内容），然后新备份/预览后迁移首批84项；26项版本冲突需选源。插件工具/MCP/授权不由Hub替代，额外未配置项目目录不在盘点内。未实现卸载或后台自动更新，managed/canonical与catalog/index不是跨包统一事务；实际用户目录尚不能标记全面接管完成。
- **协作说明**：非GPT子Agent两次无法接收任务，改用GPT兜底；兜底后也出现用量中断，主Agent接续实现、发现并修复回滚缺口，最终以源码复核、故障测试和构建CLI为验收依据。


### 2026-09-06 — Phase 6 读取链路与 OpenCode 验收进行中

- 根据用户明确目标采用 ADR 0007：Hub 集中安装，MCP 按需加载；不再推进旧 P5 symlink 全端迁移。
- 新增 CLI browse/read/files、MCP skill_list/skill_files/skill_read；fetch 支持 offset/nextOffset。根内相对路径、环路/越界/特殊文件/二进制/Git内部文件拒绝，长文可分页校验hash，文件上限10MiB。坏 catalog 不静默回退；CLI显式配置失败不伪装成功。
- OpenCode专用启动入口 `pnpm opencode`：独立XDG/config目录、无单项Skill安装、原生skill工具禁用；只继承provider/model，凭据不落仓库。原有Agent配置和Skill文件保留。
- 本轮全仓30文件97测试通过；后续读取安全修正的6项相关测试、typecheck/build/lint通过。真实CLI6项检查通过；真实stdio MCP对catalog全部105项正文分页与磁盘/hash逐项一致，证据 `outputs/runtime-full-acceptance.json`、`outputs/runtime-cli-acceptance.json`。
- OpenCode 1.18.18 的实际Luna会话已经完成fetch→files→read→随机标记/算术验证。自动验收脚本修复了execFile stdin未关闭导致OpenCode等待EOF的问题；全场景验收仍运行，模型服务出现流中断和上游饱和重试，尚不将P6-03标为完成。


### 2026-09-06 — Phase 6 OpenCode MiniMax-M3 验收完成

- 按用户新要求改用 `cliproxyapi/MiniMax-M3`。7项真实场景全部通过：精确加载/附件、搜索后加载、目录浏览、长文尾部续读、缺失/越界错误、更新后新会话、真实 humanizer-zh 改写。7项前置与结果断言通过，原生skill工具禁用、磁盘技能发现为0，仅程序内置customize-opencode留在debug inventory。
- 报告 `outputs/opencode-real-pDGCwU/report.json`，入口 `outputs/opencode-acceptance-latest.json`，人读报告 `outputs/OPENCODE_ACCEPTANCE_20260906.md`。错误断言修复为读取OpenCode state.error，并从原始测试会话导出复核后重算（E_NOT_FOUND/E_PATH均为真实拒绝）。
- 最终代码门禁：30文件97测试、typecheck/build/lint、git diff --check通过；CLI6项和当前catalog105项真实MCP读取/hash校验全部通过。P6-01/02/03关闭。
- 入口 `rtk pnpm opencode -- --model cliproxyapi/MiniMax-M3`；需要绕过模型目录网络刷新时按文档设置OPENCODE_DISABLE_MODELS_FETCH。普通opencode仍使用原配置。本轮未删除/迁移个人技能，也未把未登记/冲突/插件目录纳入105项成功结论。
- 内容风险扫描/token审计/本地反馈/语义检索仍按后续里程碑，不在本轮伪装已实现。未提交Git；保留开工前所有未提交修改。


### 2026-09-06 — Phase 7 Web 只读视图完成

- 新增 `apps/web`（`@skill-hub/web`）：node:http 只读 API（bind 127.0.0.1:4173，`pnpm web` 启动），10 个 GET 端点对齐 MCP 契约（stats/inventory/skills/search/fetch/files/read/explain/history/health），复用 `@skill-hub/router` hub-service，零新数据通路、零写操作。错误码映射 HTTP 状态，分页/续读语义与 Phase 6 一致。
- 前端 `apps/web/public` 静态 SPA（无构建依赖、hash 路由、深色主题）：技能库卡片浏览 + BM25 自然语言检索（防抖）+ 分页；详情页含 Markdown 渲染正文（frontmatter 剥离、截断续读）、元信息/变体/胜出原因、Agent 投影状态芯片、附件文件树在线阅读、history 时间线；多端盘点视图（agents/sources 存在性与计数）。markdown-it 经 CDN，加载失败降级纯文本。
- 工程：根 tsconfig references 与 package.json `web` 脚本登记；eslint 为 `apps/web/public` 增加浏览器 globals。门禁：typecheck/build/lint 通过，30 文件 97 测试全绿。
- 实机验证：真实 catalog（105 项）全部端点 curl 通过，含 404 E_NOT_FOUND 与静态页 content-type；证据见本轮会话命令记录。
- 边界：仅本机回环访问；不含写操作与认证；CDN 不可用时 Markdown 降级但不影响数据接口。未提交 Git。


### 2026-09-06 — Taxonomy 自动打标签（Web 分类侧栏）

- 应用户反馈“平铺不好查看”，将自动分类做成**项目内建能力**而非人工分类：`packages/router/src/taxonomy.ts`（规则驱动纯函数：name_globs +3 / keyword in name +2 / in description +1，每 Skill Top 3，无命中归“其他”）。
- 规则可覆盖：`~/.skill-hub/taxonomy.yaml` 或 `SKILL_HUB_TAXONOMY`；模板 `configs/taxonomy.yaml`；解析失败显式报错不静默回退。标签为派生数据不写 catalog，任意 skill 库载入即生效。
- 接入面：`skillList`/`skillFetch` 返回 `tags`，`skillSearch` 支持 `tag` 过滤，新增 `skillTagSummary`；Web 新增 `GET /api/tags` 与 `tag` 参数；前端左侧分类侧栏（计数 + 筛选）与卡片标签徽章。
- 实测分布：105 项中 dev 29 / image 29 / video 28 / agent 19 / marketing 19 / docs 9 / audio 6 / browser 4 / writing 3 / other 5。
- 门禁：build/lint 通过，31 文件 102 测试全绿（新增 taxonomy 5 例）；修复一处字面 BOM 触发 no-irregular-whitespace 的问题（统一 `\uFEFF` 转义写法）。
- 用户追问“第三方模型作为本地 skills 管理调度方”：已给出评估——定位为可选增强层（语义路由/模型打标/冲突建议），复用现有 external engine 协议，核心链路保持确定性；待 Owner 决策后立项。


### 2026-09-06 — Phase 8 自定义模型配置（可选增强层）

- 新增 `packages/router/src/llm/`：`types.ts`（LlmProvider 接口：chat/embed/probe，LlmError 带 hint）、`config.ts`（models.yaml/json + SKILL_HUB_LLM_* 环境变量快捷配置 + ${VAR} 插值 + 严格校验）、`http.ts`（超时/错误分类/友好提示）、`openai-compatible.ts` 与 `ollama.ts` 两个 Provider、`registry.ts`（工厂 + getLlmStatus 永不抛错 + requireLlmProvider 供消费方降级）。
- 降级语义：未配置 disabled（正常状态）；配置非法 misconfigured、服务不可达 unreachable，错误内联返回，核心 BM25 链路零影响。状态接口只回传 apiKeyConfigured 布尔值，密钥不出模块。
- 接入：Web 新增 `GET /api/llm/status`（?probe=1 健康探测）；前端统计条新增模型状态芯片（四态着色 + tooltip 错误详情）。
- 配置示例 `configs/models.yaml`（Ollama / OpenAI / CLIProxyAPI 三实例 + 字段注释）；说明文档 `docs/architecture/MODELS.md`（服务类型表、三种配置方式优先级、状态降级表、扩展指南）。
- 门禁：build/lint 通过，32 文件 117 测试全绿（llm 新增 15 例，mock fetch 覆盖解析/校验/错误分类/降级）。
- 实机验证四路径：disabled / unreachable（指向死端口，hint 正确）/ misconfigured（坏 type，定位到文件）/ 主流程不受影响（skills 列表正常）。
- 工程修复：parseModelsYaml 适配 noUncheckedIndexedAccess（keyValue 辅助函数显式处理 undefined）；确认 TS 不以 never 返回函数做收窄，改用 `?? fail()` 模式。未提交 Git。


### 2026-09-20 — 运维：tapd-api 纳入 canonical 并投影至 workbuddy / codex

- 起因：`tapd-api` 原为 `~/.workbuddy/skills/` 下的**游离真实目录**（未纳管 Hub），诉求是「在 Codex 中可用，且以后只改一个源」。
- 操作链路：`cp -a` 备份至 `backups/tapd-api-pre-canonical-20260920-154708/`（22 文件核对一致）→ `mv` 至 `~/.skill-hub/skills/tapd-api` → 两侧 `symlink` 投影（workbuddy / codex）→ `ingest --sources <单目录>` 写入 catalog（106 → 107）→ `index --rebuild`（skills=107）。记录 `catalog.json.bak-20260920-154811`。
- 验收证据：`path tapd-api` 显示 workbuddy ok / codex ok；`route "TAPD 工时填报 任务排期"` 命中第 1（19.195）；`tapd_client.py --help` 经 **codex 侧软链**可执行；`tapd.json` 权限 `-rw-------` 保留；workbuddy 侧路径不变，SKILL.md/脚本内硬编码的 `~/.workbuddy/skills/tapd-api/...` 继续有效。
- 刻意未做：`sync --agents codex --create-only`（dry-run 显示将新增 96 条软链，远超「只加一个」的诉求）。
- 发现既有缺陷（待修）：`/path/to/skill-sources/home-computer-coordination/home-computer-coordination` 自引用软链，导致**全量 `ingest` 报 `[E_PATH] Skill 内部链接环路`**；本次以单目录 `--sources` 绕过。

### 2026-09-23 — Phase 9：Jev 可选语义路由

- **阶段/状态**：P9-01/02/03 完成；默认 BM25 保持不变。
- **做了什么**：新增 `packages/router/src/typesafe.ts`，实现 `external-typesafe` RouterEngine。Jev 只接收候选 Skill 的 `name`、`description`、`keywords`，以 Choice 的完整概率分布排序 Top-K；不读取或上传 `SKILL.md` 正文、附件、用户路径或凭据。
- **接入面**：CLI 支持 `--engine external-typesafe`；MCP `skill_search` 和 Web `GET /api/search` 支持 `engine=external-typesafe`；无 Key、候选超限、网络/鉴权/超时/响应异常自动降级 BM25。
- **配置**：通过 `TYPESAFE_API_KEY`、可选 `TYPESAFE_API_URL` / `TYPESAFE_MODEL` / `TYPESAFE_TIMEOUT_MS` 配置；没有把 Key 写进仓库或项目配置。
- **验证**：`pnpm test` 121 tests passed；`pnpm build`、`pnpm lint` 通过。真实 catalog 108 candidates 调用返回 `jev-1.13.0`，Jev 语义结果首位为 `skill-hub-agent-distribution`；清除 Key 后 CLI 仍返回 BM25 且 `degraded=true`。同一查询的 BM25 对照会被中文字符命中噪声干扰，Jev 明显更符合任务语义。
- **风险/边界**：Jev 是远程可选增强，不纳入默认离线链路；实际调用延迟与费用依赖服务和网络。配置 `~/.skill-hub/config.yaml` 将默认 engine 改为 `external-typesafe` 尚未自动执行，建议先用显式参数或影子评估。

### 2026-09-25 — 运维：Qoder / WorkBuddy / Codex 更新 Skill Hub 与 TypeSafe Skill

- 将 TypeSafe 官方 `typesafe-ai` Skill 从 `typesafe-ai/skills` 刷新后备份至 `~/.skill-hub/backups/typesafe-ai-pre-canonical-20260925-194258/`，再迁入 canonical；Qoder、Qoder CN、WorkBuddy、Codex 均改为指向同一真源的软链。
- `skill-hub-agent-distribution` 保持 canonical 不变，为 Codex 补建精准投影；未执行全量 `sync`，未向目标 Agent 灌入其他 Skill。
- 对 `typesafe-ai` 执行单目录 `ingest --dry-run` 后正式摄入并重建 BM25 索引；catalog 收录成功，精准查询 `typesafe-ai TypeSafe System One Jev` 命中第 1。
- 将最新 `shared/core/router/mcp-server` 构建部署到 `~/.skill-hub/mcp/`，旧 runtime 备份至 `~/.skill-hub/backups/mcp-runtime-pre-typesafe-20260925-194258/`；Qoder 沿用该入口，WorkBuddy 启用并改用 `~/.local/bin/node`，Codex 新增同一 MCP 配置。
- 本地 MCP 入口在未继承 shell 环境时从 macOS Keychain 读取 `typesafe-ai-api-key`，不写出明文。真实 stdio 握手确认 10 个只读工具、`skill_search.engine` 参数存在；显式清除进程环境变量后仍以 `external-typesafe` 成功调用，未降级，`typesafe-ai` 概率 0.98 排第 1。

### 2026-09-25 — 运维：multi-provider-image-tts 的 GPT Image 比例映射

- 真源仍是 git 工作树 `/path/to/skill-sources/multi-provider-image-tts-skill/skills/multi-provider-image-tts`。`~/.skill-hub/skills/multi-provider-image-tts` 从八月旧目录改成指向该目录的软链；旧目录备份在 `~/.skill-hub/backups/multi-provider-image-tts-pre-link-20260925-205030/`。
- WorkBuddy、Codex、agents、Cursor、cc-switch、Claude、Qoder、Qoder CN 都改为指向 skill-hub 这条软链。未执行全量 `sync`。
- `path multi-provider-image-tts`：上述 config 内五个 Agent 均为 ok。catalog 用单目录 `ingest --no-materialize` 更新；没有重建 BM25 索引。
- 未移动 `~/.skill-hub/skills/multi-provider-image-tts.bak.20260811-141623`。它和正式技能同名，全量 `index --rebuild` 会把它写回 catalog。

### 2026-09-25 — 运维：删除 multi-provider-image-tts 的 skill-hub 旧副本

- 按确认把 `~/.skill-hub/skills/multi-provider-image-tts.bak.20260811-141623` 移入废纸篓。canonical 软链仍指向 git 工作树里的最新技能。
- 重新执行单目录 `ingest --no-materialize` 和 `index --rebuild`。`path multi-provider-image-tts` 中 workbuddy、claude-code、codex、agents、cursor 均为 ok；catalog 不再指向八月副本。
- `~/.skill-hub/backups/multi-provider-image-tts-pre-link-20260925-205030/` 仍保留，不在扫描目录内。

### 2026-10-05 — Phase 10：Jev 决策信号与外部观察归档

- **设计输入**：将用户提供的 @Arindam_1729 X 帖子分析归档到 `docs/research/JEV_DECISION_LAYER.md`，记录 Jev 的 Choice/Score/Noul 背景、10 个仓库的决策位置、营销表述的折扣项与本仓库验证边界；已登记 `docs/INDEX.md`。
- **实现**：`external-typesafe` 成功路由后现在返回只读 `decision`：按 Skill 名称映射的概率、`selected`、官方 `confidence`、独立的 `selected_probability`、`threshold` 和 `escalation_recommended`。CLI `route`、MCP `skill_search`、Web `/api/search` 均透出该字段，前端检索页显示决策提示；它不会自动执行任何 Skill 或外部动作。
- **官方核对**：实时读取 TypeSafe llms.txt、HTTP API、Choice、Confidence，Context7 交叉核对。confidence 是分布集中度，与被选项概率不同，升级建议采用服务返回的 confidence。
- **安全与回退**：默认 BM25；新增 `TYPESAFE_MIN_CONFIDENCE`（默认 0.65）仅作未经本地校准的升级建议，非法配置显式报错。修复显式空 `apiKey` 被环境变量覆盖，以及 build 阶段候选超限落在回退 try 之外的问题；回包检查全部候选、概率范围/总和、选项最高概率和 confidence 范围，异常时降级。
- **证据**：`rtk pnpm typecheck`、`rtk pnpm build`、`rtk pnpm lint`、`rtk git diff --check` 通过；`rtk pnpm test` 通过（34 files / 136 tests）。新增 CLI/MCP/真实回环HTTP的一致性、无匹配和服务失败集成测试；TypeSafe测试隔离Key/URL/model/阈值环境，避免测试意外调用真实服务。未做浏览器视觉验收。
- **构建CLI真实调用**：仅发送2项人工样例的公开描述，`jev-1.13.0` 返回 `pdf-merge`，confidence=1、selected_probability=1，未降级；端到端1515ms（单次记录，不作为性能基准）。清空Key后返回BM25、degraded=true、decision=null。证据 `outputs/jev-decision-20261005-K6c3Pj/report.json`，入口 `outputs/jev-decision-acceptance-latest.json`。
- **边界**：第三方10个仓库、星数、融资和报价没有本轮独立核实；阈值仍需用自己的真实任务集校准。不写用户Skill目录、Agent配置或已部署MCP runtime；保留开工前的未提交修改，未提交Git。

### 2026-10-06 — Phase 11：竞品调研与 Skill 静态审计

- **一手调研**：读取 `vercel-labs/skills`、`numman-ali/openskills`、`runkids/skillshare`、`nibzard/skillctl`、`agentskills/agentskills`、`browser-use/jev-ultrafast` 的 README/规范入口，并读取 GitHub REST 元数据（stars、license、pushed_at）。证据与限制见 `docs/planning/COMPETITOR_RESEARCH_20261006.md`。
- **功能决策**：先做审计，再做 manifest、pin/rollback/overlay、Jev 评估和 CI；不复制桌面 UI、插件权限、hooks、团队遥测。
- **实现**：新增 core `auditSkillTree`，CLI `audit [name] --fail-on ...`，MCP `skill_audit`，Web `/api/audit` 与 `/api/skills/:name/audit`；扫描不执行文件、不联网、不修改 catalog，默认 high 级别命中返回退出码 2。审计设有条目/字节/发现上限，`complete=false` 会进入失败策略，finding 不写源代码行。
- **审计规则**：私钥/令牌、远程管道执行、破坏性命令、动态执行、编码载荷、网络请求、疑似 prompt injection、执行权限和越界链接；报告含文件、行号、规则、严重级别和摘要。
- **回归**：新增 3 个 core 审计测试和 CLI/MCP/Web 一致性集成测试；`pnpm test` 通过（36 files / 140 tests），`pnpm typecheck`、`pnpm build`、`pnpm lint`、`git diff --check` 通过。真实沙箱 CLI clean=0、suspicious 默认 high 策略退出码=2；构建 Web 两个 endpoint 返回一致；构建 stdio MCP 新增 `skill_audit` 工具并返回 finding。ego-browser/@Chrome QA 通过首页、自然语言检索、详情页、审计按钮、references/guide.md 附件读取；危险 fixture 显示 critical/high/warning 摘要且不显示源代码行。证据：`outputs/audit-acceptance-20261006.json`、`outputs/mcp-audit-acceptance-20261006.json`；只读临时沙箱，未扫描或修改用户目录。

### 2026-10-06 — Phase 12：OpenCode Hub-only 真实回归

- **环境**：OpenCode 1.18.34，模型 `cliproxyapi/MiniMax-M3`；已将 PATH 前置的 `/home/example-user/.local/bin/opencode` 正式切为 Hub-only 包装器，原生二进制保留在 `/opt/homebrew/bin/opencode`；provider 配置只在进程环境传递，未写回。
- **隔离断言**：`tools.skill=false`、`permission.skill=deny`、项目/Claude/共享/外部 Skill 发现关闭；报告显示磁盘发现 0，仅 OpenCode 内置 `customize-opencode`。
- **真实场景**：精确附件、未指定 Skill 名的内容自动路由、搜索后加载、目录浏览、长文尾部续读、缺失/越界错误、更新后的新会话、`humanizer-zh` 代表任务 8/8 通过；自动路由场景只给任务内容，模型先 `skill_search` 再 `skill_fetch/read`；所有工具调用均为 `skill-hub_*`。
- **全库 MCP**：当前 catalog 110 个 Skill 真实 stdio MCP 分页读取与磁盘/hash 对照 110/110 通过，无错误。
- **证据**：`outputs/opencode-acceptance-latest.json` → `outputs/opencode-real-Xcnwop/report.json`；`outputs/runtime-audit-acceptance-20261006.json`；`outputs/opencode-formal-switch-20261006.json`。普通 `opencode` 已验证通过自动内容路由，所有工具均为 `skill-hub_*`；原有 `~/.claude/skills`、`~/.codex/skills` 等目录保留，原生回退入口为 `/opt/homebrew/bin/opencode`。

### 2026-10-06 — Phase 13：WorkBuddy 用户Skill配置切换

- **状态**：正式配置写入完成；WorkBuddy新会话模型回归未验证，不宣称零原生Skill发现。
- **发现与依据**：当前缓存149条userSettings Skill记录、147个名称。读取当前WorkBuddy打包CLI的resolveSkillVisibility，off会隐藏并拒绝手动/模型调用；应用服务还会清除受保护builtin的部分禁用配置。
- **修改范围**：settings.json仅改skillOverrides和新增permissions.deny中的Skill；mcp.json仅更新skill-hub入口；app/app-config.json仅追加personalization.customPrompt。147名称off；其它11个MCP/模型/插件保留；未移动或删除Skill目录。
- **备份与复核**：3份原配置保存到/home/example-user/.skill-hub/backups/workbuddy-hub-switch-20261006-122329/，逐份SHA-256匹配原配置；其它设置/其它MCP结构相等、旧customPrompt前缀保留。计划outputs/workbuddy-hub-switch-plan-20261006.json，结果outputs/workbuddy-hub-switch-20261006.json。
- **真实服务验证**：使用WorkBuddy mcp.json实际command/args/env连接stdio MCP，11工具、110项catalog；中文内容搜索首位humanizer-zh，读取8145字符正文成功，未保存正文/凭据。pnpm build通过。
- **限制**：WorkBuddy中有运行中任务，未重启/中断；UI随后无法获取可操作窗口。新会话模型轨迹、原生Skill拒绝的运行效果待任务完成后重开验证。18条受保护builtin仍可能发现，插件/连接器Skill也不等同用户目录Skill。操作与恢复见docs/ops/WORKBUDDY_HUB.md。

### 2026-10-06 — Phase 14：Qoder App正式接入配置和初始化验证

- **范围**：/Applications/Qoder.app使用的~/.qoder；未改QoderWork/QoderWork CN。
- **依据**：核对当前安装包runtime1.1.64的设置schema与实际Config加载：skills.enabled=false、loadFromAgentsDirectory=false、disableShellExecution=true均存在，启用状态requiresRestart。
- **修改**：settings.json只添加skills设置并更新skill-hub MCP；AGENTS.md保留原全文、追加按任务内容search/fetch/files/read和权限边界。provider/其它17个MCP结构相等，99个原Skill目录未动。
- **备份**：/home/example-user/.skill-hub/backups/qoder-hub-switch-20261006-135218/，两份原文件SHA-256核对一致，权限600、目录700。
- **服务验证**：使用Qoder实际MCP配置连接stdio成功，11工具/110项catalog；中文搜索首位humanizer-zh，读取8145字符成功；不保存正文或凭据。
- **原生runtime初始化**：独立安装包runtime新进程加载user配置，skills=[]、Hub connected、11 Hub工具。原生Skill工具名称仍在tools，因此只确认原生Skill列表为空，不宣称工具从注册列表移除。
- **未通过**：MiniMax-M3.1-Flash-Preview模型任务在工具调用前返回Not logged in · Please run /login；GUI已尝试新任务，输入和发送未成功。不提取/修改认证凭据，不绕过登录，不重启旧会话；模型回归仍待验证。报告outputs/qoder-hub-switch-20261006.json和outputs/qoder-hub-regression-20261006/report.json；操作/恢复见docs/ops/QODER_HUB.md。

### 2026-10-09 — Phase 15：公开源码文档和社区/CI准备

- **公开入口**：重写README和中文README，新增STATUS区分实现/计划/宿主实际验收，更新可移植环境与MCP/OpenCode/WorkBuddy/Qoder指南；原始本机文档保存于ignored outputs，不上传。旧Phase-1 HANDOFF已替换为当前交接入口。
- **开源规范**：MIT、CONTRIBUTING、SECURITY、CODE_OF_CONDUCT、NOTICE、CHANGELOG、Issue/PR模板、CODEOWNERS、Dependabot、自动release notes；package私有标记仅阻止npm误发布。决策ADR 0009。
- **工程复现**：CI使用固定SHA Actions、contents:read、Linux Node20/22与macOS Node22，运行types/build/lint/test/docs/smoke，不使用真实模型Key或个人catalog。修复init的SKILL_HUB_HOME数据路径，补隔离回归；更新MCP自动路由指引的旧断言。
- **本地验证**：37文件141测试、typecheck/build/lint、50个Markdown本地链接零断链、compiled sandbox lifecycle/MCP smoke通过；沙箱端口限制下的两项HTTP测试在允许127.0.0.1监听后通过，无跳测。
- **公开前检查**：当前215个候选text文件与已有Git历史常见密钥模式扫描无匹配；个人用户名/卷路径等当前文档已泛化；outputs/node_modules/dist/backups/.codegraph等不发布。不是对所有潜在隐私的形式化证明。
- **待远端验证**：当前main与origin/main相同；后续提交推送、visibility/security/rules与Actions实际结果将另追加，不预称远端已通过。

### 2026-10-09 — Phase 15：GitHub公开与远端检查完成

- **已推送**：ddc75c8827e854af95fb995d3ff272db16edce28（164个变更文件，包含此前积累的实现及本次文档/社区/CI），无强推/历史重写；本地与GitHub main一致。
- **仓库**：983033995/skill-hub已PUBLIC；MIT被GitHub识别，简介/topics/Issues/squash及合并后清理分支设置生效；GitHub community profile健康度100%。
- **安全/协作**：private vulnerability reporting enabled；Dependabot alerts和automated-security-fixes enabled/unpaused，security_and_analysis的dependabot_security_updates、secret_scanning、secret_scanning_push_protection均enabled。Actions默认contents read且不可审批PR；main-integrity ruleset active（禁止删除/非快进，要求三组CI，管理员保留应急bypass）。
- **真实远端CI**：[CI run 37926838060](https://github.com/983033995/skill-hub/actions/runs/37926838060)精确对应ddc75c8，Linux Node20/22与macOS Node22三组全成功，install/typecheck/build/lint/test/docs/smoke各步成功。未把Dependabot其它分支检查当main结果。
- **边界**：保留package.private阻止npm误发布；本次没有发布npm或自动合并依赖PR。manifest/managed pin/rollback和Qoder/WorkBuddy模型回归仍未宣称完成。公共操作入口和安全规范见README/STATUS/SECURITY；原本机文档与审查报告留在ignored outputs。

### 2026-10-09 — Phase 16：开放PR评估与Jev token指南

- **PR审查**：5个Dependabot开放PR；#1/#2/#3 Action仅替换固定SHA，三组CI绿，保留现用参数，新Action运行时Node24不改变项目Node20/22测试矩阵；#5 MCP SDK1.32.1三组CI绿，当前main55a7410+其精确manifest/lock在临时副本上141测试/typecheck/build/lint/docs/smoke全通过。全部BEHIND，合并前需更新基线并重跑严格checks；本轮没有合并/关闭/更新PR。
- **不建议**：#4同时跨TypeScript7/Vitest5/ESLint10/Node types26，三组typecheck失败（TS2591等）；需要单独迁移，不绕过CI。详细依据PR_REVIEW_20261009.md。
- **Jev配置**：实时官方quickstart/API与Context7核对Key页面console.typesafe.ai/keys，新增JEV_SETUP.md与空Key.env.example，README/中文README/MODELS/API/INDEX入口齐全。区分token与引擎选择、不同进程环境、.env不会自动加载、源码入口无自动Keychain、官方SDK变量与本项目适配器变量不同。
- **范围**：仅补文档与审查记录，不修改用户token、真实Hub默认引擎或宿主配置；未进行收费Jev请求。隔离PR5验收结果保存在ignored outputs/pr5-review-20261009.json。

### 2026-10-09 — Phase 17：授权依赖PR合并与远端MCP边界文档

- **合并顺序**：#5/#1/#2/#3，每个PR更新main基线后的精确head三组必需CI成功且CLEAN才squash；未使用admin bypass、强推或历史重写。SDK1.32.1、checkout7.0.1、pnpm/action-setup6.1.0、setup-node7.0.0已进入main。精确head/merge SHA见PR_REVIEW_20261009.md。
- **过程异常**：GitHubCLI更新workflow时遇到workflow scope权限拒绝和短暂旧head缓存；保持等待/不绕过检查。PR3自动刷新曾冲突，Dependabot生成新head后复核差异只剩setup-node并重新等待CI。
- **合并后证据**：main d10555c0三组[CI37933317703](https://github.com/983033995/skill-hub/actions/runs/37933317703)成功；本地frozen install/typecheck/build/lint/141tests（37files）/docs（54files、零断链）/compiled stdio MCP smoke通过。
- **范围**：#4失败toolchain组不动；期间自动新增#6Vitest4.1.11不属于指定四个目标，未合并。个人Hub与宿主配置不改，未调用收费模型。
- **远端说明**：REMOTE_MCP.md核对源码仅StdioServerTransport，区分远端StreamableHTTP协议与当前未实现能力；Web REST/GitHub不是MCP服务。明确HTTPS/Origin/鉴权、服务端catalog/Skill路径迁移、持久化、客户端兼容和验收要求；Hub访问token与TypeSafeKey分离。本轮没有部署或打开端口。


### 2026-10-12 — Phase 18：MiniMax网页端音乐检索诊断

- **真实复现**：7次MCP查询；BM25/110候选/无过滤或降级。完整需求首位multi-provider-image-tts；“网页版 minimax music”首位playlist，目标第6，默认Top-5遗漏。
- **能力核对**：multi-provider-image-tts正文与附件已有backend web脚本链路；minimax-music-gen/playlist要求mmx/API。网页端能力未进入description/keywords。未生成音乐或读取凭据。
- **漂移与限制**：目标正文hash与9月25日catalog不一致，当前description一致；index_fresh仅验证catalog一致性。名称重复权重被tokenize去重抵消，作为独立缺陷记录，未修复。
- **对照**：源码构建Router对7查询×2元数据版本完成内存验证；只补keywords使6条具体生成/网页端意图排第1，短查询从第6升第1；纯品牌查询仍偏playlist。未改个人Skill、catalog或算法；报告MUSIC_SKILL_SEARCH_20261012.md。docs:check通过（55文件、零断链），git diff --check通过。


### 2026-10-12 — Phase 18：网页端音乐Skill与检索修复落地

- **Skill真源**：备份后补网页端/免API Key生成、历史查询下载的description、9个keywords和显式provider/backend说明；源仓库已有未提交修改原样保留，其它Skill正文未改。备份位于本机~/.skill-hub/backups/music-search-fix-20261012-141056。
- **Hub**：名称×3/keywords×3/description×1按字段累计，修复去重抵消权重；多字中文bigram减少单字噪音；artifact v2拒绝旧索引。索引检查登记SKILL.md的实际hash，限制普通文件/10MiB/根内链接，兼容小写skill.md；不索引正文或扫描附件。
- **数据/部署**：canonical重建预览被既有ChatCut 1.10.14旧插件坏链阻断；改为逐项预览已登记110项，刷新3项元数据并保留缺失记录，构建v2索引。备份后统一更新本机MCP core/shared/router/server构建文件；不修改entry.js/凭据/其它宿主设置，不重启运行中任务。ChatCut缺失现在明确返回fresh=false；当前对话旧连接仍需重连。
- **真实验收**：实际部署目录新stdio MCP六条中文/英文网页端查询首位multi-provider-image-tts，fetch及附件发现通过。OpenCode现有默认模型新会话通过search→fetch→files/read，识别generate_music.sh及--provider minimax --backend web，仅调用Hub读取工具；未生成音乐或调用Jev。证据outputs/music-search-mcp-regression-20261012.json和outputs/music-search-opencode-regression-20261012.json，均不持久化工具返回正文。
- **门禁**：37文件156tests、typecheck/build/lint/docs（55文件零断链）/隔离smoke/diff check通过。200项小正文合成库20次稳态查询含hash校验，p95约12.6ms；真实大正文/网络盘性能不作推断。API/PRD/ROADMAP和诊断报告同步。


### 2026-10-12 — Phase 19：精简runtime与计量证据

- **建议核对**：读取用户提供会话完整建议，官方OpenAI Skills页核对Codex初始name/description/path预算（2%窗口或未知窗口8000字符）及单项禁用需重启；Context7核对MCP handler/instructions。当前Codex会话仍有原生Skill清单，不宣称零注入。全量manifest调整为显式兼容，Hook/通用Host Adapter与完整Native/Hybrid/Hub-only评估保持待验收。
- **实现**：SKILL_HUB_MCP_MODE=runtime仅search/read/files；默认full及11工具响应保留。runtime Top-3/8000字符、紧凑候选与索引警告、简化Jev信号；隐藏工具调用拒绝。OpenCode新增--mcp-mode与简短指引，不改原生发现策略或个人设置。ADR0010及API/PRD/ROADMAP/README/STATUS更新。
- **离线证据**：pnpm benchmark:mcp在10/100/1000合成库真实stdio握手，入口JSON字节full5442/runtime2263（约减58.4%）且跨规模不变。报告Token为null，不把字节换算为实测Token。
- **真实模型**：pnpm benchmark:opencode明确指定cliproxyapi/gemini-3.8-flash-high及native binary，在100项合成库full/runtime四场景通过；求和均search→fetch/read→files，普通2+2均无工具。首请求input6512→5521、6484→5495；原始usage/cache/cost记录，不将代理cost=0当免费，不外推质量和Native节省率。结果outputs/opencode-runtime-comparison-latest.json；临时试验结果单独保留。
- **本机部署**：MCP server构建文件备份到~/.skill-hub/backups/minimal-runtime-<UTC时间>后更新，默认full；冷启动实际部署runtime三工具、音乐查询首位与读取通过，既有ChatCut警告保留。未重启已有连接/任务、未修改凭据或其它宿主。
- **验证**：37文件158测试、typecheck/build/lint/docs（57文件零断链）/隔离smoke/diff检查通过；两个新增脚本已实际运行。没有把协议字节基准或两任务试验当成完整三模式Token/质量验收。


### 2026-10-12 — Phase 20：复核修正、召回草案与Native基线

- **引导**：runtime英文改为This server does not disable native Skill discovery；项目AGENTS、MCP/Qoder/WorkBuddy指南采用两模式都有的skill_read。实际Qoder已有全局Hub段经预览/hash和备份只替换必需fetch为read；未改Codex全局（未发现该旧段）或provider/宿主设置。runtime仍3工具。
- **召回**：新增evals/router/recall.v1.json和pnpm eval:router；50标签为Agent拟定待Owner复核，不是用户历史。当前110catalog三种排序共享元数据，主Recall@5旧28/30→新29/30、Hit@1 23→25/30，无需Skill任务候选率15/15→7/15；误激活率未知。单字探针初版0/5，新增专用回退恢复2/5，普通查询不恢复unigram。剩余英文查询中文用途漏召回保留。
- **旧artifact**：重跑index-store/runtime相关测试确认v1拒绝后skillSearch返回memory结果及rebuild建议，未直接报错。
- **Native试验**：新增pnpm benchmark:native；明确同模型gemini-3.8-flash-high，110真实catalog名称/描述加1合成验收Skill，正文全合成。debug Native/Hybrid各111磁盘项，Hub-only0，内置各1，六模型任务全通过。首请求input求和Native23347/Hybrid23998/Hub5483，普通23318/23969/5454；后续Native/Hybrid缓存读21296/21948，费用不作比例推断，不称生产Skill质量验收。
- **Codex隔离**：CLI0.162.0-alpha.17.2 app-server skills/list进程覆盖125发现项enabled123→0；临时CODEX_HOME58发现项enabled58→0（repo1/user52/system5，合成project/home均禁用），个人config hash一致。列表数量不变；未复制插件/凭据或发模型请求，插件/模型初始注入仍未验证。
- **部署**：router/server构建备份后更新本机MCP，冷启动runtime实际三工具、正确英文指引、音乐查询首位与单字非空通过，ChatCut坏链警告保留；不重启已有任务。Qoder文案备份runtime-guidance-20261012-162655，构建备份runtime-review-<UTC时间>。
- **门禁**：37文件159tests、build/typecheck/lint/docs（58文件零断链）/smoke/diff检查通过；离线基准当前full5442/runtime2262字节（文案修正少1字节），仍约减58.4%。后续按router、runtime/benchmark、文档三组提交，个人Skill/输出/配置不进Git。

### 2026-10-24 — GitHub Actions、PR流程与Issue表单收口

- **Actions**：确认现有CI覆盖PR、main推送和手动运行；冻结依赖安装后运行typecheck/build/lint/test/docs/smoke，权限只读并固定Action SHA，本次无需另建重复workflow。
- **main规则**：main-integrity新增强制PR与review讨论解决，保留三组CI、零强制审批数和既有紧急绕过；API读回验证生效。
- **提交与模板**：CONTRIBUTING明确main必须走PR；PR模板和Bug/Feature表单双语化；关闭空白Issue，漏洞仍走私密报告链接。
- **验证**：本地typecheck/build/lint/159测试/docs（58文件无断链）/smoke及配置文件格式检查通过。


### 2026-10-21 — 外部Skill单真源接入（公开摘要）

- 本地外部Skill维护验证了catalog no-materialize登记、canonical根链接、精确读取、附件发现、索引刷新与单Agent显式投影的组合；没有为这些操作新增第二份可写真源或执行全库sync。
- 这些是个人宿主接入记录，不构成仓库提供图像/视频生成能力或跨宿主普遍验收。个人目录、媒体操作细节、素材和本机备份/运行回执不纳入公开交付；完整原记录保留在原工作区。
- 后续软件门禁均使用合成Skill和隔离目录；外部项目的生产内容、凭据及配置不属于本仓库发行物。

### 2026-10-24 — P11-03 最小 available_skills manifest 导出

- 新增 CLI `manifest`，按 100 条分页导出已登记 Skill 的 `name`、`description` 和 Hub `skill_search`/`skill_read`/`skill_files` 按需读取提示，不写入 Skill 正文或本地路径；输出按名称稳定排序并转义 XML 特殊字符、过滤非法 XML 码点。
- 默认行为只预览：无 `--out` 输出清单；指定 `--out` 只报告 dry-run 计划。仅 `--out <path> --apply --yes` 才写入，使用同目录临时文件加 rename 原子替换普通文件，并拒绝符号链接/目录。此功能是显式静态发现兼容项，不改变 Hub MCP 默认按需读取路径。
- 101 个合成 Skill 验证分页、排序、转义、不泄漏正文、dry-run 无写入、显式确认后写入和符号链接拒绝。`pnpm test` 38 文件/162 项通过；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm docs:check`、隔离 `pnpm smoke` 全部通过；smoke 确认未触碰个人 Hub。
- 设计依据：[Agent Skills specification](https://agentskills.io/specification) 的 name/description 元数据与渐进披露说明；[OpenSkills README](https://github.com/numman-ali/openskills/blob/main/README.md) 的 `<available_skills>` XML 和按需读取模式。实现仅借鉴清单结构，不声称兼容其安装/同步流程。


### 2026-10-24 — P11-04 来源锁迁移与 Git commit pin 文档切片

- 复核 managed lock v1：GitHub 来源保存 `url/ref/commit/subpath/treeHash`；完整树 hash 覆盖文件内容、路径、空目录和执行位，忽略 `.git` 与时间戳。`adopt` 要求现有 canonical 与来源完整树一致；旧 catalog 的 SKILL.md hash 不能充当 managed treeHash。
- 在临时 `SKILL_HUB_HOME=/tmp/skill-hub-pin-check.4wqcRN/hub` 使用 `anthropics/skills` 的 `pdf` Skill 和完整 commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44` 执行 install dry-run；CLI 返回 `dryRun=true`、`provenance.revision` 等于请求 SHA，`sourceTreeHash=sha256:95f323c8fcd157554bc5fc98df5732c8dd9dab2334488889e3c2df7924bd2cd8`。未执行 apply，也未读写个人 Hub。
- 同 SHA 对 skill-hub 自身仓库的试验在来源扫描阶段因既有 `tests/fixtures/skills/bad-skill/SKILL.md` 无效而拒绝部分导入；这是扫描完整性保护，本轮没有改它，也不能用该失败否定 SHA ref 支持。
- 更新统一管理手册与 API/STATUS，准确说明来源锁字段、SHA pin、adopt 条件，并明确目前没有用户可调用的 per-Skill 历史 rollback/overlay/fork 命令。P11-04 保持 in_progress；完整用户工作流仍未完成。


### 2026-10-24 — P11-04 单 Skill managed rollback 实现

- managed update 备份批次现在在 Skill 树外写 versioned `managed-rollback.json`，保存本批次更新前的来源锁；文件使用 exclusive 临时文件和同目录 rename，目录与 sidecar 保持状态目录权限边界。rollback 不改写整份旧 lock，只把目标 Skill 的旧锁合并进当前锁，保留其他 Skill 后续版本。
- 新增 `skill-hub rollback <name> --from <backupPath>`：默认 dry-run；写入需 `--apply --yes`。只接受 `backups/<batch>/<name>` 精确子路径，拒绝 symlink、目录错位、旧式无 sidecar 备份、坏 schema、备份树与来源锁 hash 不匹配，以及已偏离当前锁的 canonical。本地快照恢复不访问上游、不执行 Skill；每次回滚也备份当前版，可用返回的新 backupPath 再回滚。
- 167 项测试通过；`pnpm build` 与隔离 `pnpm smoke` 通过。Core 测试覆盖多次版本、来源目录离线后仍能回滚、dry-run 不写入、反向回滚、多 Skill 批次只回退目标锁、本地编辑保护、备份篡改拒绝和旧备份拒绝；smoke 通过真实 CLI dispatch、默认预览、apply 门、同步后的 symlink 可见性及 `verify`。Smoke 报告 `personalHubTouched=false`、`paidModelCalls=0`。
- 事务语义仍与既有 managed 更新一致：目录和 managed lock 在 core 事务中恢复；CLI 随后的 catalog/history/index 刷新不是同一跨包事务。错误时按手册运行 `list` 检查并重建 index。本地用户可篡改 state backups；sidecar/hash 是一致性检查，不是签名防篡改机制。P11-04 仍未完成，因为 overlay/fork 工作流待实现。


### 2026-10-24 — P11-04 managed fork 与 overlay 来源关系完成

- managed lock v1 增加可选 `overlayOf`，旧锁无该字段仍可读；install/adopt 新增 `--overlay-of <base-name>`，只接受单个、不同于 base 名称的 Skill，且 CLI 要求 base 已在当前 catalog 并且路径可读。关系写入 managed lock、catalog provenance 和 `overlay` history；update/list/rollback 保留它。
- 用户 fork 流程是复制整棵 Skill 到新目录、把目录名和 SKILL.md `name` 改成新 kebab-case 名，再 install/adopt 并指定 `--overlay-of`。来源锁保存 Git commit（若 Git source）和完整 treeHash。overlayOf 仅按名称标注关系，不做文件合并、不改路由冲突；没有自动 fork-copy 或既有 base 重绑定命令。
- 增加 integration 回归：配置 `sources[].overlay_of` 的 no-materialize ingest 写入 provenance/history，fork source 移动后更新 source path 并重新 ingest 可恢复 catalog 路径；managed 测试覆盖 overlayOf 在 install/update/list/rollback 间保留、多技能批次只改目标锁、自引用与多技能拒绝。隔离 CLI smoke 验证 base 检查、默认预览、显式 apply、managed lock/history 写入及后续 update 保留关系。
- `pnpm test` 39 文件/170 项、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm docs:check`、`pnpm smoke` 和 `git diff --check` 通过；smoke `personalHubTouched=false`、`paidModelCalls=0`。P11-04 达到任务板验收并标记 done；P11-05 Jev 评估集与 CI/release 门禁成为下一项。
- 默认并发全测曾因该 runtime 文件系统用例超过 5 秒偶发超时；用例包含多轮 symlink/目录扫描/分页读取，独立及单 fork 运行通过。仅将该用例 timeout 调为 10 秒，断言未变；之后默认 `pnpm test` 170 项全通过。


### 2026-10-24 — P11-05 Router 评估集 CI 数据合同门禁

- 核实现有评估集为 50 条（30 required、15 none、5 ambiguous），`labelStatus` 明确要求 Owner 复核；初始检查发现旧 `eval:router` 默认读取 `~/.skill-hub/catalog.json` 并写 ignored outputs，故不直接接入公共 CI，也不冒称 draft labels 可支持质量阈值。
- 新增 `pnpm eval:check` 的独立只读验证器，检查 v1/schema、≥30 条、唯一 ID、task kind 与 expected labels 一致、合法 Skill 名、dataset 自声明 `synthetic-generic`，并扫描常见 home 路径、邮箱、已知 token 形状与 secret assignment。报告只输出字段路径和规则码，不回显任务文本；明确写出静态规则无法证明语义匿名。
- GitHub Actions 执行 `pnpm eval:check`，没有私有 catalog、写文件或模型 API 依赖。集成测试在临时目录验证当前数据集通过、重复 ID 和邮箱命中会失败且不泄漏查询文本。
- 当前 `labelStatus` 仍是 agent-authored draft；CI 只门禁数据结构/常见敏感串，不门禁 Recall、accuracy、cost 或 escalation。Owner 审核和显式付费 Jev 评估仍是 P11-05 未完成范围；TypeSafe 官方 API 返回 usage 的 input/output token counts，官方当前主页列出价格信息，但本轮不据此推算任何实际费用。实时费用评估必须明确 opt-in，不能在默认 CI 运行。
- `pnpm eval:check`、overlay/managed 相关测试及全量检查通过；Gemini 网站登录仍返回 authentication_error，本轮未调用替代型号。设计参考 [TypeSafe 官方 API 文档](https://api.typesafe.ai/redoc) 的 SystemOne 请求/响应和 usage 字段，以及 [Choice 官方指南](https://typesafe-jev.com/en/capabilities/choice/) 对 probability、confidence 语义的区分；后者是独立社区指南，仅用于交叉参考，非 vendor 官方来源。
- 离线 `eval:router` 改为必须传入显式 catalog 路径，不再默认读取 `~/.skill-hub/catalog.json`；输出默认 stdout，只有用户明确传 report path 才写文件。报告新增每个 variant 的 index build 与 query p50/p95 latency，并明确 cost/USD 与 Jev escalation 对纯 BM25 为 not-applicable/null；用临时 30-Skill 合成 catalog 验证三种 variant 报告结构，结果未作为质量证据保存。report rows 包含 query 和 Skill 名称，私有 catalog 报告应留在本地。
- 在线 Jev 指标仍待后续 opt-in：TypeSafe 官方 API schema 返回 usage input/output token counts，官方当前主页另列价格，但本轮未调用 API或据此推算 USD。Jev Web 独立审查请求返回 `malformed_sse`，会话已显式关闭且未自动重试；Gemini 4 查询仍因认证失败停止。
- 默认全量 `pnpm test` 40 文件/173 项、`pnpm eval:check`、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm docs:check`、`pnpm smoke` 和 `git diff --check` 全部通过；smoke 报告 `personalHubTouched=false`、`paidModelCalls=0`。P11-05 仍未完成，因为标签未 Owner 复核，且本轮没有真实 Jev usage/cost/escalation 运行数据。
- `docs/harness/QUALITY_GATES.md`、`HARNESS.md`、`docs/ops/ENVIRONMENT.md` 和 release checklist 已同步数据合同门禁与显式 catalog 评估入口；P11-05 后续仍需 Owner 标签复核、真实/授权 Jev 指标和完整 workflow/release 决策。


### 2026-10-25 — P11-05 TypeSafe 最近请求 metrics 可观测性

- `TypeSafeRouterEngine.getLastRequestMetrics()` 现在暴露不含输入内容的实例级最新 query 观测：响应 model、round-trip latency、API 报告的 input/output tokens 和 HTTP/JSON 完成状态。API 未报 usage 或字段格式异常时保留 `null`，不因可选计量字段错误而改变路由结果；失败请求只留 latency/status，未发请求为 `undefined`。此 getter 与现有 `getDecision()` 一样不是并发逐请求关联结果。
- 单测通过 mock fetch 覆盖正常 usage、格式异常 usage 不阻断 routing、请求失败 latency、无 key 时不观测、重建索引清空旧值，以及 metrics 不包含私有请求内容和 API Key。此接口为未来明确 opt-in 的串行 live eval 提供原始使用信号，不触发真实网络/付费调用，也不自行推算成本。
- DeepSeek 审查指出共享 instance getter 不是并发逐请求结果；API 文档已明确其语义，后续 live evaluator 应串行查询并在每次 query 后立即采样 metrics。默认 `pnpm test` 40 文件/175 项、`pnpm eval:check`、typecheck、lint、docs:check、build、sandbox smoke 和 diff-check 通过；未运行真实 Jev 请求。Gemini 4 模型清单本轮仍因 authentication_error 不可读取。


### 2026-10-25 — P11-05 在线 Jev evaluator 基线实现

- 新增 `pnpm eval:router:jev`，只有显式传 catalog、model、max requests、`--confirm-paid-requests` 和 `--confirm-skill-metadata-upload`，且 `TYPESAFE_API_KEY` 存在时才会加载 Router/发请求。每条任务最多请求一次；首个错误后停止，不重试，也不回显 provider error body。`pnpm smoke` 确认不带确认参数时 runner 在加载 catalog/发请求前以 usage 退出。
- 在线 report 按任务类型记录 required Hit@1/Hit@5、none correct/selected-candidate rate、ambiguous expected Hit@5、Jev escalation recommendation rate、p50/p95 latency、响应 model 与 input/output usage。该比例统计 `escalationRecommended` 模型标志，不是实际人工升级率。默认 stdout；可显式 `--out` 写本地 report，但仅保存任务 id/类别/标签和 Skill 名称，不保存 query/candidate descriptions/paths/key。私有 catalog report 仍需保密。
- USD 估算必须由用户显式提供 input/output USD per million token rates，且全部成功请求返回完整 usage；否则 USD 为 `null`。本轮没有设置默认价格，也未运行真实 Jev eval，没有线上准确率、费用或升级率结果。
- 使用 TypeSafe 官方 OpenAPI/API 资料核对 Choice/usage 字段；DeepSeek 对 TypeSafeRequestMetrics 并发语义的审查已采纳，API 文档声明实例级 getter 不是并发逐请求关联。Gemini 4 模型清单再查仍因 authentication_error 停止。
- 最终 `pnpm test` 40 文件/175 项、`pnpm eval:check`、typecheck、lint、docs:check、build、sandbox smoke 与 diff-check 通过；smoke `personalHubTouched=false`、`paidModelCalls=0`。P11-05 仍需 Owner 复核 labels、选择评估规则，并在单独授权后运行 online benchmark 才能完成。


### 2026-10-25 — P11-05 evaluator opt-in 护栏与验收

- 新增 `pnpm eval:router:jev`，要求显式 catalog、model、最大请求数、付费确认和技能元数据上传确认，且必须已有 `TYPESAFE_API_KEY`；runner 固定官方 TypeSafe endpoint 并忽略 `TYPESAFE_API_URL`，每个 draft query 最多发送一次请求，任何一次失败立即停止，不重试。评估调用 metadata-only TypeSafeRouterEngine，报告按类别 hit/none 指标、升级建议率、延迟和 API usage；不保存 query 或目录路径，技能名与标签仍使私有 catalog 报告需保密。
- USD 估算只有用户显式传 input/output 每百万 token 单价且每个成功响应都返回完整 usage 时才计算；否则输出 null 与原因。没有内置单价、自动取 Keychain 或默认运行；本轮只实现代码并在 smoke 中验证缺少显式确认时以 usage 提示退出，未发真实 Jev 请求。
- `--out` 使用同目录唯一临时文件+rename，要求目标为普通文件并以 0600 创建，拒绝 symlink/目录；独立 integration test 覆盖原子替换、权限和拒绝覆盖链接目标。Sandbox smoke 确认缺少确认旗标/API key 时均在联网前拦截。`TypeSafeRouterEngine.getLastRequestMetrics()` 的 mock 测试保留 confidence/escalation 排序不变，验证成功/失败 usage 和延迟，不包含输入或 key。在线 accuracy/cost/escalation 仍没有真实证据；Owner 复核 50 条标签仍是 P11-05 未完成项。
- 全量 `pnpm test` 41 文件/177 项、`pnpm eval:check`、typecheck、lint、docs:check、build、sandbox smoke 和 diff-check 通过；本轮未运行 live evaluator。
- Live runner 同步包含本地 BM25 baseline：同一 catalog 与同一 draft task prefix，逐任务记录 BM25 top-5 和本地 query latency，并汇总 required/none/ambiguous 指标；Jev 与 BM25 用同一标签比较，BM25 明确为 0 model calls / 0 cost / 无 escalation 决策。新增纯本地合成 BM25 helper 回归；未调用 Jev API。
- runner endpoint 固定为 `https://api.typesafe.ai/v1/systemone` 并忽略 `TYPESAFE_API_URL`，避免认证后意外将已确认上传的数据发送到其他主机；报告包含 endpoint host 供审计。在线结果仍需单独 opt-in 执行。
- 若显式提供 `--out`，runner 会在首次 Jev 请求前预检并确保父目录可写，拒绝 symlink/目录目标；最终报告仍用 0600 同目录原子替换。报告中的 escalation 是推荐标记率，不代表真实人工行为。
- `--max-requests` 选择策略改为确定性 required → none → ambiguous 轮询，按各类别原始顺序取样并在 report 记录全数据和所选样本类别计数。这样小预算尽量覆盖不同类型，但会改变类别比例，metrics 仅描述所选子集、不外推总体；纯函数单测覆盖 N=0/1/3/5/超总量、队列耗尽和顺序稳定。
- DeepSeek 建议明确轮询样本的选择偏差；已在报告 note 与 API/ENV 文档说明类别比例变化。P11-05 仍不设 draft 质量阈值，Owner 复核和线上评估留待后续。


### 2026-10-25 — P11-05 离线路由报告安全与 smoke 闭环

- `eval:router` 要求显式传 `catalog.json`，不再自动读取默认用户 Hub；默认 stdout，只有传入 report path 才写文件。每个 BM25 variant 报 index build 与 query p50/p95，报告明确标注 modelCalls=0、cost not applicable、escalation null；rows 含 query/Skill 名，私有 catalog 报告应留本地。
- `pnpm smoke` 现在建立临时、合成 metadata catalog 并执行真实离线 evaluator CLI，验证 3 个 variant 的 latency/usage schema 和无模型调用。临时 eval 结果已清理；这些合成 metadata 不用于声称真实路由质量。
- TypeSafe 官方 API 文档列出 response usage token fields，官方主页单列当前价格信息；本轮未调用付费 API、未从 token counts 推算 USD。Jev Web 独立审查返回 `malformed_sse`，会话状态已检查并关闭，未重试；Gemini 4 模型查询因 authentication_error 停止。
- 默认 `pnpm test` 40 文件/173 项、`pnpm eval:check`、`pnpm typecheck`、`pnpm lint`、`pnpm docs:check`、`pnpm build`、`pnpm smoke` 与 `git diff --check` 全部通过。P11-05 仍需 Owner 复核标签以及显式授权的在线 Jev quality/usage/escalation eval；draft 数据未进入质量阈值。


### 2026-10-25 — P11-05 Jev evaluator 加入同任务 BM25 对照

- opt-in `eval:router:jev` 对同一显式 catalog/task prefix 先运行本地 BM25 baseline，再串行调用 Jev；报告分别记录两者 top-5、required/none/ambiguous 指标与查询延迟。BM25 标为零模型调用、零成本且不适用 escalation，避免拿 Jev 单边指标冒充比较。
- Live evaluator 固定官方 TypeSafe endpoint 并忽略 `TYPESAFE_API_URL`，要求明确付费和 metadata 上传确认；`--out` 在首次请求前预检目录/目标，并使用私有权限原子写。失败不重试，费用无法确认时保持 unknown。
- 纯本地 BM25 comparator 单测与隔离 smoke 通过；Smoke 确认 live runner 缺少确认或 Key 时不发请求，且临时 eval catalog/report 清理。全量 `pnpm test` 42 文件/179 项、`pnpm eval:check`、typecheck、lint、docs:check、build、smoke、diff-check 通过。
- 本轮未调用 Jev API，未取得真实 accuracy/usage/cost/escalation 样本；标签仍是 agent-authored draft。DeepSeek Web runner 审查遇 malformed SSE，已检查并关闭会话；Gemini 4 仍认证失败。P11-05 保持 in_progress，下一步需 Owner 标签复核并单独授权线上评估。

- `--max-requests` 低预算选择对 required/none/ambiguous 做确定性轮询，以减少原始数据顺序导致的类别遗漏；报告同时记录全体、计划选择和实际完成的各类数量。DeepSeek 审查指出抽样改变类别比例，因此 runner 明确声明这些是所选 draft 子集描述，不能外推为总体性能。
- 明确 catalog 中缺少本次 round-robin 样本的预期 Skill 名时，runner 在读取 API Key/网络请求前以 `E_EVAL_CATALOG_LABELS` 拒绝；隔离 smoke 用临时单 Skill catalog 验证该 preflight。


### 2026-10-25 — P11-05 请求预算下的类别分层

- live runner 的 `--max-requests` 现在对 required → none → ambiguous 做确定性轮询、各类别内部保持数据原序；report 写入 sampling strategy、完整数据类别计数与所选样本类别计数。N=1/2/3/5/超总量边界测试验证覆盖顺序、耗尽跳过和稳定性。
- 低请求预算会改变类别比例，report/文档明确结果只描述被选中的 draft 子集，不能外推为总体性能；未设质量门槛或置信区间。
- 最终 `pnpm test` 42 文件/181 项、`pnpm eval:check`、typecheck、lint、docs:check、build、隔离 smoke、`eval:router:jev --help` 与 diff-check 全部通过。没有运行在线 Jev 请求；标签复核仍待 Owner。


### 2026-10-25 — P11-05 TypeSafe 本地 payload 预览与构造器修复

- 强制重建 TypeScript project references 后发现前一轮抽取的 `buildTypeSafeRouteRequestBody` 引用了作用域外的 `criteria`；增量 typecheck 曾因旧 build-info 没发现。共享构造器现在从候选列表生成 Choice criteria 和 none 选项，并拒绝重复/保留 ID 与超过 254 个候选。TypeSafe 官方 OpenAPI 规定 Choice 的 `criteria` 必填且最多 255 个 property，正好对应 254 个 Skill + none：[OpenAPI](https://api.typesafe.ai/openapi.json)。
- 新增 `eval:router:jev --preview --catalog ... --model ... --max-requests ...`，与线上请求共用 payload builder。预览不读取 `TYPESAFE_API_KEY`/`TYPESAFE_API_URL`、不联网、不运行 BM25 或 live report；默认 stdout 仅返回汇总。仅显式 `--preview-out` 会保存完整查询和候选 metadata，使用 mode `0600` 的同目录原子写；拒绝在线确认/价格/`--out` 参数，并解析路径别名以避免覆盖 catalog 或评估集。
- 隔离子进程测试拦截 key/API URL 读取和 `fetch`，验证 summary 无查询/描述、私有 payload 文件含实际请求体且权限为 `0600`；另验证 symlink 目录别名不能覆盖 catalog。候选 ID/255 属性边界由 router 单测覆盖。DeepSeek Web 两轮代码审查发现的保留 ID 与路径别名边界已采纳并通过测试。
- Gemini 模型清单查询返回 `authentication_error`，依规则停止，未换账号或型号；native DeepSeek subagent transport probe 未按要求只返回 marker，仓库中也没有 `scripts/run-worker.sh` 回退入口，因此未重试该 transport，改用已授权的 DeepSeek Web review。没有运行真实 Jev 请求。
- 最终 `pnpm test` 42 文件/186 项、`pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm docs:check`、`pnpm eval:check`、`pnpm smoke`、代码/测试文件 Prettier check 与 `git diff --check` 全部通过；smoke 报告 `personalHubTouched=false`、`paidModelCalls=0`。全文件 Markdown Prettier check 仍报告 PRD/ROADMAP/TASK_BOARD 的格式不匹配；统一它们会重排多张表格和列表，本轮保留现有文档版式。P11-05 仍待 Owner 复核标签及单独授权的真实 Jev accuracy/usage/cost/escalation 评估。


### 2026-10-25 — P11-05 固定 v1 评估数据类别契约

- `pnpm eval:check` 先前只要求至少 30 条任务和每类至少 1 条；这会让删除/重分类任务改变 round-robin 抽样比例却继续通过。现在 validator 按版本定义契约：v1 必须恰好 50 条，其中 required/none/ambiguous 为 30/15/5；未知版本是 CLI 失败，未来分布变化需新增契约版本。
- 回归测试覆盖 51/49 条漂移、总量不变的类别偏移、类别数仍正确但 required label 丢失、未知版本非零退出。`retrievalQualityThresholdsApplied` 仍为 false；这只约束数据组成和结构，不判断任何语义标签对错。
- DeepSeek Web 复核同意精确分布应限于 v1，并提醒未知版本必须硬失败、结构计数与语义质量分开；主模型核对了 CLI exit code 和 label-integrity 测试。联网查看 OpenAI Graders API 的 Label Model schema 后确认其将 `labels` 与 `passing_labels` 显式建模，但没有规定该数据集的类别配比；本项目 30/15/5 来自本地 v1 合同，而不是通用外部标准：[Graders API](https://platform.openai.com/docs/api-reference/graders/label-model?lang=python)。
- 最终 `pnpm test` 42 文件/188 项、`pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm docs:check`、`pnpm eval:check`、`pnpm smoke`、代码文件 Prettier check 与 `git diff --check` 通过；CI gate 实测仍报告 50/30/15/5。未运行真实 Jev 请求；Owner 标签复核仍待完成。


### 2026-10-25 — P11-05 准备 Owner 标签复核工作表

- 从仓库已检查为 `synthetic-generic` 的 v1 数据集生成 `outputs/jev-label-review-v1.md`，列出 50 个 ID、类别、query 和当前 `expectedAnyOf`，并留空 Owner 决策/修正与理由栏。工作表不含 catalog metadata、Skill 路径、凭据或模型输出，不会回写源 JSON，也不代表标签已通过复核。
- 确认输出位于 `.gitignore` 的 `outputs/*` 下，权限为 `0600`，表内恰有 50 个任务行；未发送网络请求或调用模型。Owner 可在本地工作表逐项给出批准/修正，再由后续工作明确回写源数据。
- DeepSeek 复核指出工作表需说明 `expectedAnyOf` 是精确候选名的 OR 集合，并避免暗示 `none` 取决于词面重合。主模型检查 `eval-router-jev` 源码确认 `ambiguous.expectedRecallAt5` 确实作为独立诊断输出，随后在工作表补上 required/none/ambiguous 的判定规则及“勿用 BM25/Jev 输出定义真值”的提醒；源数据和标签未改。
- 工作表现在给出完整的离线覆盖检查命令 `pnpm eval:router:jev -- --preview --catalog <catalog.json> --model <model> --max-requests 50`（先运行 `pnpm build`），在无 Key/网络下预检全部标签名。联网复核 OpenAI Graders API 后，只借其对 label/passing-label 显式建模的事实，不把它当作 routing ground-truth 依据；语义判定仍由 Owner 按项目定义和 Skill 描述完成。


### 2026-10-25 — P11-05 等待 Owner 复核与线上评估授权

- 任务板其余未完成项 P13-03/P14-03 需要宿主 GUI 新会话或 Qoder 登录；P11-05 的离线技术切片、固定 v1 结构合同和 Owner 复核工作表均已准备。当前没有无需用户输入即可继续并符合任务板范围的验收步骤。
- P11-05 改为 `blocked`，等待 Owner 核对/修正标签、提供用于评估的显式 catalog 路径，并明确授权最多 50 次付费 TypeSafe 请求及上传任务 query 与候选 `name/description/keywords`。本轮没有读用户 catalog、运行付费请求、改源标签或修改用户配置；收到所需输入后再恢复该任务。

### 2026-10-25 — P21-01 DSH 本地 Skill 管理调研

- 用户询问下一步优化方向及 DeepSeek Harness 中热门本地 Skill 管理项目。重点核对 MichengAI/dsh-skills-manager `40677d74f53805c99d183c202cd67ea5bb6294e2`（1.2.18），另对照 daha1216 同名项目与官方 Harness Skill provider/tool 文档；用户原始链接未提供，报告明确候选身份未最终确认。
- 主要可借鉴项为上游更新/本地冲突双维度状态、文件差异、确认 token 和应用前复验，以及多来源/工作区管理体验。保留 Hub 的完整 Git commit 来源锁、含执行位/空目录的 treeHash、跨 Agent MCP/分页附件读取；不照搬外部归档摘要充作 commit、扫描跳过错误、全目录摘要注入或第二可写真源。
- DeepSeek Web 对公开设计摘要完成方案复核；主模型核对源码后将建议拆成只读检查契约 → 现有来源更新计划 → 来源迁移 → 管理UI → 可选DSH adapter。P11-05 的付费评估阻塞不应继续阻止独立的管理可靠性切片。具体实施未授权、未开始。
- 新增研究报告并登记 INDEX/TASK_BOARD。仅保存公开源码快照到 ignored outputs；未安装/运行第三方代码或测试，未修改业务代码或用户 Hub。GitHub API 报告主要候选固定SHA的验证workflow成功；这仅是上游CI证据，不是本机宿主验证。
- 文档验收：`pnpm docs:check` 59 个 Markdown 文件、无坏本地链接，`git diff --check` 通过。业务代码未变，未重复运行全量代码测试。
- 用户随后明确确认目标为 MichengAI/dsh-skills-manager，已移除报告、索引与任务板中的项目身份待确认标记；此前源码调研对象正确，优化建议和未实施边界不变。

### 2026-10-25 — P21-02 统一只读更新检查落地

- 用户授权自主学习并推动优化后，新增 core/CLI `check-updates [name,...]`，复用来源锁校验、来源解析和完整树哈希；分别报告 localStatus、upstreamStatus、updateAvailable、applyBlocked、锁/当前/上游hash及Git版本、checkedAt与逐项errors。默认只枚举来源锁；上游变化按锁基线比较，本地修改不再遮住上游；失败保持 unknown/null，complete=false并输出partial JSON后退出3。相同repo/ref在一次检查中共享临时快照，失败结果也复用；无持久缓存、自动重试或Skill执行。
- list 复用现有 scanner 的 issues 保留健康条目，不完整时显式返回诊断；扫描祖先不可读时不冒称Skill已删除，仍保留canonical symlink/越界保护。CLI只读检查采用参数白名单、拒绝apply/yes，不读取或改写catalog；修正所有managed dry-run的JSON next误称已更新。实际 update/apply 的本地修改拒绝和整批事务保护未弱化。
- 新增11项core/Git进程mock/编译CLI回归：失败来源与健康项并存、本地修改与上游changed/unchanged独立、坏链/不可读祖先/越界条目、缺失和无lock、坏lock整体失败、写入参数拒绝、同repo/ref共享及清理、固定SHA保持、catalog损坏时仍可只读检查，以及canonical/state/Agent内容hash不变。smoke新增真实编译命令检查。
- DeepSeek Web 对实现摘要做独立反审查；主模型以源码和测试排除了上游错误未计入complete、共享checkout过早清理等假设，并收紧applyBlocked、祖先扫描失败状态及CLI参数拒绝；显式无来源锁的请求保留error/不完整，因为该请求无法完成版本判断。没有把完整性当写入授权。
- 既有授权范围内运行一次真实Hub只读检查，完整返回所有受管项而未被单条来源失败遮蔽；真实list也保留可读条目并报告扫描/条目问题。比较锁、配置、catalog、history、index、canonical成员关系与受管树的前后内容哈希，未变化。真实名称/路径/清单未写入仓库，也未发给其他模型；没有应用升级或修复用户目录。
- 验收：强制TypeScript project rebuild、pnpm build/typecheck/lint/test/docs:check/eval:check/smoke、改动代码Prettier check、git diff --check通过；全量45文件/199测试。sandbox smoke personalHubTouched=false/paidModelCalls=0。下一项为P21-03文件差异与冻结确认计划；来源迁移、可写Web、DSH适配仍未实现，P11-05仍待Owner标签/显式付费与上传授权。

### 2026-10-25 — P21-03 文件差异与版本绑定更新计划

- 用户要求自主驱动规划，推进既定P21-03：update预览现在提供added/removed/modified文件差异、目录/文件类型、内容摘要与执行位变化，不输出文件正文。原hash walker增加可选metadata manifest收集，hashSkillTree原字节流保持不变，golden hash兼容测试通过。
- 确定性planToken绑定版本化schema、canonical/state真实位置、排序后的目标集合、每项旧来源锁、实际当前树、目标来源锁（确切Git commit/treeHash/overlayOf）和目的位置/operation。core的update写入必须有planToken，CLI同时仍要求apply+yes；缺/错格式报E_CONFIG，目标或来源/内容/位置漂移报E_CONFLICT；旧token不自动追随新分支版本。check-updates不生成应用计划，install/adopt/rollback不改变原确认流程。
- 实际apply在原state锁内重建计划、校验token，再走已有全体staging/备份/替换前复验/逆序失败恢复。新增备份前与来源锁提交前全锁语义重验，检测非协作锁修改后恢复canonical且保留外部锁。选中项以外的正常更新不使单项token失效，也不会被覆盖；全集新增成员使全集token失效。
- Gitcommit移动但Skill树不变时action=noop、changes为空而sourceLockChanged=true；token仍变化，应用只写来源锁，不替换该canonical目录。测试核对目录dev/inode。token不是权限/签名/持久上游缓存，不抵抗同用户主动篡改；捕获运行时失败恢复不等于断电/进程崩溃自动恢复；ADR0011明确这些边界及v0.x写接口兼容变化。
- DeepSeek Web对设计/实现摘要两轮反审查，主模型核对源码与测试采纳无关锁更新保留、commit-only目录不替换、混合noop/update恢复和锁漂移断言；未采纳不适用的overlay依赖执行、整锁字节绑定、token可解析JSON或虚构E_ROLLBACK错误码建议。没有发送私有Skill清单/内容，Gemini既有认证错误未重试。
- 验收：47文件/209测试通过；强制tsc -b --force、pnpm build/typecheck/lint/docs:check/eval:check/smoke与代码Prettier/git diff --check通过。编译CLI验证无token/无yes拒绝、上游漂移拒绝旧token、新tokenapply和原备份rollback；完整目录hash验证失败时不改内容；原多Skill失败恢复用例适配先preview再apply后仍通过。Sandbox personalHubTouched=false/paidModelCalls=0，未对真实Skill执行升级、未提交推送。
- 下一项P21-04显式来源迁移与失效诊断：先在合成沙箱完成迁移预览与来源锁恢复；不自动猜上游/改用户锁。管理UI和DSH adapter继续后置；P11-05仍需Owner标签/显式付费上传授权。

### 2026-10-26 — P21-04 显式同内容来源迁移与失效诊断

- 本轮先读HARNESS/AGENTS/STATUS/TASK_BOARD/PROGRESS并核对git status，无进行中条目，选择P21-04；保留全部既有未提交修改。CodeGraph定位managed调用与影响范围，其返回截断部分再按需读取；不引入第三方库或新服务。
- 新增core/CLI `migrate-source <name> --source <新来源> [--ref ref]`：一次只迁移一个已有managed Skill，旧来源可以已失效；当前canonical与新来源均须等于旧锁完整treeHash，保留overlayOf。不把本地改动认作新基线，不合并内容升级；拒绝canonical/state与新来源相互包含（含根symlink指向自身）、目标缺失、名称不符和隐式批量。
- 默认预览返回previousSource/nextSource完整锁、空changes、sourceLockChanged与planToken；复用既有字段绑定和state锁，但使用独立skill-hub-migrate-source-plan-v1合同，不能套用update token。core要求预览token，CLI仍需apply/yes；应用重新取新来源并重建计划，拒绝旧/新来源锁、Git commit、当前树或Hub位置漂移。
- 实际迁移只写来源锁及既有CLI catalog/history/index，保留canonical目录dev/inode。写锁前复用完整树与旧锁备份，返回既有rollback可读取的backupPath；备份后重验canonical、新来源hash与当前锁。锁写失败/非协作锁编辑/备份期间来源变化时不替换canonical，保留恢复证据；同来源同版本为noop，不新增备份。rollback恢复旧来源关系，不修复外部已失效路径；原有跨包事务和崩溃恢复限制不变。
- check-updates上游错误现在标明锁定来源path和hint，提示先核对路径/ref/访问错误，再显式预览同内容迁移；不把网络或认证故障直接判为来源已删除，不自动猜替代来源。API/PRD/ROADMAP/STATUS、统一管理手册、README与CHANGELOG同步。
- 验收新增11项：本地来源移动后的只读诊断/迁移/rollback、noop、参数和token门禁、拒绝本地改动及内容/执行位/空目录差异、Hub位置与来源锁绑定、自引用/缺失/名称异常、GitHub↔local和同内容Git commit漂移、锁写失败/锁外部编辑/备份期间来源漂移，以及编译CLI catalog/history/index链路。Git只mock子进程边界，未联网下载Skill。初轮一个macOS临时目录真实路径断言修正为realpath；默认全量并发出现三个既有测试超时，未放宽这些超时或跳过测试，降低并发后49文件/220项全部通过：`pnpm test --maxWorkers=2`。
- 强制`tsc -b --force --pretty false`、build/typecheck/lint、docs:check（60 Markdown无坏链接）、eval:check、smoke、改动代码Prettier与git diff --check通过。Sandbox personalHubTouched=false/paidModelCalls=0。未触碰用户Home/生产Skill/服务/凭据，未执行真实来源迁移，未提交推送；本轮无需外部模型，Gemini4未取得有效登录及模型清单证据，跳过调用且不重试或换型号。P11-05继续等待Owner，管理视图和DSH adapter本轮未推进。

### 2026-10-26 — P22-01 Web 视觉与交互重构

- 重设计 `apps/web/public` 的原生只读 SPA，不新增框架、依赖或 API：以暖白画布、墨黑导航和青柠强调色建立统一视觉系统，技能库增加本地索引概览、编辑式标题与三列卡片网格，详情和多端盘点同步重构。
- 保留搜索、筛选、分页、Markdown、审计、文件/历史及盘点行为；分类改为语义按钮，补齐导航当前状态、键盘焦点、`/` 聚焦搜索与 Escape 清空，支持窄屏布局和 `prefers-reduced-motion`。既有 markdown-it CDN 增加 SHA-384 SRI 与 crossorigin。
- ego-browser 使用真实 catalog 验证搜索快捷键、2 条 PDF 搜索结果、清空搜索、标签筛选、分页、详情、静态审计、文件读取、历史与盘点。1440px 桌面和 390px 视口（页面 clientWidth 375）三视图均无页面级横向溢出，移动端两张盘点表在自身容器滚动；项目 origin 未记录脚本异常，markdown-it 加载正常。截图保存在 `outputs/ui-redesign-*.png`。
- 验收通过：`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm docs:check`（60 Markdown 无坏链接）、前端 Prettier check、49 文件/220 项测试、`pnpm smoke`（personalHubTouched=false、paidModelCalls=0）及改动范围 diff-check。未写入用户 Home 或生产 Skill，未提交推送。

### 2026-10-26 — P24-01 补充主流 Agent Skill 来源

P24-03目录状态澄清：用户看到DeepSeek Harness“缺失”后指出应用实际存在。只读检查确认DeepSeek Harness.app安装且有运行进程，`~/.dsh`数据根存在，仅`~/.dsh/skills`原生子目录不存在；未读凭据文件或会话内容。静态解析desktop配置（不执行自定义YAML标签）确认登记skill-hub MCP入口及Hub状态根，不能把配置登记等同于本轮模型调用验收。无证据需要改默认路径，不创建空目录或复制Skill来消除提示。Web列名改“目录状态”，标签为“目录存在/目录未找到”，增加仅检查Skill路径、不检测安装及共享目录/Hub MCP模式可无原生目录的说明；API的exists语义和扫描行为不变。原4173 ego-browser确认DSH行的新标签、提示和说明生效，15目录且无横向溢出，浏览器任务结束。lint/Prettier/docs:check/git diff --check通过；本轮仅展示文案，未新增实现镜像测试或重复全量测试，未重启服务、改用户配置或Skill。

P24-02后续验收完成：用户回复“可以”明确授权仅重启4173本项目Web。先复核监听PID/命令及健康接口，再向旧Node PID 27597发送SIGTERM，并从本仓库用原有 `pnpm web` 入口启动；新监听PID 19863，运行会话86693。原地址 `/api/inventory` 返回6个配置目标和9个新增用户级来源，Qoder已在目标中故不重复。ego-browser在 `http://127.0.0.1:4173/#/inventory` 确认“Agent目录”15行，包含DeepSeek Harness/OpenCode/Gemini CLI/Copilot/Windsurf/Devin/Cline/Roo/Kilo；DeepSeek默认根缺失、0技能、用途只读来源，页面无横向溢出。未重启MCP或其他服务，未改个人配置/Skill，浏览器验收任务已结束。P24-02关闭；下方待授权文字为重启前的历史记录。

后续用户纠正：新增项须在 Web“Agent 目录”内可见。P24-02 已将目标与用户级只读来源合并展示，保留用途区分；原实现只补充 sources 和构建，不代表运行实例已更新。2026-10-26实际4173 HTTP及ego-browser仍为6目标/sources空；监听PID 27597来自本仓库、11:31启动，未重载。独立临时Web预览使用当前构建与同一本地配置，只读HTTP/浏览器确认15目录（其中9个新增路径，Qoder已配置故去重），DeepSeek默认根显示缺失。截图为本地outputs/inventory-agent-directories-20261026.png；桌面无页面级横向溢出。6项相关回归、build/lint/Prettier/diff-check通过。预览服务设120秒自动close；未停止旧进程、未改个人配置/Skill。按用户所给“未经明确要求不杀进程”约束，原4173重载须明确授权；P24-02保留in_progress，原地址生效未验收。

- 核对默认配置原先只有 WorkBuddy、Claude Code、Codex、共享 `.agents` 和 Cursor 目标；现有 DSH 调研不等于接入了来源。按官方文档确认 DeepSeek Harness 用户根是 `~/.dsh/skills`，支持 `DSH_HOME`；同时确认 OpenCode、Gemini CLI、Qoder、GitHub Copilot、Windsurf/Devin、Cline、Roo Code、Kilo Code 的用户级目录。路径依据集中记入 ENVIRONMENT；不调用宿主模型、不安装第三方工具。
- 新增 core `agentSkillSources`，CLI inventory 与 MCP/Web 共用其10个内置路径及显式来源合并结果。既有配置无需改写；显式同ID覆盖路径/scope/enabled，已声明目标或来源路径不重复追加，停用映射不会被内置项绕过。缺失根仍展示缺失。环境路径支持 DSH_HOME/XDG_CONFIG_HOME；不解析 symlink 别名去重，不自动发现项目/模式/插件/系统根，普通Markdown仍不纳入Skill。
- CLI `ingest --sources <内置ID> --dry-run` 支持显式选源预览；省略sources仍仅选择配置中的显式来源，不自动导入新路径。内置来源不加入agents，takeover/backup/sync边界保持不变。Web来源区说明内置与自定义来源及只读行为；MCP/Web按agent ID过滤来源及目标，并保留scope过滤。现有运行进程未重启；完成代码与构建不代表宿主MCP/模型已接入。
- 新增4项core与2项集成回归，全部使用合成临时HOME：官方路径/环境覆盖、空环境值、显式覆盖与停用、已声明路径抑制、旧配置无需改写、10来源真实扫描、CLI过滤、共享摘要、缺失根、DSH平铺Markdown排除、显式导入dry-run及无参数不自动导入。比较临时树成员和配置原文，盘点/预览无新增状态文件，未修改真实用户配置或Skill。
- 验收：typecheck/build/lint、全量53文件237测试、docs:check（最终62 Markdown无坏链接）、smoke（personalHubTouched=false、paidModelCalls=0）、改动代码Prettier与git diff --check通过。API/PRD/ROADMAP/配置模板同步；保留原有未提交修改，未做浏览器验证、提交或推送。


### 2026-10-26 — P23-01 本地使用观测与上下文预算

- 用户明确要求补充Skill使用统计与初始上下文/Token预估；先核对现有history仅为生命周期、skill_stats仅为catalog统计，新增独立P23-01，不把读取当实际执行。既有工作树修改与并行P24来源接入工作全部保留；只在相关模块追加观测及报告，不改Web视觉或用户宿主配置。
- core新增estimateContext纯函数与usage JSONL读写/聚合，router在search/read服务边界记录，CLI/MCP/Web入口用AsyncLocalStorage区分来源。SKILL_HUB_USAGE_LOG未设置时不记录、不运行额外文本估算；显式设置绝对.jsonl路径才启用。fetch内部read只记一次，正文首段/续读/附件分列；搜索候选出现不表示选择，重复首段不是唯一任务，服务返回也不是宿主接收/实际采用/任务成功证明。
- 事件仅保留时间、界面来源、名称、阶段、成功/错误码和返回文本大小/启发式粗估，不写query、描述、正文、附件路径或错误详情。新日志0600，拒绝最终文件symlink、外来schema与不完整末行追加，事件64KiB/文件32MiB上限。日志失败只发无私有内容stderr告警并保留原服务结果；坏行报告部分健康记录与complete=false，未记录历史保留未知，不冒充审计账本。smoke显式清空继承的个人usage路径。
- CLI新增usage [name] --days/--origin/--log只读聚合，以及context-cost [name] --catalog/--max-chars/--context-window静态报告。静态报告分别提供name+description元数据、当前SKILL.md全文和首段，不扫描附件；复用原10MiB根内安全读取一次读完整文本。坏正文保留元数据、大小/估算为null，catalog缺失扫描回退标不完整，CLI退出3；静态盘点不计入使用次数。
- ADR0012明确utf8-heuristic-v1的ASCII/4+非ASCII码点×1.5算法，同时报告UTF-16长度、码点数和UTF-8字节，不承诺tokenizer误差范围。逐项估算之和不是模型账单、真实启动开销或节省证明；actualModelTokens/actualCost保持null，不猜宿主窗口、缓存或实际费用。API/PRD/ARCHITECTURE/ROADMAP/STATUS、README/CHANGELOG/ENVIRONMENT与索引同步，新增USAGE_AND_CONTEXT手册；未新增runtime工具或Web报告接口。
- 新增11项回归：字符/字节与中英混合/emoji粗估、按来源/阶段/日期过滤、未知历史与坏行、隐私schema/外来文件/symlink/并发追加；默认无写入、显式统计、fetch不重复、静态报告不自计数、日志失败不阻断读取、局部失败/大文本/无catalog，以及编译CLI与实际MCP/HTTP服务入口隔离。测试首次导入Web漏设既有NO_START开关导致EADDRINUSE和未处理退出，按项目既有测试方式补开关后通过；未操作运行服务。
- 当前工作树（含并行既有来源接入变更）全量53文件/237项通过；强制tsc -b --force、build/typecheck/lint、docs:check（62 Markdown无坏链接）、eval:check、smoke、改动代码及新文档Prettier、git diff --check通过。smoke personalHubTouched=false/paidModelCalls=0。另对真实catalog仅执行静态只读粗估，成功保留部分结果及失效条目状态；未开启真实usage日志，私有名称/路径/正文未写入仓库或上传。未调用外部模型、未提交推送。


### 2026-10-26 — P23-02 Web使用率与上下文预算、筛选排序

- 用户要求在Web展示使用与上下文统计，并确认“使用lv”指读取次数占比的使用率，不做LV等级。新增独立“使用与预算”导航和/#/usage视图，保持技能库、详情、Agent来源盘点的既有改动。时间7/30天/全部、MCP/CLI/Web/library/全部来源、分类、关键词和观测状态均可筛选；支持使用率升降序、最近读取、正文Token粗估升降序与名称排序。
- 新router/usage-overview复用catalog/taxonomy、readUsageReport和skillContextCost；先计算所选时间/来源内当前catalog全部成功正文首段请求分母，再做UI过滤、全局排序和分页。分类/关键词筛选不使单项占比自动变成100%，已移出catalog的日志不进入当前库分母；续读/附件不计作首段。未知次数/百分比保持null，无全库首段分母不算百分比，未知值在升降序都排后，同值按名称稳定排序。
- Web新增固定参数GET /api/usage-overview，不允许客户端指定日志/catalog路径，非GET拒绝。日志缺失、日志部分损坏/不可读与预算局部失败分别返回明确状态，预算仍可保留健康项；不读取正文给前端、不记录盘点动作、不执行Skill。页面显示小样本提示、观测与模型采用的边界、算法非账单口径，正文字符/字节和元数据/全文/首段Token可见；默认MCP来源，Web人工浏览须显式选择。
- 5项新增合成回归覆盖全库排序先于分页、固定分母、分类/文本/状态过滤、日期与来源、移除条目、候选/续读不充当首段、未知末尾、缺日志/坏日志/缺正文、无效参数、只读HTTP与报告不自计数。最初两处测试误将完整分页数组与单项数组匹配，改为显式limit=1验证对应分页；Web包不可直接导入core类型，改由router公共类型导出，保持依赖边界；前端URLSearchParams按既有lint配置显式用window命名空间。
- 使用ego-browser独立TaskSpace验证合成30项库：使用率82.35%/17.65%、升降序、筛选单项后分母仍34、跨页、Token排序、未观测、空结果、小样本、缺历史、来源/时间切换；交互期间未捕获console/脚本异常。桌面1360×1100和手机375×900渲染检查通过，无页面横向溢出，宽表自身可滚动，截图仅留本地。合成QA服务已正常关闭。
- 现有4173运行进程的新接口仍404，未停止/重启。另启动独立本机只读预览连接当前catalog，实际页面显示全库结果、未观测和局部预算失败，排序与可见字符/字节说明验证通过，结果页留给用户查看。预览禁用usage记录，进程/端口/停止标记回执留在本地临时目录；未把私有Skill名称/路径或内容写入仓库，也未开启生产日志。
- 强制构建、build/typecheck/lint、全量54文件242项（maxWorkers=2）、docs:check（62 Markdown无坏链接）、eval:check、smoke、改动代码/相关新文档Prettier及git diff --check通过；sandbox personalHubTouched=false/paidModelCalls=0。API/PRD/ARCHITECTURE/ROADMAP/STATUS、手册/ADR与README/CHANGELOG同步。既有修改和P24条目保留，未提交推送。


### 2026-10-26 — P25 全盘复核与公开文档交付准备

- 用户明确授权全盘复核、更新项目文档/GitHub主页、提交推送PR并合入主开发分支；实时确认目标为受保护main、三组required CI与review讨论解决，不使用管理员绕过，不处理无关依赖PR。
- 在最新origin/main创建隔离工作树与codex/project-review-readme分支，按内容hash保存原工作区74文件快照，将待发布代码/测试/文档三方整合；保留远端Vitest4.1.11/Actions更新及贡献治理。两份追加文档冲突保留双方内容；原工作区文件hash未变，运行服务未重启。
- 复核core/router/CLI/MCP/Web/sync与来源、token、回滚、观测、评估边界。新完成矩阵明确功能实现不等于宿主/产品质量验收，保留Owner标签/付费metadata授权与WorkBuddy/Qoder模型回归缺口；修正数据模型copy只验正文、旧版hash/路径、裸sync参数和所有命令默认预览等失真描述，CLI help同步澄清默认行为。
- 重写中英文README的定位/价值/体验/接入/功能/限制，新增原生SVG标记及本轮实际Web截图。截图为12项合成Skill和64次合成首段观测，不是个人库或真实业务用量；截图时隐藏source路径chip，原图未伪造模型效果。临时演示服务正常关闭，既有用户服务保留。
- 更新运维、数据模型、用户场景、PRD、架构、STATUS/ROADMAP/HANDOFF/任务板、贡献检查与文档索引；历史升级/竞品/依赖审查标记为时间点记录。重复治理编号P21-01改GOV-01。公开副本对新增个人运行笔记仅保留Hub相关摘要，原完整笔记仍在原工作区，不纳入私人素材/路径/凭据/catalog/usage或outputs。
- README临时Hub init/install预览与apply/route/read/context-cost/audit/manifest逐条复现，零模型调用。Vitest4下默认pnpm test和maxWorkers=2均54文件242项通过，build/lint/eval/docs/smoke通过；smoke personalHubTouched=false/paidModelCalls=0。提交前继续执行类型/格式/差异和发布范围检查，远端CI与合并仅以实际PR/Actions回执为准，不将本地结果写成远端绿。

## 2026-10-26 — P26-01 Streamable HTTP 托管入口

- 基于已合并main的隔离工作树实现；原工作区未提交文件和运行服务未改动。
- 共享原MCP工具处理器，stdio入口继续兼容；新增`pnpm mcp:http`和HTTP bin。每次POST独立Server/transport，SSE返回、无session，固定search/read/files；所有请求Bearer鉴权、Host/Origin白名单，正文/并发/期限限制与断开清理。
- HTTP读取移除绝对路径元数据，搜索警告、blocked附件和失败去掉服务端诊断细节；授权Skill正文不改写。新增ADR0013并同步API/PRD/架构/README/状态/运维文档。
- 新增9项HTTP集成测试：真实SDK、编译入口、SSE/中文检索/分页/hash/附件、隐藏工具/路径拒绝、token/Host/Origin/方法/JSON/media/protocol、固定与chunked大正文、并发/断开/超时及SIGTERM退出。首次未build就误用`pnpm test --`导致全量CLI找不到dist，随后按项目顺序build并使用明确的Vitest过滤完成回归。
- 验收：`pnpm typecheck`、`pnpm build`、`pnpm lint`、`pnpm test`（55文件/251测试）、`pnpm eval:check`、`pnpm docs:check`和`pnpm smoke`通过；smoke包含编译stdio验收、未触个人Hub、零付费模型调用。实际运行环境macOS/Node26；本轮未运行远端Node20/22 CI，不据此声称跨平台部署通过。
- 用户询问公共托管与npm：核对Render自定义Node服务/HTTPS/付费持久盘、Smithery当前发布指南及npm注册库职责；文档区分服务运行、目录分发和包分发。所有package仍`private: true`，无npm发布、公共账号创建、付费资源、真实Skill上传或公网部署。OAuth、多租户及目标宿主验收单列待办。

## 2026-10-26 — P26-02 npm 0.2.0 命令包候选

- Owner要求继续推进npm分发。保留root/所有workspace的private，统一源码/协议版本为0.2.0，新增pack:npm/check:npm及ADR0014；实际发布未执行。
- 单包自带四个命令及内部JS模块，TypeScript AST只转换module specifier，Node imports解析同包模块，外部依赖仍为锁定的MCP SDK。按当前生产源码枚举，排除陈旧dist、source map、测试、用户数据和安装hook；显式携带五个配置模板与Web静态资源。
- 修正npm bin软链接下HTTP不启动和CLI默认模板相对层级；真实npm安装至独立prefix，从空cwd验证npm exec/version/init/五Agent模板/profile/安装路由附件、stdio握手分页hash、鉴权HTTP和Web HTML。无个人Hub操作或付费模型调用。
- 精确候选：skill-hub@0.2.0，93文件、143114字节；tarball和pack-report/acceptance在本轮忽略的outputs目录，验收报告记录integrity。源码构建、类型、lint、55文件251测试、eval/docs及sandbox smoke通过；CI只追加npm安装门禁配置，未声称远端已运行。
- 初次包验收的独立hash期望漏写sha256前缀，按既有协议修正；版本提升后修正两处旧版本测试期望。npm exec及全部包安装验收最终通过。
- 公共registry对skill-hub返回404（不保证注册资格），npm whoami返回401。P26-02完成；P26-03等待有效npm登录/包名权限，随后才可发布精确tarball、回读integrity并重新安装registry版本验收。无npm上传、无远端部署、无用户凭据变更。

## 2026-10-26 — P26-03 npm发布预检

- Owner确认已完成npm登录；当前whoami为zhangheteng，skill-hub公开查询404。复核已验收0.2.0 tarball的93文件、SHA256和SHA512/integrity，常见凭据/本机路径静态检查无命中。
- 同一tarball的npm publish dry-run通过；未把dry-run算作发布。补充check:npm --registry对精确已测报告进行registry integrity比对和新prefix回读安装验收，真正publish前核对源码提交CI。发布及回读结果另追加。
