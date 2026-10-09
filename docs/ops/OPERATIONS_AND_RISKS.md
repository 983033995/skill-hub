# 运维与风险说明 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-16 |
| 对齐 | `HARNESS.md` · `PRD.md` |

---

## 1. 运维目标

1. **数据不丢**：任何批量写入前可回滚  
2. **行为可解释**：dry-run / verify / 日志  
3. **故障可定位**：错误码 + 路径级报告  
4. **变更可审计**：backup manifest + PROGRESS 记录  

---

## 2. 标准操作流程（SOP）

### 2.1 首次接入（生产 home）

```text
1. skill-hub doctor
2. skill-hub inventory --out ./inventory.md
3. skill-hub backup
4. skill-hub init
5. skill-hub ingest --sources <...> --dry-run
6. 处理 conflicts
7. skill-hub ingest --apply（或等价非 dry-run）
8. skill-hub index
9. skill-hub sync --dry-run
10. skill-hub sync --apply --require-backup
11. skill-hub verify
12. 抽样 route 10 条任务并记录到 PROGRESS
```

如果使用项目/工作区 Skill，先在 `config.yaml` 声明 `sources` 并用 `inventory --sources ... --scope ...` 盘点；`sources` 只接受包含 `SKILL.md` 的本地目录，普通 Markdown/知识库不在操作范围内。project/workspace Skill 默认不会被全局 sync。

### 2.2 日常新增 skill

```text
放入 ~/.skill-hub/skills/<name>
→ skill-hub index
→ skill-hub sync --dry-run
→ skill-hub sync --apply
→ skill-hub route "..." 验证
```

### 2.3 日常更新 skill

```text
只改 canonical 正文
→ index（若 description 变更）
→ sync 通常 no-op（symlink 已正确）
```

### 2.4 回滚

1. 定位 `~/.skill-hub/backups/<ts>/manifest.json`  
2. 停止相关 Agent 进程（可选，避免半写入）  
3. 按 manifest 将 agent skills 目录恢复到备份  
4. 若 canonical 也需回滚，恢复 `skills/` 快照  
5. `verify` + 抽样  

> Phase 1 实现前：使用 `tar`/`cp -a` 手工按 manifest 恢复（见下）。

### 2.5 手工紧急备份（实现前可用）

```bash
TS=$(date +%Y%m%d-%H%M%S)
DEST="$HOME/.skill-hub/backups/$TS"
mkdir -p "$DEST"
for d in workbuddy claude codex agents cursor; do
  src="$HOME/.$d/skills"
  # workbuddy 例外路径
done
# 推荐直接：
cp -a "$HOME/.workbuddy/skills" "$DEST/workbuddy-skills" 2>/dev/null || true
cp -a "$HOME/.codex/skills" "$DEST/codex-skills" 2>/dev/null || true
cp -a "$HOME/.agents/skills" "$DEST/agents-skills" 2>/dev/null || true
cp -a "$HOME/.cursor/skills" "$DEST/cursor-skills" 2>/dev/null || true
cp -a "$HOME/.claude/skills" "$DEST/claude-skills" 2>/dev/null || true
```

---

## 3. 监控与健康

| 检查 | 频率 | 命令/方式 |
|------|------|-----------|
| 目录健康 | 每次 sync 前 | `doctor` |
| 链接完好 | sync 后 | `verify` |
| 索引新鲜度 | skill 变更后 | `index`；route 对比 catalogHash 并加载 `bm25.json`，过期时提示 rebuild |
| 外置盘挂载 | 开发日 | 访问 `/path/to/skill-hub` |

---

## 4. 风险登记册

| ID | 风险 | 可能性 | 影响 | 缓解 | 残余风险 |
|----|------|--------|------|------|----------|
| R1 | sync 覆盖用户未入库修改 | 中 | 高 | 冲突检测；实体目录不静默替换 | 需人工合并 |
| R2 | 坏 symlink 导致 Agent 丢 skill | 中 | 中 | verify；apply 原子化 | 短暂不可用 |
| R3 | 外置盘拔出中断开发 | 中 | 中 | 文档提醒；home 放运行时数据 | 代码仓不可写 |
| R4 | 路由命中率差 | 中 | 中 | 治理 description；混合引擎 | 需持续调参 |
| R5 | 同名不同语义 skill 合并错误 | 中 | 高 | conflict 人工决议 | 人为失误 |
| R6 | 恶意 skill 脚本被执行 | 低 | 高 | hub 不自动执行脚本 | 用户手动运行仍有风险 |
| R7 | 权限/隐私泄露（共享机器） | 低 | 高 | 本地默认；权限 700 建议 | 用户环境依赖 |
| R8 | 生态工具行为变化（npx skills） | 中 | 低 | 自研 sync 作主路径 | 文档漂移 |
| R9 | 索引与目录不一致 | 中 | 中 | catalogHash；rebuild | 短暂错路由 |
| R10 | 误删 backup | 低 | 高 | 多重备份；重要迁移异地拷贝 | 运维纪律 |

---

## 5. 事件响应分级

| 级别 | 定义 | 响应 |
|------|------|------|
| P0 | 用户 skill 数据丢失/大面积错误替换 | 立即停 sync；从最近 backup 恢复；写事故记录 |
| P1 | 多端 Agent 无法加载 skill | verify；修复坏链；在确认 backup 后显式回退 copy |
| P2 | 路由不准但数据完好 | 调 description/引擎；不回滚文件 |
| P3 | 文档/开发体验问题 | 正常迭代 |

---

## 6. 备份策略

| 类型 | 时机 | 保留 |
|------|------|------|
| 迁移前全量 | ingest/sync apply 前强制 | ≥ 5 份或 30 天 |
| 版本升级前 | skill-hub 发版 | 与 release 对应 |
| 手动关键点 | 用户认为“稳了” | 长期 |

备份内容最少包含：各 enabled agent skills + canonical + config + catalog。

---

## 7. 安全运维清单

- [ ] 配置文件不含 token  
- [ ] `~/.skill-hub` 权限对他人不可写  
- [ ] apply 前 dry-run 附件/日志保留  
- [ ] 不在脚本中使用 `rm -rf` 指向 home skills  
- [ ] 外部 skill 引入前抽查 `scripts/`  

---

## 8. 已知限制（v0.3）

- `index` 写入 freshness marker + 可加载 `bm25.json`；profile/scope 过滤仍会按过滤后候选在内存构建 BM25
- project/workspace Skill 默认不全局 sync；`explain/path/history` 已提供只读来源、投影与生命周期诊断
- Windows 未作为测试目标

---

## 9. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版运维与风险 |


## Phase 6 运维调整

默认新增/更新流程为 Hub install/update → catalog/index → 下次 MCP 按需读取，不执行 sync。上文 symlink 首次迁移和日常同步保留为兼容模式。OpenCode 专用入口可通过退出后普通启动回退；无需移动或删除原有 Skill 目录。加载内容不授权执行，正文读取限制不能替代内容风险扫描。
