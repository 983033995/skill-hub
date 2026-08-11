# 接口约定 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1（实现已跟进 Phase 1–3） |
| 最后更新 | 2026-08-10（Phase 3 MCP） |
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

**实现状态**：Done（Phase 1）

---

### 1.2 `inventory`

```bash
skill-hub inventory [--agents workbuddy,cursor] [--out ./matrix.md]
```

**实现状态**：Done（Phase 1）

---

### 1.3 `backup`

```bash
skill-hub backup [--out ~/.skill-hub/backups/<ts>]
```

**实现状态**：Done（Phase 2）

---

### 1.4 `init`

```bash
skill-hub init [--force]
```

**实现状态**：Done（Phase 1）

---

### 1.5 `ingest`

```bash
skill-hub ingest --sources <dir>[,<dir>...] \
  [--prefer <dir>] \
  [--conflict report|skip] \
  [--dry-run] \
  [--no-materialize]
```

**行为**：扫描 →（默认）物化到 `~/.skill-hub/skills` → 写 catalog。  
**实现状态**：Done（Phase 1 catalog + 验收期 materialize）

---

### 1.6 `index`

```bash
skill-hub index [--rebuild]
```

**实现状态**：Done（Phase 1）

---

### 1.7 `route`

```bash
skill-hub route "<query>" [--top-k 5] [--profile coding|video] [--engine bm25] [--profiles-dir <dir>]
```

**JSON 结果**含：`engine`、`profile`、`profile_matched`、`candidate_count`、`results[]`。

**实现状态**：Done（Phase 1 BM25 + Phase 3 profile/engine）

---

### 1.8 `sync`

```bash
skill-hub sync --dry-run [--agents workbuddy] [--create-only]
skill-hub sync --apply --yes --allow-write --backup-dir <dir> [--agents ...] [--create-only]
```

**实现状态**：Done（Phase 2 + P2-08 create-only）

---

### 1.9 `verify` / `restore`

```bash
skill-hub verify
skill-hub restore --from <backup> --dry-run
skill-hub restore --from <backup> --apply --yes   # 需明确授权
```

**实现状态**：Done（Phase 2）

---

## 2. 库 API（TypeScript）

### `@skill-hub/router`（Phase 3 扩展）

```ts
// 检索
skillSearch({ query, topK?, profile?, engine? })
skillFetch({ name, maxChars? })
skillStats()
skillInventorySummary({ agent? })

// 引擎
createRouterEngine({ engine })
routeWithProfile({ text, skills, topK?, profile? })
filterByProfile / loadProfile / parseProfileYaml
createExternalRouter // stdin/stdout 协议 + 降级 bm25
```

---

## 3. MCP 接口（Phase 3）

传输：**stdio MCP**。入口：`apps/mcp-server/dist/index.js`。

| Tool | 参数 | 返回 |
|------|------|------|
| `skill_search` | `query: string`, `top_k?: number`, `profile?: string` | Top-K 元数据 |
| `skill_fetch` | `name: string`, `max_chars?: number` | SKILL.md 正文 + meta |
| `skill_stats` | — | catalog 计数、索引时间 |
| `skill_inventory` | `agent?: string` | 摘要矩阵 |

**安全**：MCP **只读**；不提供 `sync --apply` / `restore --apply`。

集成步骤：`docs/ops/MCP_INTEGRATION.md`。

**实现状态**：Done（P3-01）

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
  engine: bm25   # bm25 | hybrid | external-*
sync:
  mode: symlink
  conflict: report
  require_backup: true
privacy:
  telemetry: false
```

Profile 模板：`configs/profiles/*.yaml`。

外部引擎：

- `SKILL_HUB_EXTERNAL_ENGINE_CMD`
- `SKILL_HUB_EXTERNAL_ENGINE_ARGS`
- `SKILL_HUB_PROFILES_DIR`

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
| `E_INTERNAL` | 未分类内部错误 | 1 |

---

## 6. 版本与兼容

v0.x 允许破坏性调整；1.0 起走 semver。MCP 增工具 MINOR；改语义 MAJOR。
