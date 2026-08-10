# ADR 0001: Canonical Store + Symlink 分发

| 字段 | 值 |
|------|-----|
| 状态 | Accepted |
| 日期 | 2026-08-10 |
| 决策者 | script / agent（基线） |

## 背景

多 Agent 各自拷贝 skill 导致版本漂移与重复维护。需要单一真源，同时让各端仍从“习惯路径”发现 skill。

## 决策

1. 以 `~/.skill-hub/skills` 为 **Canonical Store**（唯一可改正文处）  
2. 各 Agent skills 目录通过 **symlink** 指向 canonical 下同名 skill  
3. 同步默认 dry-run；实体目录冲突不静默覆盖  

## 备选方案

1. **全量复制到各端**：实现简单，但继续漂移  
2. **仅改 Agent 配置指向同一目录**：部分 Agent 不支持自定义根路径  
3. **仅用 npx skills 管理**：覆盖面好，但 WorkBuddy 路径需额外处理，且路由能力不足  

## 后果

### 正面

- 一处修改，多端一致  
- 与现有 Agent 目录约定兼容  

### 负面

- 依赖 OS symlink 支持（Windows 需额外策略）  
- 坏链风险 → 必须 verify/backup  

## 后续行动

- Phase 2 实现 sync apply/verify  
- 评估 copy fallback（P1/P2）
