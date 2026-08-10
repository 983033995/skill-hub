# PRD — skill-hub 产品需求文档

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |
| Owner | script |
| 对齐规范 | `HARNESS.md` |

---

## 1. 背景与问题

本地开发者同时使用 **WorkBuddy、Claude Code、Codex、Cursor** 等多种 Agent，各自在：

- `~/.workbuddy/skills`
- `~/.claude/skills`
- `~/.codex/skills`
- `~/.agents/skills`
- `~/.cursor/skills`

等路径安装大量 Skill（本机盘点：跨端约 **108** 个唯一 skill，WorkBuddy 单独约 **76**）。

导致：

1. **管理碎片化**：同名 skill 多份拷贝、版本不一致  
2. **上下文膨胀**：每次会话塞入过多 skill 元数据/正文  
3. **选型变差**：LLM 在超长列表中命中率下降  
4. **迁移高风险**：手动拷贝/删除易丢数据  

---

## 2. 产品目标

### 2.1 一句话目标

> 让用户在**一份真源**上管理全部 Skill，并在任意 Agent 中获得**智能选型**与**省上下文**的一致体验。

### 2.2 目标拆解（OKR 风格）

| 目标 | 关键结果（可度量） |
|------|--------------------|
| G1 统一管理 | 任一 skill 正文只存在于 Canonical Store 一份；各端为 symlink/受控副本 |
| G2 智能选型 | 常用任务 Top-3 主观可用；路由 p95 ≤ 50ms @200 skills（本地索引） |
| G3 省上下文 | 相对“全量 description 注入”，单次相关注入 token 下降 ≥ 70% |
| G4 安全迁移 | 生产写入前必有 backup + dry-run 报告；冲突不静默覆盖 |
| G5 可维护工程 | 文档/质量门禁齐全，可持续迭代（HARNESS 基线） |

### 2.3 非目标（Out of Scope · v1）

- 不做云端 skill 市场账号体系  
- 不替代各 Agent 官方插件商店本身  
- 不自动执行 skill 内任意网络攻击/破坏性脚本  
- 不以 Windows 一等公民为 v1 目标（可兼容调研）  
- 不在 v1 强制接入付费 embedding API（可选插件）  

---

## 3. 用户与场景

### 3.1 主角用户

| 角色 | 描述 |
|------|------|
| 重度本地 Agent 用户 | 多端装了大量 skill，需要统一与省 token |
| 个人效能工程向用户 | 接受 CLI/配置，重视可回滚与可审计 |
| 后续：小团队 | 共享同一套 skill hub（git 分发） |

### 3.2 核心场景（摘要）

完整展开见 `USER_SCENARIOS.md`。

| ID | 场景 | 期望结果 |
|----|------|----------|
| S1 | 盘点多端 skill | 输出存在矩阵与冲突列表 |
| S2 | 合并为 Canonical Store | 唯一真源；冲突显式列出 |
| S3 | 分发到多 Agent | symlink；各端可见一致 |
| S4 | 按任务智能选型 | 返回 Top-K + 分数/理由 |
| S5 | Agent 会话中自动缩候选 | hook/MCP/规则使模型只见 Top-K |
| S6 | 新增/更新 skill | 改 hub → sync → reindex 两步闭环 |
| S7 | 回滚错误迁移 | 从 backup 还原 |

---

## 4. 功能范围

### 4.1 P0 — MVP 必须

| 模块 | 功能 | 验收要点 |
|------|------|----------|
| Inventory | 扫描多端 skill 目录 | 统计数量、同名、缺失 SKILL.md |
| Canonical | 初始化 `~/.skill-hub` 结构 | 目录规范符合 ARCHITECTURE |
| Ingest/Merge | 导入 skill 到真源 | 冲突策略：skip/report，不静默覆盖 |
| Index | 构建本地检索索引 | 可持久化；增量重建 |
| Route | 任务 → Top-K | CLI JSON/table；含 score |
| Sync | dry-run / apply 分发 | 仅 symlink；报告将变更集 |
| Backup | 打包各端 + hub | 可还原说明 |
| Doctor | 环境自检 | Node、路径、权限、坏链 |
| Docs | HARNESS 文档体系 | 本 PRD 所属基线 |

### 4.2 P1 — 增强

| 模块 | 功能 |
|------|------|
| Profiles | 按场景缩小候选池（coding/video/marketing） |
| MCP Server | `skill_search` / `skill_fetch` / `skill_stats` |
| Agent Hooks 集成文档 | ASF/Claude/Codex/Cursor 接入步骤 |
| 混合路由 | BM25 + 可选第二信号（特征/图） |
| 依赖边 | `depends_on` 拉取前置 skill |
| OpenSkills 风格目录 | 生成精简 name+description 清单 |

### 4.3 P2 — 远期

| 模块 | 功能 |
|------|------|
| GUI | 可视化管理与冲突解决 |
| 团队 Git 同步协议 | 多人 hub |
| 执行反馈学习 | 个性化加权 |
| Windows 一等支持 | junction/ACL |
| Skill 质量评分 | description 质量 lint |

---

## 5. 功能需求明细

### 5.1 配置模型

- 默认用户配置：`~/.skill-hub/config.yaml`  
- 仓库内默认模板：`configs/agents/*.yaml`  
- 关键字段：

```yaml
canonical_dir: ~/.skill-hub/skills
agents:
  - id: workbuddy
    skills_dir: ~/.workbuddy/skills
    enabled: true
  - id: claude-code
    skills_dir: ~/.claude/skills
    enabled: true
  - id: codex
    skills_dir: ~/.codex/skills
    enabled: true
  - id: agents
    skills_dir: ~/.agents/skills
    enabled: true
  - id: cursor
    skills_dir: ~/.cursor/skills
    enabled: true
router:
  top_k: 5
  engine: bm25   # bm25 | hybrid | external-asf
sync:
  mode: symlink
  conflict: report  # report | skip
```

