# 技术架构 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |
| 对齐 | `HARNESS.md` · `PRD.md` |

---

## 1. 架构总览

skill-hub 采用 **本地优先、单机可运行** 的分层架构：

```text
┌─────────────────────────────────────────────────────────┐
│  Agents: WorkBuddy / Claude Code / Codex / Cursor ...   │
└───────────────────────────┬─────────────────────────────┘
                            │ discover skills dir / MCP / hooks
┌───────────────────────────▼─────────────────────────────┐
│  apps/cli  ·  apps/mcp-server                           │
│  (人机入口 · Agent 入口)                                  │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ packages/    │   │ packages/    │   │ packages/    │
│ core         │   │ router       │   │ sync         │
│ 解析·清单·   │   │ 索引·打分·   │   │ 备份·分发·  │
│ 冲突模型     │   │ Top-K·fetch  │   │ 校验·回滚   │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       └──────────────────┼──────────────────┘
                          ▼
                 packages/shared
                 (types·errors·log·fs)
                          │
                          ▼
        ~/.skill-hub/  (运行时数据平面，不在 git 镜像全文)
        ├── skills/          canonical
        ├── index/           router artifacts
        ├── backups/
        ├── config.yaml
        └── catalog.json
```

---

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| 单一真源 | 正文只在 Canonical Store |
| 运行时瘦身 | 默认只传递元数据与 Top-K |
| 可插拔路由 | `engine: bm25 | hybrid | external-*` |
| 安全默认 | dry-run、backup、冲突显式化 |
| 模块边界清晰 | core 无 MCP；router 无 symlink 逻辑 |
| 可测试 | IO 与纯函数分离 |

---

## 3. 模块职责

### 3.1 `@skill-hub/core`

- 扫描目录树，定位 `SKILL.md`
- 解析 YAML frontmatter 与基础校验
- Skill 实体规范化（name、path、hash、mtime）
- 冲突检测（同名不同 hash）
- Catalog 读写（`catalog.json`）

**不负责**：打分排序、创建 symlink。

### 3.2 `@skill-hub/router`

- 从 catalog 构建索引（默认 BM25）
- `query → RankedSkill[]`
- 可选：第二阶段信号融合（RRF 预留）
- `fetch(skillId)` 读正文（显式）
- 索引版本与失效检测

**不负责**：修改各 Agent 目录。

### 3.3 `@skill-hub/sync`

- 读取 agent 映射配置
- backup 打包
- dry-run 变更计划
- apply：创建/更新 symlink
- verify：死链、错误指向
- 回滚辅助（基于 backup 清单）

**不负责**：路由打分。

### 3.4 `@skill-hub/shared`

- 统一错误码
- 路径展开（`~`）
- logger
- 结果 JSON schema 辅助类型

### 3.5 `apps/cli`

- 参数解析、子命令装配
- 将核心库能力暴露为命令
- 人类可读表格 + `--json`

### 3.6 `apps/mcp-server`

- 以 MCP Tools 暴露 `skill_search` / `skill_fetch` / `skill_stats` 等
- stdio 传输（默认）

---

## 4. 关键数据流

### 4.1 Ingest → Index

```text
sources[] → core.scan → core.parse → conflict report
         → write canonical (copy or link-in strategy)
         → catalog update → router.buildIndex
```

### 4.2 Route

```text
query → load index → score → top_k → RankedSkill(metadata only)
 optional: fetch body by id
```

### 4.3 Sync

```text
config.agents → compare target vs canonical
 → Plan{create, update, conflict, noop}
 → dry-run print | apply symlink → verify
```

---

## 5. 存储布局（运行时）

```text
~/.skill-hub/
├── config.yaml
├── skills/                 # canonical skill dirs
│   └── <skill-name>/
│       ├── SKILL.md
│       ├── references/     # optional
│       └── scripts/        # optional
├── index/
│   └── v1/                 # 引擎/版本化
│       ├── meta.json
│       └── bm25.json       # 示例
├── backups/
│   └── 20260810-120000/
│       ├── manifest.json
│       └── ...
└── catalog.json            # 规范化清单
```

仓库内 `configs/` 仅提供**默认模板**，不存储用户隐私 skill 正文。

---

## 6. 与外部系统集成

| 系统 | 集成方式 | 阶段 |
|------|----------|------|
| WorkBuddy | skills 目录 symlink | M2 |
| Claude Code | `~/.claude/skills` + 可选 hooks | M2/M3 |
| Codex | `~/.codex/skills` / `~/.agents/skills` | M2 |
| Cursor | `~/.cursor/skills` + rules 文档 | M2/M3 |
| ASF | external engine 或参考实现 | M3 可选 |
| neuro-skill | external engine / MCP 并存 | M3 可选 |

---

## 7. 安全架构

| 威胁 | 控制 |
|------|------|
| 误删用户 skill | 禁止递归删；仅替换为 symlink 且先 backup |
| 路径穿越 | 规范化 + root jail 在 hub 与 agent dir |
| 恶意 skill 脚本 | hub 不自动执行 skill scripts；仅管理文件 |
| 供应链 | 索引本地；无默认遥测 |
| 并发写 | catalog 写用临时文件 + rename |

---

## 8. 扩展点

1. **RouterEngine 接口**：可替换 BM25  
2. **SyncAdapter**：symlink / copy / hardlink（平台相关）  
3. **ProfileProvider**：候选池过滤  
4. **Reporter**：markdown/json 输出  

---

## 9. 技术决策索引

| 决策 | ADR |
|------|-----|
| Canonical + symlink 而非全量复制 | `docs/adr/0001-canonical-store-and-symlink.md` |
| TS monorepo 作为实现基线 | `docs/adr/0002-typescript-monorepo.md` |
| 内建 BM25 优先，外部引擎可插拔 | `docs/adr/0003-pluggable-router-engine.md` |

---

## 10. 非目标架构

- 不做中心云服务  
- 不做多租户 ACL  
- v1 不做分布式锁集群  

---

## 11. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版架构，支撑 Phase 1 开发 |
