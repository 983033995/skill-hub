# 技术架构 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-16 |
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
| 来源与目标分离 | `sources` 负责本地 Skill 盘点/导入；`agents` 负责投影目标 |
| 范围可解释 | user/workspace/project provenance 随 catalog 保留 |
| 运行时瘦身 | 默认只传递元数据与 Top-K |
| 可插拔路由 | `engine: bm25 | hybrid | external-*` |
| 安全默认 | dry-run、backup、冲突显式化 |
| 模块边界清晰 | core 无 MCP；router 无 symlink 逻辑 |
| 可测试 | IO 与纯函数分离 |

---

## 3. 模块职责

### 3.1 `@skill-hub/core`

- 扫描目录树，定位 `SKILL.md`；跟随目录 symlink，跳过坏链/文件链并防止 realpath 环路
- 解析 YAML frontmatter 与基础校验
- Skill 实体规范化（name、path、hash、mtime）
- Skill provenance（scope、source type/ref、revision、status、overlay）
- 冲突检测（同名不同 hash）
- 冲突代表项与胜出原因（不等于静默覆盖）
- Catalog 读写（`catalog.json`）

**不负责**：打分排序、创建 symlink。

### 3.2 `@skill-hub/router`

- 从 catalog 构建索引（默认 BM25）
- `query → RankedSkill[]`
- 可选：第二阶段信号融合（RRF 预留）
- `external-typesafe` 可作为可选决策层，对固定 Skill 候选执行 Choice，并返回概率、置信度与升级建议
- `audit` 对 Skill 做只读静态安全审计，不执行 Skill 内容
- `fetch(skillId)` 读正文（显式）
- 索引版本与失效检测

**不负责**：修改各 Agent 目录。

### 3.3 `@skill-hub/sync`

- 读取 agent 映射配置
- backup 打包
- dry-run 变更计划
- apply：按 `sync.mode` 创建/更新 symlink 或实体副本
- verify：死链、错误指向、copy 内容 hash
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
agents[]  → core.scan → inventory（user scope）
sources[] → core.scan → core.parse → conflict report / inventory
         → write canonical (copy or link-in strategy)
         → catalog update → router.buildIndex
```

### 4.2 Route

```text
query → inspect catalogHash → load bm25.json when fresh → score → top_k → RankedSkill(metadata only)
 optional: fetch body by id
```

`index` 写入 `index-meta.json` 与 `bm25.json`。无 profile/scope 且 catalog hash 匹配时，route 直接加载持久化 BM25；索引过期、缺失或查询需要过滤候选时，route 回退内存构建，并通过 JSON 返回 freshness 与 rebuild 建议。artifact 只保存 Skill 元数据和 BM25 统计量，不保存正文。

### 4.3 Explain / Path / History

```text
catalog + configured agents/sources
  → explain: variants/conflict winner/overlay + path + history
  → path: canonical/source/agent projection status
  → history: append-only metadata events
```

这些能力均为只读诊断（history 写入由 ingest/index/sync 的既有生命周期步骤完成），不改变 canonical 或 Agent 目录。

### 4.4 Sync

```text
config.agents → compare target vs canonical
 → Plan{mode, create, update, conflict, noop}
 → dry-run print | apply symlink/copy → verify
```

`workspace`/`project` source 默认只参与 inventory、ingest 与显式 scope route；CLI 全局 sync 会排除它们，避免项目 Skill 意外投影到所有 Agent。普通 Markdown、Obsidian 笔记和知识库不属于 `sources` 输入。

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
│   ├── index-meta.json     # catalog freshness + artifact 元数据
│   └── bm25.json           # 可加载 BM25 artifact
├── backups/
│   └── 20260810-120000/
│       ├── manifest.json
│       └── ...
├── catalog.json            # 规范化清单
└── history.jsonl           # Skill 生命周期元数据事件
```

`catalog.json` 的每个 Skill 条目可带 `provenance`。旧 catalog 缺少该字段时按 `user/local` 的兼容语义读取。

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
| 误删用户 skill | 禁止递归删；仅在 backup 后按显式模式替换为 symlink/copy |
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
| symlink 默认 + copy fallback | `docs/adr/0004-sync-copy-fallback.md` |
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


## 10. 来源管理与接管（ADR 0006）

`core/managed` 管本地/GitHub 获取、来源锁、预检、暂存、归档和恢复；`core/tree` 管完整目录 hash；`core/takeover` 管只读接管报告。CLI managed 写入完成后增量写 catalog/history，再调用既有 index；sync 仍独立承担 Agent 投影。没有新增常驻后台服务或跨 Agent 安装器依赖。

状态根新增 `managed-lock.json` 与串行写入锁 `.managed.lock`；更新原版本保存于 backups 的唯一批次。事务恢复失败时保留 `.managed-txn-*` 和备份以供恢复。目录/来源锁与 catalog/index 不是同一跨包事务，后者失败会报错而非回滚已成功的文件更新。详情见 API §7 与 ADR 0006。


## Phase 6 — 默认运行时（ADR 0007）

默认数据流为 Hub install/update → catalog/index → CLI browse/read/files 或 MCP skill_list/search/fetch/files/read → Agent 当前任务上下文。packages/router/runtime 提供共用分页及根内安全读取；sync 为显式兼容路径。OpenCode 以独立配置目录启动，仅继承模型提供方配置，不复制 Skill，禁用原生加载工具。