### 5.2 命令能力（逻辑需求，非最终实现绑定）

| 命令 | 输入 | 输出 |
|------|------|------|
| `doctor` | 无 | 健康报告 exit code 0/1 |
| `inventory` | agent 过滤 | 矩阵、冲突 |
| `backup` | 目标路径 | backup 路径 |
| `init` | — | 创建 hub 骨架 |
| `ingest` | source dirs | 导入报告 |
| `index` | — | 索引构建报告 |
| `route` | query, top_k | 候选列表 |
| `sync` | dry-run/apply | 变更计划/结果 |
| `verify` | — | symlink 完好性 |

### 5.3 路由需求

1. 仅使用 skill **元数据**（name/description/keywords）做默认检索  
2. 默认不把 skill **正文**注入路由结果；提供 `fetch`/`--include-body` 显式开关  
3. 支持中文查询（至少分词/二元语法或等价策略）  
4. 空库、无匹配时返回明确空结果与建议  

### 5.4 同步需求

1. apply 前若无最近 backup，警告或拒绝（可配置 `require_backup`）  
2. 目标已是指向正确 hub 的 symlink → no-op  
3. 目标是实体目录且内容不同 → **conflict**，不覆盖  
4. 支持按 agent enable 列表过滤  

---

## 6. 非功能需求（NFR）

| ID | 类别 | 要求 |
|----|------|------|
| NFR-1 | 性能 | route p95 ≤ 50ms @200 skills（冷索引加载另计） |
| NFR-2 | 性能 | index 全量 200 skills ≤ 5s（本机 SSD/外置盘可放宽记录） |
| NFR-3 | 可靠 | 任意失败可解释；exit code 区分 |
| NFR-4 | 安全 | 无默认网络上传用户 skill |
| NFR-5 | 安全 | 破坏性操作需二次确认标志 |
| NFR-6 | 可移植 | 配置路径支持 `~` 与绝对路径 |
| NFR-7 | 可观测 | 关键命令支持 `--json` |
| NFR-8 | 兼容 | Node ≥ 20；macOS 14+ 优先验证 |
| NFR-9 | 可维护 | 符合 HARNESS 质量门槛 |
| NFR-10 | 隐私 | 索引默认本地；telemetry 默认关闭 |

---

## 7. 边界与约束

### 7.1 系统边界

**内**：扫描、合并、索引、路由、分发、备份、报告  
**外**：各 Agent 自身推理循环、第三方 skill 市场、用户 skill 业务语义正确性  

### 7.2 假设

- 用户 skill 遵循 Agent Skills 开放格式（`SKILL.md` + frontmatter）  
- 用户有权读写其 home 下 agent 目录  
- 开发机可安装 Node/pnpm  

### 7.3 依赖

- 可选：agent-skill-finder / neuro-skill 作为外部路由引擎  
- 可选：MCP 客户端宿主  

---

## 8. 验收标准（Release Gates）

### 8.1 Phase 0（文档）— 当前交付

- [x] 仓库位于外置盘 AI 目录  
- [x] HARNESS / PRD / 架构 / API / 环境 / 运维风险 / 计划齐备  
- [x] 文档索引可导航  
- [x] 目录结构与 HARNESS 一致  

### 8.2 Phase 1（MVP 可运行）

- [ ] `skill-hub doctor` 在本机可运行  
- [ ] `inventory` 能复现“约 100+ 唯一 skill”量级盘点  
- [ ] `ingest` + `index` + `route` 对 fixture 与真实抽样子集可用  
- [ ] `sync --dry-run` 生成可读变更计划  
- [ ] 单测覆盖 core 解析与 route 基础  
- [ ] 文档状态从“未实现”更新为真实 CLI 说明  

### 8.3 Phase 2（多端可用）

- [ ] 至少 3 个 Agent 目录 symlink 一致  
- [ ] 抽样 10 条真实任务 Top-K 主观评估记录  
- [ ] backup → apply → verify → 回滚演练通过  

### 8.4 产品成功标准（v1）

参见 §2.2 G1–G5 全部达成并有测量记录写入 `PROGRESS.md`。

---

## 9. 里程碑映射

| 里程碑 | 对应 |
|--------|------|
| M0 文档基线 | 本文件体系（现在） |
| M1 MVP CLI | P0 功能 |
| M2 多端同步生产可用 | P0 sync apply + backup |
| M3 路由增强与 MCP | P1 |
| M4 体验与团队化 | P2 |

详细排期见 `docs/planning/ROADMAP.md`。

---

## 10. 风险（产品视角）

| 风险 | 影响 | 缓解 |
|------|------|------|
| 同名 skill 语义不同 | 错误覆盖 | 冲突报告 + 人工决议 |
| Agent 不认 symlink | 分发失效 | doctor 检测；fallback copy 模式（P1） |
| 路由命中差 | 体验差 | description 治理 + 混合引擎 |
| 外置盘路径/权限 | 开发中断 | doctor；文档注明卷名 |
| 用户误 apply | 数据乱 | 强制 dry-run 习惯 + backup |

详情：`docs/ops/OPERATIONS_AND_RISKS.md`。

---

## 11. 开放问题

1. WorkBuddy 是否需要特殊 loader（相对标准 skills 目录）？  
2. v1 默认引擎用内建 BM25 还是直接集成 ASF？  
3. `~/.agents/skills` 与 `~/.codex/skills` 的优先级策略？  
4. 是否默认把 Claude 全局 skills 目录纳入（当前可能为空）？  

开放问题决策后写入 ADR。

---

## 12. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版 PRD，对齐 HARNESS 文档基线 |
