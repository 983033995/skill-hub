# skill-hub MCP 集成指南

| 字段 | 值 |
|------|-----|
| 状态 | Active |
| 版本 | v0.1 |
| 最后更新 | 2026-08-10 |
| 范围 | **只读** tools；不暴露 apply/restore 写操作 |

---

## 1. 前提

```bash
cd /Volumes/13759427003/AI/skill-hub
pnpm install
pnpm build
# 需已有 Canonical：~/.skill-hub/skills + catalog.json
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js route "pdf merge" --top-k 3
```

MCP 入口：

```bash
node /Volumes/13759427003/AI/skill-hub/apps/mcp-server/dist/index.js
```

stdio 协议；进程由宿主拉起，**不要**在 shell 里交互式长时间挂着而不喂 JSON-RPC。

---

## 2. 工具一览

| Tool | 参数 | 说明 |
|------|------|------|
| `skill_search` | `query`（必填）, `top_k?`, `profile?` | BM25 Top-K；`profile`=`coding`\|`video` |
| `skill_fetch` | `name`, `max_chars?` | 读 SKILL.md 正文 |
| `skill_stats` | — | catalog 计数、默认引擎 |
| `skill_inventory` | `agent?` | 各端 skills 目录摘要 |

**安全**：无 `sync --apply` / `restore --apply`。改链路请用 CLI 并双重闸门。

---

## 3. WorkBuddy

**推荐**使用稳定启动脚本（固定 cwd + managed node，避免 Connection closed）：

```bash
# 脚本位置（本机已安装）
~/.skill-hub/bin/skill-hub-mcp
```

`~/.workbuddy/mcp.json` 示例：

```json
{
  "mcpServers": {
    "skill-hub": {
      "command": "/Users/zhangheteng/.skill-hub/bin/skill-hub-mcp",
      "args": [],
      "env": {
        "SKILL_HUB_PROFILES_DIR": "/Volumes/13759427003/AI/skill-hub/configs/profiles",
        "SKILL_HUB_REPO": "/Volumes/13759427003/AI/skill-hub",
        "SKILL_HUB_NODE": "/Users/zhangheteng/.workbuddy/binaries/node/versions/22.22.2/bin/node"
      },
      "disabled": false
    }
  }
}
```

写好后在连接器管理页对 **skill-hub** 点 **Trust**；改配置后建议 **新开对话**。

若仍报 `MCP error -32000: Connection closed`：

1. 确认外置盘已挂载：`ls /Volumes/13759427003/AI/skill-hub/apps/mcp-server/dist/index.js`  
2. 终端手跑：`~/.skill-hub/bin/skill-hub-mcp` 应看到 stderr 有 `stdio transport connected`（会挂起等 stdio，Ctrl+C 退出）  
3. `cd skill-hub && pnpm --filter @skill-hub/mcp-server build`  
4. 新开对话再试  

推荐会话用法：

1. `skill_search` query=当前任务  
2. 对 Top-1/2 调用 `skill_fetch`  
3. 仅按需加载正文，避免 100+ skill 全量 description  

---

## 4. Cursor

`~/.cursor/mcp.json`（或项目 `.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "skill-hub": {
      "command": "node",
      "args": [
        "/Volumes/13759427003/AI/skill-hub/apps/mcp-server/dist/index.js"
      ]
    }
  }
}
```

重启 Cursor → Settings → MCP 确认 skill-hub 已连接。

---

## 5. Claude Code / Codex / 其它 stdio 宿主

只要支持 **stdio MCP**，配置形态类似：

```json
{
  "command": "node",
  "args": ["/absolute/path/to/skill-hub/apps/mcp-server/dist/index.js"]
}
```

Claude Desktop 则放入 `claude_desktop_config.json` 的 `mcpServers`。

---

## 6. Profile

仓库内：

- `configs/profiles/coding.yaml`
- `configs/profiles/video.yaml`

环境变量覆盖搜索目录：

```bash
export SKILL_HUB_PROFILES_DIR=/Volumes/13759427003/AI/skill-hub/configs/profiles
```

CLI 等价：

```bash
node apps/cli/dist/index.js route "frontend design" --profile coding --top-k 5
```

---

## 7. 外部引擎（可选）

`router.engine: external-asf` 时：

```bash
export SKILL_HUB_EXTERNAL_ENGINE_CMD=/path/to/engine
export SKILL_HUB_EXTERNAL_ENGINE_ARGS=""
```

协议：stdin JSON `{ query, topK, skills[] }` → stdout `{ results: [{ name, score?, reasons? }] }`。  
未配置或失败时 **自动降级 BM25**。

---

## 8. 验证

```bash
# 库级
node -e "import('./packages/router/dist/index.js').then(m=>m.skillStats().then(console.log))"

# MCP Client 冒烟（在 apps/mcp-server 目录）
node --input-type=module -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: 'node', args: ['dist/index.js'] });
const c = new Client({ name: 't', version: '0' });
await c.connect(t);
console.log(await c.listTools());
await c.close();
"
```

---

## 9. 故障排查

| 现象 | 处理 |
|------|------|
| skillCount=0 | 先 `ingest` + `index` |
| profile 未找到 | 设 `SKILL_HUB_PROFILES_DIR` 或在仓库根 cwd 启动 |
| MCP 起不来 | `pnpm build`；确认 `apps/mcp-server/dist/index.js` 存在 |
| 命中差 | 英文查询更稳；改 description/keywords；或加 profile |

---

## 10. 相关

- API 契约：`docs/architecture/API.md` §3  
- 评估表：`outputs/phase3-route-eval.md`  
- 安全闸门：`HARNESS.md` / Phase 2 CLI  
