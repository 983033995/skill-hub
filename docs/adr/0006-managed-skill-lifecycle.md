# ADR 0006 — Hub 管理安装来源与完整目录版本

- 日期：2026-09-05
- 状态：Accepted
- 范围：P5 本地独立 Skill 管理

## 背景

已有 canonical、ingest、router、sync，但用户仍要先把新 Skill 安装到某个 Agent。旧 ingest 会重建 catalog，且物化/copy 比较仅使用 SKILL.md hash，遗漏 scripts/references 等变更。插件缓存中还混有依赖专用工具的 Skill。

## 决策

1. 保留 core/router/sync/CLI 边界，在 core 增加 managed 模块，CLI 提供 install/update/adopt/list。
2. 来源锁 `managed-lock.json` 保存在 Hub 状态目录，保存本地路径或 GitHub URL、ref/commit、skill 子路径、完整目录 hash；catalog 继续服务路由，不承担更新锁职责。未绑定上游的旧 Skill 不伪造 Git 来源。
3. 完整目录 hash 包含文件、相对路径、空目录、执行位；忽略 .git。内部 symlink 以目标内容计，越界与环路拒绝物化。SKILL.md 原 hash 保持兼容，用于检索元数据。
4. install/update/adopt 默认预览；写入需要显式 apply。先暂存、校验、归档原版本，再发布目录和来源锁；更新拒绝本地改动，失败恢复。
5. ingest 增量合并 catalog；同名完整内容不同时 report 阻断，skip 跳过，prefer 显式选源。canonical 替换先归档。catalog 改为临时文件 + rename。
6. takeover 只读报告，external 插件不参与独立 Skill 冲突胜出。Agent 投影仍经已有 sync 备份和写入闸门。

## 后果与边界

旧 catalog 兼容；新增锁只对绑定的 Skill 生效。新 managed 操作与旧 ingest 不组成跨进程统一事务；命令应串行运行。来源锁和目录发布后的 catalog/index 若写入失败，命令报错，可由 list + index 重建诊断恢复，不伪报成功。宿主插件能力与自动发现上下文不由 Hub 安装器替代。

迁移前需要当前完整目录报告和最新备份；之前的生产备份不能证明本轮修改已经受保护。
