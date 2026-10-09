# MODELS.md — 自定义模型配置（可选增强层）

> 定位：为 skill-hub 提供**可选的**模型接入能力（语义路由、智能打标、冲突治理建议等增强特性的基础）。
> **不配置时系统以纯 BM25 确定性路由正常运行，核心功能对模型零依赖。**

## 1. 支持的服务类型

| type | 适用 | 端点 |
|------|------|------|
| `openai-compatible` | OpenAI 官方及一切兼容协议的第三方服务（DeepSeek、Moonshot、one-api、CLIProxyAPI 等） | `POST {base_url}/chat/completions`、`POST {base_url}/embeddings`、`GET {base_url}/models` |
| `ollama` | 本地 Ollama 推理服务（qwen、llama、bge-m3 等，零外发零成本） | `POST {base_url}/api/chat`、`POST {base_url}/api/embed`、`GET {base_url}/api/tags` |

### 1.1 Jev 语义路由（独立于 LLM Provider）

Jev 不是 chat/embed Provider，而是一个可选的 `RouterEngine`：使用 `external-typesafe` 对候选 Skill 的 `name`、`description`、`keywords` 做 Choice 概率排序。它不读取或上传 `SKILL.md` 正文，不改变默认 BM25，也不写用户 Skill 目录。

```bash
TYPESAFE_API_KEY="$TYPESAFE_API_KEY" \
  node apps/cli/dist/index.js route "做一个产品宣传视频" \
  --engine external-typesafe --top-k 5 --json
```

配置/运行时变量：

- `TYPESAFE_API_KEY`：API Key，必须由环境变量或宿主密钥管理器提供；
- `TYPESAFE_API_URL`：可选，默认 `https://api.typesafe.ai/v1/systemone`；
- `TYPESAFE_MODEL`：可选，默认 `jev-latest`；
- `TYPESAFE_TIMEOUT_MS`：可选，默认 15000ms。

Jev 请求失败、超时、响应格式异常或未配置 Key 时，`route`/`skill_search` 自动降级到 BM25，并在 JSON 中返回 `degraded` 与 `degrade_reason`。成功调用时，响应还会带 `decision`：选择的 Skill、按 Skill 映射的概率、`confidence`、`threshold` 和 `escalation_recommended`。这只是上层升级信号，不能作为自动执行授权。MCP `skill_search` 和 Web `GET /api/search` 可通过 `engine=external-typesafe` 显式启用。

默认阈值为 `0.65`，可通过 `TYPESAFE_MIN_CONFIDENCE` 调整，非法值报 `E_CONFIG`。升级建议使用服务返回的 `confidence`，被选项概率独立保存在 `selected_probability`。阈值应在自己的任务数据上校准；`none_of_the_above` 始终建议升级判断。

新增通用模型服务类型时，仍实现 `LlmProvider` 接口（`chat` / `embed` / `probe`），在 `packages/router/src/llm/types.ts` 的 `LLM_PROVIDER_TYPES` 登记类型名，并在 `registry.ts` 的 `createLlmProvider` 加一个分支。

## 2. 配置方式（优先级从高到低）

| 方式 | 说明 |
|------|------|
| 环境变量快捷配置 | `SKILL_HUB_LLM_TYPE` / `SKILL_HUB_LLM_BASE_URL`（设置任一即启用），另可配 `SKILL_HUB_LLM_ID` / `SKILL_HUB_LLM_API_KEY` / `SKILL_HUB_LLM_MODEL` / `SKILL_HUB_LLM_EMBED_MODEL` / `SKILL_HUB_LLM_TIMEOUT_MS`。适合临时接入单个服务 |
| `SKILL_HUB_MODELS_CONFIG` | 指向任意路径的配置文件（.yaml 或 .json） |
| 默认文件 | `~/.skill-hub/models.yaml` → `~/.skill-hub/models.json`（先命中先生效） |

配置文件示例见 **`configs/models.yaml`**（含字段注释与 Ollama / OpenAI / CLIProxyAPI 三个实例）。
密钥一律用 `${ENV_VAR}` 引用环境变量，不要明文写入文件、不要提交 Git。

最小可用配置（本地 Ollama）：

```yaml
providers:
  - id: local
    type: ollama
    base_url: http://127.0.0.1:11434
    model: qwen3:8b
    embed_model: bge-m3
```

## 3. 状态与降级

| state | 含义 | 系统行为 |
|-------|------|----------|
| `disabled` | 未配置（默认） | 核心功能正常，增强能力不启用 |
| `ready` | 配置合法（probe 通过） | 增强能力可用 |
| `misconfigured` | 配置文件存在但非法 | 错误信息内联展示（含定位与修复提示），核心功能不受影响 |
| `unreachable` | 配置合法但服务不可达 / 鉴权失败 / 超时 | probe 返回友好提示，核心功能不受影响 |

- 查询状态：`GET /api/llm/status`（Web），加 `?probe=1` 实际请求服务做健康探测（返回可用模型列表与延迟）。
- 运行时错误分类：`E_LLM_NOT_CONFIGURED` / `E_LLM_UNAVAILABLE` / `E_LLM_AUTH` / `E_LLM_TIMEOUT` / `E_LLM_BAD_RESPONSE`，每条都带 `hint` 修复建议。
- 消费方约定：用 `requireLlmProvider()` 获取实例，捕获 `E_LLM_NOT_CONFIGURED` 后降级到确定性路径（如 BM25）；`getLlmStatus()` 永不抛错，可直接用于界面展示。
- 安全：状态接口只回传 `apiKeyConfigured` 布尔值，密钥不出模块。

## 4. 代码结构

```
packages/router/src/llm/
├── types.ts              # LlmProvider 接口、配置类型、LlmError（含 hint）
├── config.ts             # 文件/环境变量加载、${VAR} 插值、校验（YAML 子集解析，无外部依赖）
├── http.ts               # 共用 HTTP 助手：超时、错误分类、友好提示
├── openai-compatible.ts  # OpenAI 兼容协议 Provider
├── ollama.ts             # Ollama 本地服务 Provider
├── registry.ts           # 工厂（新增类型在此登记）+ getLlmStatus/requireLlmProvider
├── index.ts              # barrel 导出
└── llm.test.ts           # 单测（mock fetch，覆盖解析/校验/错误分类/降级）
```

## 5. 验证

```bash
# 未配置：state=disabled，一切正常
curl -s http://127.0.0.1:4173/api/llm/status

# 配置后（以 Ollama 为例）
cp configs/models.yaml ~/.skill-hub/models.yaml
curl -s "http://127.0.0.1:4173/api/llm/status?probe=1"   # ready + 本地模型列表

# 临时用环境变量试一个服务（无需文件）
SKILL_HUB_LLM_TYPE=ollama SKILL_HUB_LLM_BASE_URL=http://127.0.0.1:11434 \
  SKILL_HUB_LLM_MODEL=qwen3:8b pnpm web
```
