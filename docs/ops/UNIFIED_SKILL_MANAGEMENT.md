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
rtk pnpm hub update skill-name
rtk pnpm hub update skill-name --apply --yes

# 已导入的技能，与上游内容完全相同时可绑定更新来源
rtk pnpm hub adopt owner/repo --skill skill-name
rtk pnpm hub adopt owner/repo --skill skill-name --apply --yes
```

`install/update/adopt` 默认 dry-run，`--apply --yes` 才写 Hub。GitHub 下载暂存在系统临时目录；它不执行 Skill 内的任何安装脚本。`--ref` 可指定要跟踪的分支/标签或 Git 版本，锁保存解析到的 commit；实际支持情况以 CLI/API 文档为准。本地目录安装则记录来源目录；该来源丢失时更新会失败，Hub 内已安装内容仍保留。

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
