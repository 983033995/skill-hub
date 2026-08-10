# 接口约定 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1（设计约，实现跟随后标 Status） |
| 最后更新 | 2026-08-10 |
| 对齐 | `ARCHITECTURE.md` · `HARNESS.md` |

> 约定：所有面向自动化的命令支持 `--json`。  
> 退出码：`0` 成功；`1` 一般错误；`2` 冲突/需人工；`3` 配置/环境错误。

---

## 1. CLI 接口

全局：

```text
skill-hub [--json] [--config <path>] [--verbose] <command> [options]
```

### 1.1 `doctor`

**用途**：环境与路径自检。

```bash
skill-hub doctor
```

**JSON 结果示例**：

```json
{
  "ok": true,
  "node": "v22.22.2",
  "canonical": { "path": "/Users/x/.skill-hub", "exists": true },
  "agents": [
    { "id": "workbuddy", "path": "/Users/x/.workbuddy/skills", "exists": true, "count": 76 }
  ],
  "issues": []
}
```

**实现状态**：Planned（Phase 1）

---

### 1.2 `inventory`

```bash
skill-hub inventory [--agents workbuddy,cursor] [--out ./matrix.md]
```

**输出字段**：

| 字段 | 说明 |
|------|------|
| `agents[].count` | 各端 skill 数 |
| `union_count` | 去重总数 |
| `overlaps` | 两两交集 |
| `only` | 仅单端 |
| `conflicts` | 同名不同 hash |

**实现状态**：Planned

---

### 1.3 `backup`

```bash
skill-hub backup [--out ~/.skill-hub/backups/<ts>]
```

**结果**：`manifest.json` + 目录副本/归档。

**实现状态**：Planned

---

### 1.4 `init`

```bash
skill-hub init [--force]
```

创建 `~/.skill-hub` 骨架与默认 `config.yaml`（不覆盖已有配置，除非 `--force`）。

**实现状态**：Planned

---

### 1.5 `ingest`

```bash
skill-hub ingest --sources <dir>[,<dir>...] \
  [--prefer workbuddy] \
  [--conflict report|skip] \
  [--dry-run]
```

**行为**：

1. 扫描 sources  
2. 规范化 name  
3. 写入 canonical（或 dry-run）  
4. 产出 conflict 列表  

**实现状态**：Planned

---

### 1.6 `index`

```bash
skill-hub index [--rebuild]
```

从 catalog 构建 router 索引。

**实现状态**：Planned

---

### 1.7 `route`

```bash
skill-hub route "<query>" [--top-k 5] [--profile coding] [--include-body]
```

**JSON 结果**：

```json
{
  "query": "merge pdf files",
  "top_k": 5,
  "engine": "bm25",
  "results": [
    {
      "name": "pdf",
      "score": 12.4,
      "description": "...",
      "path": "/Users/x/.skill-hub/skills/pdf",
      "reasons": ["name_token:pdf", "desc_hit:merge"]
    }
  ]
}
```

**实现状态**：Planned

---

### 1.8 `sync`

```bash
skill-hub sync --dry-run
skill-hub sync --apply [--require-backup]
```

**计划项类型**：`create_symlink` | `update_symlink` | `conflict` | `noop` | `remove_orphan`(默认关)

**实现状态**：Planned

---

### 1.9 `verify`

```bash
skill-hub verify
```

检查坏链与错误指向。

**实现状态**：Planned

---

## 2. 库 API（TypeScript，设计约）

```ts
// @skill-hub/core
export interface SkillMeta {
  name: string
  description: string
  path: string
  hash: string
  mtimeMs: number
  keywords?: string[]
}

export function scanSkills(root: string): Promise<SkillMeta[]>
export function parseSkillMd(filePath: string): Promise<SkillMeta>
export function detectConflicts(skills: SkillMeta[]): Conflict[]

// @skill-hub/router
export interface RouteQuery {
  text: string
  topK?: number
  profile?: string
}
export interface RankedSkill extends SkillMeta {
  score: number
  reasons: string[]
}
export interface RouterEngine {
  build(skills: SkillMeta[]): Promise<void>
  query(q: RouteQuery): Promise<RankedSkill[]>
}

// @skill-hub/sync
export interface SyncPlanItem {
  agentId: string
  skillName: string
  action: 'create_symlink' | 'update_symlink' | 'conflict' | 'noop'
  target: string
  source: string
  detail?: string
}
export function planSync(config: HubConfig): Promise<SyncPlanItem[]>
export function applySync(plan: SyncPlanItem[], opts: { dryRun: boolean }): Promise<ApplyResult>
```

**稳定性**：v0.x 允许破坏性调整；1.0 起走 semver。

---

## 3. MCP 接口（Phase 1 末 / Phase 2）

传输：stdio MCP。

| Tool | 参数 | 返回 |
|------|------|------|
| `skill_search` | `query: string`, `top_k?: number`, `profile?: string` | `RankedSkill[]` |
| `skill_fetch` | `name: string`, `revision?: string` | `SKILL.md` 正文 + meta |
| `skill_stats` | — | catalog 计数、索引时间 |
| `skill_inventory` | `agent?: string` | 摘要矩阵 |

**安全**：MCP 默认只读；不提供 `sync --apply` 除非配置 `allow_write=true`。

---

## 4. 配置文件 schema（摘要）

路径：`~/.skill-hub/config.yaml`

```yaml
version: 1
canonical_dir: ~/.skill-hub/skills
index_dir: ~/.skill-hub/index
backup_dir: ~/.skill-hub/backups
agents:
  - id: workbuddy
    skills_dir: ~/.workbuddy/skills
    enabled: true
router:
  top_k: 5
  engine: bm25
sync:
  mode: symlink
  conflict: report
  require_backup: true
privacy:
  telemetry: false
```

完整字段以 `configs/` 模板与后续 JSON Schema 为准。

---

## 5. 错误码（`SkillHubError.code`）

| Code | 含义 | 建议退出码 |
|------|------|------------|
| `E_CONFIG` | 配置无效 | 3 |
| `E_PATH` | 路径不存在/无权限 | 3 |
| `E_PARSE` | SKILL.md 解析失败 | 1 |
| `E_CONFLICT` | 同名冲突需人工 | 2 |
| `E_INDEX` | 索引缺失/损坏 | 1 |
| `E_SYNC` | 分发失败 | 1 |
| `E_BACKUP` | 备份失败 | 1 |
| `E_NOT_FOUND` | skill 不存在 | 1 |

---

## 6. 版本与兼容

| 接口层 | 兼容策略 |
|--------|----------|
| CLI 参数 | 弃用先警告一个次版本 |
| JSON 字段 | 只增不改名；删字段走 MAJOR |
| MCP tools | 增工具 MINOR；改语义 MAJOR |

---

## 7. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 设计约首版 |
