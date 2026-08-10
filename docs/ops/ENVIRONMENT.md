# 环境配置 — skill-hub

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |
| 对齐 | `HARNESS.md` |

---

## 1. 硬件与路径前提

| 项 | 要求 |
|----|------|
| OS | macOS 优先（开发机已验证方向） |
| 项目路径 | `/Volumes/13759427003/AI/skill-hub` |
| 用户运行时数据 | `~/.skill-hub`（home 盘，非必须在外置卷） |
| 外置卷 | 需保持挂载；卷名 `13759427003` |

> 外置盘断开时，可继续编辑已打开文件，但 git/脚本对新开进程可能失败。

---

## 2. 运行时依赖

### 2.1 必需（Phase 1 开发）

| 依赖 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ 20（推荐 22 managed） | CLI/MCP |
| pnpm | ≥ 9 | monorepo |
| Git | 2.x | 版本管理 |

### 2.2 可选

| 依赖 | 用途 |
|------|------|
| Python ≥ 3.10 | 未来 neuro-skill 等绑定 |
| `npx` | 调用 `skills` / `agent-skill-finder` 等生态工具 |
| RTK CLI | 用户 shell 惯例（命令前缀） |

### 2.3 本机已知运行时（参考）

- managed Node：`~/.workbuddy/binaries/node/versions/22.22.2/bin/node`
- managed Python：`~/.workbuddy/binaries/python/versions/3.13.12/bin/python3`

优先使用 managed 运行时，避免污染全局。

---

## 3. 仓库初始化（开发者）

```bash
cd /Volumes/13759427003/AI/skill-hub

# 后续 Phase 1 落地后：
# pnpm install
# pnpm build
# pnpm test
```

当前 Phase 0：**无需 install 即可维护文档**。

---

## 4. 用户运行时初始化（规划）

```bash
skill-hub init
# 生成：
# ~/.skill-hub/config.yaml
# ~/.skill-hub/skills/
# ~/.skill-hub/index/
# ~/.skill-hub/backups/
```

### 4.1 环境变量（可选覆盖）

| 变量 | 说明 | 默认 |
|------|------|------|
| `SKILL_HUB_HOME` | hub 根目录 | `~/.skill-hub` |
| `SKILL_HUB_CONFIG` | 配置文件路径 | `$SKILL_HUB_HOME/config.yaml` |
| `SKILL_HUB_LOG_LEVEL` | `debug\|info\|warn\|error` | `info` |

---

## 5. Agent 路径映射（默认）

见 `configs/agents/default.yaml`（仓库模板）。

| Agent ID | 默认 skills 目录 |
|----------|------------------|
| workbuddy | `~/.workbuddy/skills` |
| claude-code | `~/.claude/skills` |
| codex | `~/.codex/skills` |
| agents | `~/.agents/skills` |
| cursor | `~/.cursor/skills` |

可通过 `config.yaml` 禁用某一端。

---

## 6. 开发工具建议

| 工具 | 用途 |
|------|------|
| VS Code / Cursor / WorkBuddy | 编辑 |
| 目录对比 | 合并冲突 skill |
| `shasum` / `shasum -a 256` | 手工校验 hash |

---

## 7. 配置模板位置

| 文件 | 说明 |
|------|------|
| `configs/agents/default.yaml` | 默认 agent 映射 |
| `configs/profiles/coding.yaml` | 编码场景子集示例 |
| `configs/profiles/video.yaml` | 视频场景子集示例 |

复制到用户 hub 或由 `init` 合并。

---

## 8. 网络与隐私

- 默认**离线**可完成 inventory / route / sync  
- 安装外部生态工具（`npx skills` 等）时才需要网络  
- 禁止默认上传 catalog 到第三方  

---

## 9. 故障：环境类

| 现象 | 排查 |
|------|------|
| 找不到项目 | 确认外置卷挂载 |
| Node 版本低 | 切换 managed Node 22 |
| 权限拒绝 | 检查 `~` 下 agent 目录 ACL |
| pnpm 未装 | `corepack enable && corepack prepare pnpm@latest --activate` |

---

## 10. 变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v0.1 | 2026-08-10 | 首版环境说明 |
