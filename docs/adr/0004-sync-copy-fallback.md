# ADR 0004: Sync copy fallback

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-08-16 |
| 决策者 | script / agent |

## 背景

部分 Agent、权限环境或跨设备场景不适合依赖 symlink。仓库原先已经声明 `sync.mode: copy`，但实现仍只创建 symlink，导致配置契约和实际行为不一致。

## 决策

1. `symlink` 仍是默认模式，保持 Canonical Store 的低重复成本。
2. `copy` 作为显式 fallback，目标不存在时复制整个 Skill 目录。
3. copy 模式不会静默覆盖已有实体目录；`SKILL.md` hash 不一致时报告 conflict。
4. 只有显式 `replace-real` 且已有 backup/写入闸门通过时，才 stash 原目录并重新复制。
5. verify 按模式检查：symlink 比较 realpath，copy 比较实体目录与 `SKILL.md` hash。

## 后果

- copy 模式兼容性更好，但会产生端侧副本，canonical 更新后需要再次 sync。
- 当前一致性 hash 只覆盖 `SKILL.md`；references/scripts 的完整目录 hash 由后续 provenance/内容版本任务处理。
- 不改变既有 symlink apply 的默认行为，也不授权生产目录自动写入。

