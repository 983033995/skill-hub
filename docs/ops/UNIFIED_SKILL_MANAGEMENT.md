# 由 Skill Hub 统一管理本机 Skill

状态：实现与验收记录见 PROGRESS 的 2026-09-05 条目。本文中的真实写入命令供 Owner 在看完 dry-run 后执行，不代表本机迁移已经完成。

## 日常入口

在 skill-hub 仓库执行 `rtk pnpm build`，以后统一使用 `rtk pnpm hub`。这是仓库脚本，不需要安装另一套全局 CLI。

```bash
# 本机盘点；插件缓存单列，不纳入迁移胜出
rtk pnpm hub takeover --include-plugins --out outputs/takeover.json

# 新技能直接装入 Hub，不需要先装到某个 Agent
rtk pnpm hub install ./my-skill
rtk pnpm hub install owner/repo --skill skill-name --ref main
# 核对预览后：
rtk pnpm hub install owner/repo --skill skill-name --ref main --apply --yes

# 列出来源和本地状态；只更新已绑定来源的技能
rtk pnpm hub list
# 逐项只读检查上游；本地修改不遮住上游结果，失败项保留诊断
rtk pnpm hub check-updates --json
rtk pnpm hub check-updates skill-name --json
rtk pnpm hub update skill-name --json
# 核对 changes、版本和 planToken，将占位值换为本次预览的完整指纹
rtk pnpm hub update skill-name --plan-token 'sha256:PREVIEW_HASH' --apply --yes

# 已导入的技能，与上游内容完全相同时可绑定更新来源
rtk pnpm hub adopt owner/repo --skill skill-name
rtk pnpm hub adopt owner/repo --skill skill-name --apply --yes
```

`install/update/adopt` 默认 dry-run，`--apply --yes` 才写 Hub；update 写入还要求本次预览的 `--plan-token`。GitHub 下载暂存在系统临时目录；它不执行 Skill 内的任何安装脚本。`--ref` 可指定要跟踪的分支/标签或 Git 版本，锁保存解析到的 commit；实际支持情况以 CLI/API 文档为准。本地目录安装则记录来源目录；该来源丢失时更新会失败，Hub 内已安装内容仍保留。

`check-updates` 与 `list` 会在单个坏条目/来源失败时保留其他条目的结果，整体 `complete=false` 并以退出码 3 结束。先看 `issues/errors`，不能把部分报告当完整清单。检查只覆盖来源锁，不会自动补造未受管 Skill 的上游。GitHub 检查会联网，但不修改 Hub/Agent；同仓库/ref 在单次调用内共享临时快照，未持久缓存。`check-updates` 不接受 `--apply`/`--yes`。

`localStatus` 与 `upstreamStatus` 是独立观察：本地可以是 modified，同时上游是 changed；`updateAvailable` 只比较已安装来源锁基线和上游完整树。上游查询失败时为 unknown/null；本地不为 clean 或上游未知时 `applyBlocked=true`。`currentRevision` 指锁中已安装 Git commit，不能用它标记本地自定义内容；仓库提交移动但 Skill 内容未变时也可能没有更新。check-updates 结果只是观察，不能用于应用；实际 update 的预览会生成单独的版本绑定计划。

### 更新确认计划

`update` 预览的 `changes[]` 给出文件/目录增删改、内容摘要和执行位变化，不保存正文；报告仍含私有文件名、路径和描述，应留在本地。应用时重复相同的名称选择并带 planToken、apply、yes；省略名称的预览与应用都表示当时所有锁项。缺 token 会报 E_CONFIG；上游、本地、选中来源锁、目标集或位置改变时，旧 token 会报 E_CONFLICT，应重新预览而不是强制覆盖。

仓库 commit 变化但 Skill 内容未变时，Diff 可以为空，但 `sourceLockChanged=true`，旧计划仍失效。token 不代表执行授权、不防同用户主动篡改、不冻结在线上游包；没有时间到期规则，仅内容/版本/位置一致时有效。install/adopt/rollback 不使用此 token，既有确认与备份规则不变。接口迁移见 [ADR 0011](../adr/0011-managed-update-plan-binding.md)。

## 来源锁迁移与固定 Git 版本

`managed-lock.json` v1 是受管 Skill 更新来源的权威记录，不要从旧 `catalog.json` 手工拼造。锁字段含义如下：

