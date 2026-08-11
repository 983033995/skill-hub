# 进度日志 — skill-hub

> **只追加，不改写历史条目。**  
> 每条建议包含：日期、阶段、做了什么、证据路径、下一步。

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
  - 在外置盘创建项目：`/Volumes/13759427003/AI/skill-hub`
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
