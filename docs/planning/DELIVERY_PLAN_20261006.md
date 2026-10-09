# skill-hub 可落地交付计划（2026-10-06）

## 目标

把 skill-hub 从“能管理和检索 Skill”推进到“可审计、可声明、可回滚、可测量”的本地控制平面。每个切片必须能在沙箱完成安装/读取/审计/回退，并保留 CLI、MCP、Web 一致性证据。

## 已完成切片

### P11 — 静态审计

- `packages/core/src/audit.ts`：不执行脚本、不联网的目录遍历和规则扫描。
- CLI：`skill-hub audit [name] [--fail-on high|critical|warning|info]`。
- MCP：`skill_audit`。
- Web：`GET /api/audit?name=`、`GET /api/skills/:name/audit`。
- 规则覆盖私钥/令牌、远程管道执行、破坏性命令、动态执行、编码载荷、网络请求、疑似 prompt injection、执行权限和越界链接。
- 结果包含 `complete`；达到目录/文件/发现上限、遇到特殊文件或不支持编码时不报告通过，也不把源代码行写入报告。

## 下一步顺序

### P12 — 最小 manifest（下一切片）

产出 `skill-hub manifest --format agents-md --out <path>`：只生成 name/description、Hub MCP 的搜索/读取提示和 scope；默认 dry-run，写入采用临时文件 + rename。禁止把正文全文或普通 Markdown 写入 manifest。验收：OpenSkills 风格的 `<available_skills>` 可被项目 Agent 阅读，manifest 与 catalog hash 可追踪。

### P13 — pin/rollback/overlay

在现有 `managed-lock.json`、backup 和 history 上增加：`pin` 固定 commit/ref，`rollback` 从已验证备份或来源 commit 恢复，`overlay` 记录基准 hash 与覆盖文件。更新前先检测 canonical/tree hash；任何失败保留事务目录，不能静默覆盖本地修改。

### P14 — project/target 声明

增加项目级 manifest 与 target include/exclude 规则；`project/workspace` 默认只进入显式 route/manifest，不进入全局 Agent。先做 JSON/CLI，暂不做桌面 UI。

### P15 — Jev 评估

建立 `evals/router/*.jsonl`：至少 30 条真实匿名任务，每条包含期望 Skill、可接受候选、风险等级和是否允许自动升级。输出 BM25/Jev Top-K、confidence、升级率、p50/p95 延迟和费用；阈值来自数据，不从官方 demo 复制。

### P16 — CI 与发布

收敛 GitHub Actions：typecheck、build、lint、unit/integration、sandbox acceptance、文档链接检查；发布前生成 `outputs/release-report.json`。真实用户目录检查保持只读，生产 apply 仍要求显式授权。

## 停止条件

- 审计规则命中误报率未测量前，不把 `audit` 作为默认阻断 install 的硬门。
- manifest、pin、rollback 的协议稳定并有迁移说明前，不改变现有 Hub 状态目录。
- Jev 评估数据不足前，不修改默认 BM25，也不自动执行任何 Skill。
