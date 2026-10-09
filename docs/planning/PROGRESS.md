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
