# ADR 0011 — Managed update 的差异预览与版本绑定

状态：Accepted  
日期：2026-10-25  
范围：P21-03；受管 Skill 的 update，不扩展安装、来源迁移或 Web 写接口。

## 背景

现有 update 的 dry-run 和 apply 会分别解析来源 ref。移动分支在两次调用间变化时，事务本身仍可安全完成，但应用的版本可能不是用户预览过的版本。完整树哈希、staging 校验和目录替换前重验已有实现，应继续复用。

## 决定

- update 默认预览返回文件级变化（含目录、内容摘要和执行位，不含正文）和 `planToken`。
- token 使用版本化 SHA-256 指纹，绑定 canonical/state 的真实位置、排序后的目标名、各目标旧来源锁、实际当前树、目标来源锁（含确切 Git commit 与 treeHash）、目标路径和操作类型。未选中的 Skill 不参与指纹。
- update 写入在 core 和 CLI 都要求调用者提供预览得到的 `planToken`；CLI 同时仍要求 `--apply --yes`。缺失/格式错误报 E_CONFIG，当前重建计划不匹配报 E_CONFLICT。
- apply 在现有 state lock 内重新构建计划并校验 token，再走已有 staging、备份、替换前重验与失败恢复。来源/本地在计划生成期间变化时拒绝生成看似一致的 Diff。
- hashSkillTree 的字节语义保持不变；通过同一遍历器可选收集相对路径、文件内容摘要和执行位供 Diff 使用，避免另写一套弱化校验的扫描器。
- token 不是签名、秘密、权限或持久快照；它不防同一用户主动篡改，也不代替 apply/yes。无固定有效期，只有当前选定内容、来源版本和位置仍完全一致时才可使用。无需存储 token 文件或新增服务。

## 兼容与限制

这是尚未发布的 v0.x 写接口安全收紧：旧 `update --apply --yes` 和 core `dryRun=false` 调用需要先预览并传入 token。install/adopt/rollback 的既有确认与恢复规则不变；check-updates 仍是非原子的只读观察，不生成可应用的计划。

Git 仓库 commit 变化但 Skill 树不变仍会使旧计划失效；新预览可显示空 Diff。来源当前不可访问时不能应用旧 token，本切片不离线缓存上游包。现有目录/来源锁事务与 CLI 随后的 catalog/history/index 刷新仍不是跨包原子事务。

state lock 是协作式锁；另在备份前及提交来源锁前复验锁语义，检测到非协作修改则拒绝覆盖并保留外部锁内容。它不抵抗同一用户主动并发篡改。现有自动恢复针对捕获到的运行时失败，不承诺进程崩溃/断电后的自动恢复；这种情况保留备份并按运维流程人工检查，不在本切片增加事务日志服务。overlayOf 仍仅是 provenance，不引入 base/fork 依赖执行顺序。

## 验收

合成沙箱覆盖内容/执行位/空目录 Diff，稳定 token、选择范围/位置/来源锁绑定，本地或上游漂移拒绝，无 token 拒绝，精确 Git commit 绑定（含树相同的 commit 漂移），成功应用及已有备份回滚。真实 Skill 不执行升级。