| 字段 | 含义 | 迁移注意 |
|------|------|----------|
| `type` | `local` 或 `github` | 由 install/adopt 解析来源确定 |
| `path` / `url` | 本地绝对来源目录 / 规范化后的 GitHub HTTPS 仓库 | 本地绝对路径只适用于能访问该路径的机器；不适合作为团队共享位置 |
| `ref` | install/adopt 时选择的分支、标签、commit 或默认 `HEAD` | `HEAD` 是可移动引用；要固定 Git 版本请给 commit SHA |
| `commit` | checkout 后解析得到的完整 commit object ID | GitHub 来源必有；它比 ref 名更适合审计实际内容 |
| `subpath` | 来源仓库/目录内 Skill 目录相对路径 | 单 Skill 根目录为 `.` |
| `treeHash` | 整个 Skill 树的 `sha256:` 指纹 | 包含文件内容、相对路径、空目录与执行位；忽略 `.git` 和时间戳 |

每次 managed `update` 会在备份批次根目录另写 `managed-rollback.json`，保存该批次每个旧 Skill 的来源锁快照；它在 Skill 目录之外，不计入 Skill treeHash。批次由当前用户状态目录权限保护；sidecar/treeHash 用于发现错配和意外改动，不是抵抗同一用户主动篡改的签名或防篡改证明。早期没有 sidecar 的备份不能用于新 rollback 命令。

将 GitHub 来源固定到一个已选定的 commit，先预览并核对 JSON 中的 `skills[].provenance.revision` 与 `items[].sourceTreeHash`：

```bash
rtk pnpm hub install anthropics/skills --skill pdf --ref COMMIT_SHA --json
```

确认 revision 与所选 SHA 一致、来源树 hash 符合预期后，才对同一参数显式 apply：

```bash
rtk pnpm hub install anthropics/skills --skill pdf --ref COMMIT_SHA --apply --yes
```

受管锁会同时保存输入 `ref`、解析后的完整 `commit`、仓库 `url`、`subpath` 和 `treeHash`。后续 `update` 使用锁中的来源/ref；更新命令拒绝 `--ref`，要切换跟踪来源/ref可先预览下述同内容migrate-source；不同内容版本不能混入迁移，不得手改锁文件。`list` 核对当前树是 `present`；要核对确切 commit，请查看 CLI 输出中的 revision 或命令返回的实际 lock path 所指文件。

### 来源目录移动或跟踪位置改变

`check-updates` 的上游错误会保留来源路径和 `hint`。先核对错误：网络/认证失败不等于来源已删除。已确认新来源时，使用单项显式迁移：

```bash
rtk pnpm hub migrate-source skill-name --source ./new-source --json
# 核对 previousSource、nextSource、sourceLockChanged 和完整 planToken
rtk pnpm hub migrate-source skill-name --source ./new-source --plan-token 'sha256:PREVIEW_HASH' --apply --yes --json
# GitHub 同样支持显式 --ref，须指向与已安装 Skill 完整内容相同的版本
rtk pnpm hub migrate-source skill-name --source owner/repo --ref COMMIT_SHA --json
```

旧来源不必可访问；当前 canonical 与新来源都必须等于旧锁 treeHash，包含执行位和空目录。新来源不能指向 canonical/state 内部或包含这两个目录。本地自定义修改、改名、内容升级和 overlayOf 改写不在迁移范围内；不同内容会被拒绝，不能通过迁移把改动当干净基线。可先选取同内容的 Git 版本完成来源绑定，再独立预览 update。

迁移 token 与 update token 分开，绑定旧/新来源锁、当前树和 Hub 真实位置；应用重新获取新来源并复验，不缓存可离线应用的包。写入前备份当前 Skill 与旧锁，返回 `items[].backupPath`，可用下文 rollback 恢复来源关系。迁移不会替换 canonical 目录；同来源同版本为 noop。回滚到失效旧来源只恢复锁，不修复外部目录。错误报告含私有路径，应留本地。

把旧目录接入来源锁时，使用 `adopt` dry-run；它只在现有 canonical 树、来源树及其完整 `treeHash` 完全一致时绑定来源。旧 catalog 的 `hash` 只对应 SKILL.md 元数据指纹，不足以重建完整目录锁；无法确认上游或内容不一致时应保留为 unmanaged，不能伪造来源。

