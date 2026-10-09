# 数据模型 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-16 |

---

## 1. 核心实体

### 1.1 SkillMeta

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 唯一逻辑名（小写连字符） |
| description | string | 路由关键字段 |
| path | string | canonical 绝对路径 |
| hash | string | 内容哈希（SKILL.md + 可选锁定文件集） |
| mtimeMs | number | 源文件 mtime |
| keywords | string[]? | 可选关键词 |
| agentsPresent | string[]? | inventory 时出现在哪些端 |
| source | string? | 导入来源路径 |
| provenance | object? | scope/source type/source ref/revision/status/overlay 线索；旧 catalog 可缺省 |

`provenance`：

| 字段 | 类型 | 说明 |
|------|------|------|
| scope | `user\|workspace\|project`? | 生效范围；旧数据缺省按 `user` |
| sourceType | `local\|git\|registry\|generated`? | 来源类型，当前主要使用 `local` |
| sourceRef | string? | 来源路径、仓库引用或其他稳定标识 |
| revision | string? | 提交/版本线索 |
| status | `active\|draft\|deprecated`? | 生命周期状态 |
| overlayOf | string? | 覆盖/派生的基准 Skill |

### 1.2 Conflict

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 冲突 skill 名 |
| variants | { path, hash, agentId?, provenance? }[] | 多份不同内容 |
| winner | variant? | 解释性代表项 |
| winnerReason | string? | scope 优先级与确定性排序规则 |

冲突代表项默认按 `project > workspace > user` 选择；同 scope 按 `status`、`sourceRef/path`、`hash` 确定性排序。这个 winner 只用于盘点/解释，不会静默覆盖 Canonical。

### 1.3 Catalog

`catalog.json`：

```json
{
  "version": 1,
  "updatedAt": "2026-08-10T00:00:00+08:00",
  "skills": {
    "pdf": {
      "name": "pdf", "description": "...", "path": "...", "hash": "sha256:...",
      "provenance": { "scope": "user", "sourceType": "local", "sourceRef": "..." }
    }
  }
}
```

### 1.4 IndexMeta

```json
{
  "version": 1,
  "engine": "bm25",
  "builtAt": "...",
  "skillCount": 108,
  "catalogHash": "...",
  "artifact": "bm25.json",
  "artifactFormat": "skill-hub.bm25.v1"
}
```

`catalogHash` 只对规范化后的 `catalog.skills` 计算，不包含 `updatedAt`。`bm25.json` 保存 name/description/keywords 等元数据和 BM25 统计量，不保存 `SKILL.md` 正文；catalog hash 不匹配或 artifact 损坏时，route 回退内存构建并建议 `index --rebuild`。

### 1.5 SkillHistoryEntry

运行时追加到 `~/.skill-hub/history.jsonl` 的单行 JSON：

```json
{
  "at": "2026-08-16T07:30:00.000Z",
  "type": "ingest",
  "name": "pdf-merge",
  "action": "update",
  "previousHash": "sha256:old",
  "hash": "sha256:new",
  "revision": "abc123",
  "provenance": { "scope": "project", "overlayOf": "base-skill" }
}
```

history 只记录生命周期元数据，不记录 Skill 正文；支持 `ingest`、`sync`、`index`、`overlay`、`fork` 类型。

### 1.6 BackupManifest

```json
{
  "createdAt": "...",
  "agents": [{ "id": "workbuddy", "path": "...", "fileCount": 120 }],
  "canonical": { "path": "...", "fileCount": 100 },
  "notes": "pre-sync"
}
```

### 1.7 SyncPlanItem

见 `API.md`。

### 1.8 SyncAction

除 symlink 模式的 `create_symlink` / `update_symlink` / `replace_real` 外，copy 模式使用：

- `create_copy`：目标不存在，复制 canonical skill 目录；
- `update_copy`：目标是 symlink，替换为实体副本；
- `replace_real_copy`：明确启用 `replace-real` 后，先 stash 原实体路径，再复制 canonical 内容。

`SyncPlan.mode` 记录本次计划实际使用的 `symlink | copy` 模式。copy 的一致性检查当前以 `SKILL.md` hash 为准；references/scripts 的完整目录 hash 属于后续模型增强项。

---

## 2. 哈希策略（v0.1）

- 默认：对 `SKILL.md` 内容做 SHA-256  
- P1：可选纳入 `scripts/**` 与 `references/**` 的稳健子集  
- 变更 hash → catalog 脏 → 提示 reindex  

---

## 3. 名称规范化

1. trim + lower case  
2. 空格 → `-`  
3. 非法字符剔除  
4. 空名 → `E_PARSE`  

---

## 4. 一致性规则

| 规则 | 说明 |
|------|------|
| catalog ⊆ filesystem | 孤儿 catalog 项在 `verify` 报告 |
| filesystem 新目录 | `ingest`/`index --rebuild` 吸收 |
| symlink target | 必须在 `canonical_dir` 内 |

---

## 5. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 初版模型 |
