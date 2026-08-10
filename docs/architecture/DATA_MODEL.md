# 数据模型 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |

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

### 1.2 Conflict

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 冲突 skill 名 |
| variants | { path, hash, agentId? }[] | 多份不同内容 |

### 1.3 Catalog

`catalog.json`：

```json
{
  "version": 1,
  "updatedAt": "2026-08-10T00:00:00+08:00",
  "skills": {
    "pdf": { "name": "pdf", "description": "...", "path": "...", "hash": "sha256:..." }
  }
}
```

### 1.4 IndexMeta

```json
{
  "engine": "bm25",
  "builtAt": "...",
  "skillCount": 108,
  "catalogHash": "..."
}
```

### 1.5 BackupManifest

```json
{
  "createdAt": "...",
  "agents": [{ "id": "workbuddy", "path": "...", "fileCount": 120 }],
  "canonical": { "path": "...", "fileCount": 100 },
  "notes": "pre-sync"
}
```

### 1.6 SyncPlanItem

见 `API.md`。

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