## Fork 与 overlay 关系

先把 base Skill 的完整目录复制到一个可持久保存的位置，使用新的目录名，并把 `SKILL.md` frontmatter 的 `name` 同步改成该 kebab-case 名称。Agent Skills 规范要求 Skill 名与父目录名一致，见[官方规范](https://agentskills.io/specification)。不要在原目录里直接改名或覆盖 base。

如果 fork 的 base 已存在于当前 Hub catalog 且路径可读，可在 install/adopt 预览中附加 `--overlay-of <base-name>`：

```bash
rtk pnpm hub install ./project-forks/guide-custom --overlay-of guide-base --json
rtk pnpm hub install ./project-forks/guide-custom --overlay-of guide-base --apply --yes
```

此流程要求来源只选中一个 Skill；同名 fork、自引用、缺失/不可读 base 和未解决的完整目录冲突都会拒绝。来源锁保存 `overlayOf`、来源信息和完整 `treeHash`；后续 update/rollback 保留关系。`overlayOf` 是按名称的 provenance 引用：它不合并 base/fork 文件、不创建运行时继承，也不改变 router 的同名冲突胜出规则。base 后续被重命名或移除时不会自动改写 fork；当前没有 dangling-base 扫描或改变既有 fork base 的专用命令，须由维护者更新来源关系并重新 install/adopt。

本地 fork source 路径必须稳定。移动目录后，受管 update 会因锁定路径失效而停止；应保留当前 canonical 并按明确来源迁移流程处理，不能手改 lock。若 fork 要由团队共享，建议放在可访问的 GitHub fork 中，以完整 commit SHA install，再通过 `--overlay-of` 记录 base 名称。

managed overlay/fork 与配置 `sources[].overlay_of` 是两种入口。后者配合 `ingest --no-materialize` 仅把外部目录登记到 catalog，catalog 路径直接指向该目录；移动目录后需更新 source path 并重新 ingest 和 `index --rebuild`。它同样只是关系元数据，不做自动合并。`ingest` 不会从 catalog 删除旧条目，因此禁用或移除 source 不等于清除已登记的 Skill。

回滚单个 managed Skill 时，使用之前 `update`、`migrate-source` 或 `rollback` JSON 结果中的精确 `items[].backupPath`：

```bash
rtk pnpm hub update skill-name --json
# 将 PREVIEW_HASH 替换为上述预览返回的完整指纹
rtk pnpm hub update skill-name --plan-token 'sha256:PREVIEW_HASH' --apply --yes --json
# 将 BACKUP_PATH 替换为 update 返回的 items[].backupPath
BACKUP_PATH=/actual/backup/batch/skill-name
rtk pnpm hub rollback skill-name --from "$BACKUP_PATH"
# 检查预览的目标名称、当前树 hash、来源树 hash 与锁快照
rtk pnpm hub rollback skill-name --from "$BACKUP_PATH" --apply --yes
```

命令默认 dry-run；apply 前重新读取来源锁和 canonical。canonical 必须仍与当前锁匹配，回滚树、快照锁 treeHash 必须一致，备份路径必须是 state backups 下指定批次的直接子目录；任何失败都拒绝写入。一次只回滚一个 Skill。每次成功回滚还会备份当前版本并返回新的 `backupPath`，可用它执行反向回滚。该操作不读取实时上游、不联网、不执行 Skill 内容。canonical/source-lock 事务提交后若 catalog/index 刷新失败，按 API §7 通过 `list` 检查并用 `index --rebuild` 恢复，不要把 CLI 错误理解成文件事务已自动撤销。

`--overlay-of` 记录的是可读来源关系，不是自动 overlay/merge 引擎。不要通过手改 `managed-lock.json`、直接覆盖 canonical 目录或把 `sync restore` 当成 overlay/fork/managed 历史回滚来模拟未支持的操作。

更新先检查整个已安装目录：正文、scripts、references、assets、空目录、执行位。发现本地修改会阻止覆盖。需要保留自定义版本时，直接维护 canonical，或另建明确命名的本地副本，不用强制更新抹掉修改。

## 分发给 Agent

```bash
rtk pnpm hub sync --dry-run --agents codex,agents,cursor
rtk pnpm hub backup --dry-run
# 核对备份范围后建立本次备份（输出实际 backupDir）
rtk pnpm hub backup
# 把真实输出的 backupDir 填到下条命令
rtk pnpm hub sync --apply --yes --allow-write --backup-dir /actual/backupDir --agents codex,agents,cursor --create-only
rtk pnpm hub verify
```

默认 symlink：以后 Hub 目录内更新直接被已连接的 Agent 读取。新增 skill 需要再 sync 创建投影。copy 模式更新内容需要预览并备份后 `--replace-real`，不能把 copy 当作自动更新的 symlink。

`--create-only` 只创建缺失项；已有独立安装不会被覆盖。要将真实目录换为 Hub 投影，先检查 `takeover` 的完整目录冲突，再使用 `sync --dry-run --replace-real`。真实替换使用最新 backupDir 并带 `--replace-real`，旧目录保存在 backupDir/replaced-real。不要把新一轮替换继续写入旧 stash。

## 接管现有库

1. 运行 takeover，保留报告。`ready` 表示同名内容一致且已有 Hub 版本；`import` 表示 Hub 缺失且已扫描来源一致；`conflict` 需要选择版本；`blocked` 表示目录不能安全读取/复制。
2. 对 `import` 项用 `ingest --sources /精确/skill/path --dry-run` 检查，然后去掉 dry-run 导入。来源缺少上游线索时保持本地来源，不伪造 Git 更新地址。
3. 同名不同版本使用报告内精确路径决定 `--prefer /source/path`。`--conflict report` 会阻断未解决冲突批次；`--conflict skip` 跳过冲突并返回待处理状态。Hub 已存在不同内容仍会保留原件，显式 `--force` 才归档后替换。
4. 最新备份 → sync dry-run → Owner 确认实际目标和版本 → apply → verify。只依据文件内容进行验证不能证明某宿主已经刷新技能列表；必要时重启宿主会话并做一条实际任务检查。

`SKILL_HUB_HOME` 控制 catalog/history/managed-lock 状态根，`--config` 的 canonical_dir/index_dir/backup_dir 控制数据路径。沙箱验收必须同时隔离状态根与 Agent 映射，不能只改 canonical_dir 后误用真实 Agent 默认路径。

## 范围

插件缓存与 `.codex/skills/.system` 仅列为 external。插件的 MCP、工具、权限和运行时继续由插件管理器负责。额外 Agent、项目 skills 目录可写入配置的 agents/sources；takeover 不会递归扫描整个 Home，未配置的项目目录不在“已盘点”统计里。

在原生 Agent skills 目录保留 symlink 是兼容发现方式，不是重复安装维护。所有 symlink 都被 Agent 原生枚举时，上下文描述仍可能很多；既有 MCP search/fetch 只有被宿主接入并实际调用时，才提供按需加载效果。

## 恢复

- managed 更新原版本归档到状态目录 backups 的唯一批次，执行失败会尝试恢复目录和锁。具体路径以命令输出为准。
- catalog/index 刷新失败会报错；先检查 `list` 和 `path`，再使用 `index --rebuild` 重建。不要在报错后直接认为全部更新已成功。
- sync 替换前保留完整旧目录；恢复流程使用既有 [OPERATIONS_AND_RISKS](./OPERATIONS_AND_RISKS.md)。只使用真实生成的 manifest，不手写备份记录。
- 本轮没有增加卸载、后台自动更新或跨进程全局事务；管理命令串行执行。


2026-09-05 本机特别前置：home-computer-coordination 内存在自引用链接，Cursor 有两条坏链，会阻碍解引用式完整备份。须按接管报告里的精确路径确认归档链接、保存 rawTarget 后再完整备份；不要跳过备份或把失败 manifest 当成功。


## 当前默认：Hub MCP 按需读取（2026-09-05）

用户已明确选择 Agent 不安装单个 Skill。上述 sync 迁移步骤仅作为兼容模式参考，不再是安装后的必经步骤。使用 `pnpm hub install ...` 更新 Hub 后直接通过 MCP 加载；OpenCode 从 `pnpm opencode` 专用入口启动，见 [OPENCODE_HUB](OPENCODE_HUB.md)。既有冲突目录不自动合并或移除。
