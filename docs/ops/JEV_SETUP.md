# Jev / TypeSafe token 配置指南

状态：Active · 核对日期：2026-10-09 · 适用：Skill Hub v0.1.0的external-typesafe路由

## 1. 获取 token

1. 打开官方 [API Keys 页面](https://console.typesafe.ai/keys)，登录TypeSafe账号。
2. 在控制台创建/取得API Key。账号权限、服务开通和计费以控制台为准。
3. 该Key就是本指南说的Jev token，HTTP认证方式为 `Authorization: Bearer <API_KEY>`。它不是OpenAI Key，也不是CLIProxyAPI Key；无需另装TypeSafe SDK才能使用本项目的HTTP适配器。

官方来源：[Quick start](https://docs.typesafe.ai/introduction/quickstart)、[HTTP API](https://docs.typesafe.ai/api)。不要把真实Key发到GitHub Issue、聊天或提交仓库。

## 2. CLI 临时启用（最快）

在项目根目录先 `pnpm build`。使用自己维护的secret manager设置环境变量，或在终端输入Key。下面读取方式不把Key文本作为shell命令记录；选择与你的shell对应的一段。

**Bash**：

```bash
read -r -s -p "TypeSafe API key: " TYPESAFE_API_KEY
printf '\n'
export TYPESAFE_API_KEY
```

**zsh（macOS默认）**：

```zsh
read -r -s 'TYPESAFE_API_KEY?TypeSafe API key: '
printf '\n'
export TYPESAFE_API_KEY
```

然后运行：

```bash
pnpm hub route "制作产品宣传视频" --engine external-typesafe --top-k 3 --json
```

需要Hub已有相关候选。token存在时，**仍必须选择Jev引擎**；否则默认BM25不会调用Jev。显式运行会把查询内容与候选metadata发给TypeSafe并可能计费。

成功输出的判据：

```json
{
  "engine": "external-typesafe",
  "degraded": false,
  "decision": {
    "kind": "choice",
    "model": "实际服务模型版本",
    "selected": "所选Skill名",
    "confidence": 0.8,
    "selected_probability": 0.9,
    "escalation_recommended": false
  }
}
```

这是字段示意，不是实际请求结果。`engine=bm25` 且 `degraded=true` 表示已回退，不能当成Jev验证通过；具体原因看 `degrade_reason`。Jev选无匹配时results为空、selected=null，但成功调用仍可有decision。

完成后可 `unset TYPESAFE_API_KEY` 清除当前shell的变量。不要用 `echo $TYPESAFE_API_KEY` 或完整 `env` 输出检查Key；只检查是否配置：

```bash
node -e 'console.log({apiKeyConfigured: Boolean(process.env.TYPESAFE_API_KEY?.trim())})'
```

## 3. 默认引擎设置（可选）

如果希望CLI、MCP和Web的搜索默认采用Jev，编辑**你已有**的Hub配置（默认 `~/.skill-hub/config.yaml`，自定义路径受SKILL_HUB_CONFIG/--config影响），只修改router键，不覆盖canonical/source/Agent等其它设置：

```yaml
router:
  top_k: 5
  engine: external-typesafe
```

**不要在这个YAML中保存Key。** 每个实际执行搜索的进程还必须取得 `TYPESAFE_API_KEY`。回退默认本地检索只需将engine改回bm25。

设置默认引擎后，Agent未指定engine的 `skill_search` 也会调用Jev；它是Hub服务器请求内 `await fetch`，不是后台异步任务。LLM负责提出查询，Jev返回候选Choice决策，正文读取仍由Hub完成。

## 4. CLI / MCP / Web / 宿主：Key必须交给正确进程

| 入口 | 怎样启用Jev | Key由谁读取 |
|------|------------|------------|
| CLI route | --engine external-typesafe，或Hub router.engine | CLI进程 |
| MCP skill_search | engine参数，或Hub router.engine | **MCP server子进程**，不是聊天模型进程 |
| Web /api/search | engine=external-typesafe，或Hub router.engine | 启动pnpm web的Node进程 |
| OpenCode隔离入口 | search engine参数，或Hub router.engine | OpenCode拉起的Hub MCP进程，默认继承启动环境 |
| WorkBuddy/Qoder GUI | 对应MCP进程的环境/secret manager +上述engine选择 | GUI启动的Hub MCP进程 |

GUI应用往往不继承你在终端新export的环境。改变Key后，应按宿主要求重启MCP/新会话；旧的MCP进程不会自动取得新变量。本仓库的标准stdio入口**不会自动读取macOS Keychain**；以前本机另部署的entry.js包装器可能读取过Keychain，不代表从源码构建也自动读。

### 通用MCP配置示意

配置结构需适配宿主。下面的 `env` 是常见MCP格式；`YOUR_PRIVATE_KEY` 仅为占位。只有在你自己的私有宿主配置中替换真实Key，按宿主secret manager方案优先提供，不把该文件加入Git。

```json
{
  "mcpServers": {
    "skill-hub": {
      "command": "node",
      "args": ["/absolute/path/to/skill-hub/apps/mcp-server/dist/index.js"],
      "env": {
        "SKILL_HUB_HOME": "/absolute/path/to/your/hub",
        "TYPESAFE_API_KEY": "YOUR_PRIVATE_KEY"
      }
    }
  }
}
```

不要假设JSON中的 `"${TYPESAFE_API_KEY}"` 会被宿主展开：本项目不会替MCP宿主做环境插值；不支持的宿主可能把它原样作为错误Key发送。token不要放在 `--engine`、`--config` 或API URL参数里。

### macOS Keychain + MCP启动器（私有本机可选方案）

在系统“钥匙串访问”中创建通用密码：服务名 `typesafe-ai-api-key`、账号为当前系统用户名、密码为你的Key；由你在系统界面录入，避免把Key放进shell历史。将下面脚本保存到你的**私有本机路径**，给执行权限，再让GUI MCP配置command指向该脚本、args为空：

```sh
#!/bin/sh
set -eu
export TYPESAFE_API_KEY="$(/usr/bin/security find-generic-password -a "$USER" -s typesafe-ai-api-key -w)"
exec /absolute/path/to/node /absolute/path/to/skill-hub/apps/mcp-server/dist/index.js
```

这里路径必须替换为实际安装位置。脚本不回显Key；系统可能要求你批准钥匙串读取。不要关闭系统授权检查，也不要保存脚本执行的完整环境。MCP仍使用Hub config或engine参数选择external-typesafe。

### OpenCode与Web从已配置终端启动

```bash
# 此shell已export TYPESAFE_API_KEY，并在Hub配置设engine=external-typesafe
pnpm opencode -- --model your-provider/your-model
pnpm web
```

`models.yaml` 是通用chat/embed provider配置，**不用于Jev**；`OPENAI_API_KEY`、`SKILL_HUB_LLM_API_KEY` 也不能替代TYPESAFE_API_KEY。

## 5. 支持的变量

| 变量 | 本项目默认 | 说明 |
|------|------------|------|
| TYPESAFE_API_KEY | 无 | 必需Key，进程环境或宿主secret manager |
| TYPESAFE_API_URL | https://api.typesafe.ai/v1/systemone | 完整POST endpoint；通常不用改 |
| TYPESAFE_MODEL | jev-latest | 服务模型别名 |
| TYPESAFE_TIMEOUT_MS | 15000 | 整数1000–120000；无效值回默认 |
| TYPESAFE_MIN_CONFIDENCE | 0.65 | 0–1；无效配置报E_CONFIG |

这是本项目HTTP适配器的变量名，**不等同官方SDK**的TYPESAFE_BASE_URL/TYPESAFE_DEFAULT_MODEL。Key仍必须来自真实账号，示例环境文件不会创建Key。

`.env` / `.env.example` **不会自动加载**。如需私有环境文件，用自己信任的启动器/secret manager加载后启动进程；只复制.env.example而不加载环境，程序仍视为未配置。

## 6. 故障检查

| 实际结果 | 排查 |
|----------|------|
| bm25、degraded=false | 未选择external-typesafe；有Key不等于启用 |
| bm25、degraded=true、缺Key | Key未传给实际CLI/MCP/Web进程；检查GUI与终端环境差异 |
| HTTP401 / HTTP403后回退 | Key错误/吊销/账号无权限；在官方控制台处理，不贴出Key |
| 超时、429、529或网络失败后回退 | 服务/额度/网络；先看脱敏的错误原因和控制台状态 |
| 候选超过254后回退 | 用scope/profile缩小集合；单Choice另保留无匹配选项 |
| E_CONFIG提到MIN_CONFIDENCE | 阈值必须为0–1有限数值 |
| Jev成功但选错 | 类型有效不保证判断正确；用自己标注的任务校准/复核 |

confidence与selected_probability分开保存；0.65只是未校准的初始建议。该信号不触发真实Skill/脚本执行。
