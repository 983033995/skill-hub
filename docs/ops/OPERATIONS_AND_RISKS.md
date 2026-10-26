# 运维与风险说明 — Skill Hub

状态：Active · 版本：v0.1.0 · 更新：2026-10-26

默认数据流是Hub安装/更新 → catalog/index → MCP按需读取。symlink/copy是显式兼容选项，不是首次接入的必做步骤。命令完整参数见[API](../architecture/API.md)，版本操作见[统一管理手册](UNIFIED_SKILL_MANAGEMENT.md)。

## 1. 状态与备份边界

| 对象                    | 用途                                     | 操作前检查                                            |
| ----------------------- | ---------------------------------------- | ----------------------------------------------------- |
| canonical与外部登记目录 | Skill正文/附件的声明真源                 | 用list、explain、path确定当前实例；不静默覆盖本地修改 |
| managed-lock.json       | 受管来源、commit、完整树基线             | 由managed命令维护，不手工伪造或改写                   |
| catalog/index           | 元数据及路由产物                         | 文件错误应处理，不能当作空库覆盖                      |
| managed备份批次         | 每个旧Skill完整树及managed-rollback.json | 使用返回的精确backupPath，保留原批次                  |
| sync备份manifest        | 兼容目标、canonical快照                  | 确认manifest完整、覆盖目标、路径与实际来源一致        |
| usage.jsonl             | 可选本地观测元数据                       | 不等于生命周期history，不提交Git；启用/归档见使用手册 |

生产操作先说明当前状态、写入范围、恢复点与验收方法。只读检查不构成写入授权。别用个人库运行集成测试；公共smoke仅使用合成Skill与临时目标。

## 2. 首次接入

1. 按README在新临时Hub试用；源码安装使用锁定依赖和构建。
2. 对实际Hub先运行doctor、list或inventory。inventory内置来源只供读取，不创建目录，也不证明Agent安装/MCP状态。
3. 新Skill优先install预览，明确apply/yes后写Hub。旧库选源ingest先显式--dry-run；ingest的默认行为会写入，不能将所有命令都视为默认预览。
4. 配置宿主stdio MCP。新进程/新会话验证search、read、files，另行验证原生发现及模型任务。
5. 只有需要原生目录兼容时，才按下节执行备份和sync。

init用于建立新状态根；不要在已有Hub上随意init --force。MCP配置不会自动禁用原生Skill加载器。服务读取的是进程启动时的代码/环境，磁盘构建完成不等于运行实例已更新。

## 3. 日常检查与更新

```bash
pnpm hub list --json
pnpm hub check-updates --json
pnpm hub update skill-name --json
# 核对diff、来源和计划后，替换为上一次返回的完整token：
pnpm hub update skill-name --plan-token 'sha256:PREVIEW_TOKEN' --apply --yes
```

check-updates逐项容错，失败保持unknown、complete=false与退出3；不能把部分报告当完整清单。实际update仍严格预检，任一选中目标本地修改会阻断写入。token绑定状态而不是身份或权限，状态漂移需重新预览。

不要直接编辑受管canonical后期待无冲突update。自定义版本需要明确fork/来源关系和人工合并；overlayOf只是provenance，不会合并基底文件。来源移动使用显式同内容migrate-source，不能把内容升级或本地改动包装成干净的新基线。

## 4. 回滚与故障恢复

受管单Skill回滚使用update/migrate-source/rollback返回的精确路径：

```bash
pnpm hub rollback skill-name --from /absolute/managed-backup/batch/skill-name
pnpm hub rollback skill-name --from /absolute/managed-backup/batch/skill-name --apply --yes
```

回滚要求当前树仍等于当前锁，备份与侧车来源锁匹配。无快照的旧备份、被修改的备份或本地自定义内容必须拒绝。回滚又会备份当前版本，可反向恢复；恢复旧来源锁不会恢复外部已删除的来源目录。

目录/来源锁事务失败时会尝试恢复，恢复不完整保留事务目录与备份并报错。此机制不承诺断电、进程崩溃或同用户主动并发篡改后的自动恢复。不要删除失败事务、锁或备份来让下一次命令“看起来成功”；先保存现场并人工核对。

若目录/锁已成功，但后续catalog/index失败，命令仍报错；这些步骤不是跨包原子事务。先用list核对，再按当前配置运行index --rebuild。已有catalog损坏时先恢复可信备份，不把错误文件当空库初始化。

## 5. 显式兼容分发

先确认配置agents仅指向需要改动的目标，sources不等于投影目标。用仓库支持的完整确认参数，而非裸sync --apply：

```bash
pnpm hub backup --out /absolute/backup-dir --dry-run
pnpm hub backup --out /absolute/backup-dir
pnpm hub sync --dry-run --agents agent-id
pnpm hub sync --apply --yes --allow-write --backup-dir /absolute/backup-dir --agents agent-id
pnpm hub verify
```

备份必须成功覆盖本次目标；不存在的路径、新出现的目录、未完成的manifest需要重新核对。真实目录冲突先人工决策；replace-real会先stash再投影，不能为了消除提示就覆盖原内容。copy模式检查SKILL.md和整个目录，附件漂移也会失配。

恢复兼容备份是另一条操作路径：

```bash
pnpm hub restore --from /absolute/backup-dir --dry-run
# 检查manifest和替换范围，保留独立恢复副本后：
pnpm hub restore --from /absolute/backup-dir --apply --yes
```

restore实际替换目标内容；先在沙箱验证。它不等于managed单Skill来源锁回滚，也不保证catalog/index跨包一致。

## 6. 服务与观测

Web默认127.0.0.1:4173、无鉴权，只支持读取，不应直接暴露公网。Web REST不是远端MCP。Markdown CDN不可用时降级纯文本；模型服务不是本地浏览的前置条件。

更新源码后运行pnpm build；维护者只在明确范围内重新启动对应服务/客户端。检查原URL的health/目标API及实际界面，不能用另一个预览端口代替原实例生效证据。

使用记录仅在相应进程显式配置SKILL_HUB_USAGE_LOG后写入。日志失败会告警而不破坏原读取结果，因此不是无遗漏审计账本。context-cost和Web预算是启发式文本估算；真实模型Token、缓存和费用未知。详见[使用与上下文](USAGE_AND_CONTEXT.md)。

## 7. 主要风险与处理

| 风险                    | 处理                                                    |
| ----------------------- | ------------------------------------------------------- |
| 本地修改被上游覆盖      | 完整树预检；保留版本，人工fork/合并，不改锁绕过         |
| 坏链、越界或来源失效    | 查看issues与精确路径；保留健康结果；显式同内容迁移      |
| 备份/事务不完整         | 保存现场，核对快照与hash，不复用失败manifest            |
| 路由结果不相关          | 核对元数据、scope/profile与索引；候选不是激活许可       |
| 真实Skill或日志泄露     | 本地保管，不提交catalog、usage、配置、凭据和已安装Skill |
| 可选模型调用的费用/传输 | 使用显式opt-in；不确定失败不自动重试                    |
| 目录状态误当宿主健康    | 区分目录存在、应用运行、MCP连接与真实模型任务           |
| 源码正确但旧进程仍运行  | 独立核对实际进程/URL，明确授权后reload并复验            |
