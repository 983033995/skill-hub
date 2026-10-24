# 精简运行时、宿主验收与开销测量

状态：Active · 更新：2026-10-12

## 对架构建议的判断

固定Hub入口、按任务检索、正文按需读取值得推进。现有Registry/Router/Loader可复用；不要为了“接管”复制全量Skill描述到全局AGENTS.md，也不应立即重构为通用Host Adapter框架。

| 建议 | 当前处理 |
|------|----------|
| 精简runtime与管理工具分开 | 已实现可选三工具模式；保留默认full兼容 |
| 各宿主分别证明原生Skill不进入上下文 | OpenCode已有隔离验证；Codex本会话仍收到Skill清单，不能标零注入；其它宿主保持STATUS中的限制 |
| Token真实对照 | 协议字节、同模型full/runtime及真实元数据Native三模式试验已跑；业务质量/重复采样/长会话仍待验证 |
| 继续本地BM25 | 保持默认；支持中英文词项，不等于跨语言语义匹配 |
| 前置Hook路由 | 暂缓，须先证明宿主支持及漏检改善，MCP本身没有输入拦截功能 |
| 自动执行/远程资源适配 | 暂缓；检索/读取成功不授予执行权限，二进制/远端资源不是当前文本MCP能力 |

[官方OpenAI Skills文档](https://learn.chatgpt.com/docs/build-skills)说明Codex初始提供name/description/path，并把清单限制在模型上下文的2%以内，未知窗口时使用8000字符预算；超出会先缩短描述，可能省略条目。关闭单项Skill使用`[[skills.config]]`并需重启。因此“150×80 tokens”等线性示例只解释成本结构，不能当作当前Codex实测。实际版本和宿主应重新验收。`allow_implicit_invocation=false`只是禁止隐式激活，不能据此断言元数据不进入上下文。

## 配置

完整模式仍是默认。普通Agent可选择精简模式：

```json
{
  "mcpServers": {
    "skill-hub": {
      "command": "node",
      "args": ["/absolute/path/to/skill-hub/apps/mcp-server/dist/index.js"],
      "env": { "SKILL_HUB_MCP_MODE": "runtime" }
    }
  }
}
```

环境值仅允许full/runtime，非法值报E_CONFIG。配置改变后重连MCP；服务本身不关闭任何宿主原生发现。本轮没有修改Codex/WorkBuddy/Qoder用户配置或重启现有任务。

OpenCode：

```bash
pnpm opencode -- --mcp-mode runtime
pnpm opencode -- --mcp-mode full
```

如果PATH里的opencode已经是Hub包装器，直接调用该包装器时可传相同参数；从源码启动时应按[OpenCode指南](OPENCODE_HUB.md)设置原生binary以免包装器递归。

runtime保留三个现有名称：搜索未知Skill、`skill_read`读取精确名称、`skill_files`列出附件。默认Top-3，首段8000字符；续读使用nextOffset并核对hash，按任务需要读取。候选description保持原意，不为省字符截断触发条件。管理/目录全库浏览使用full模式、CLI或Web。

## 可复现测量

```bash
pnpm build
pnpm benchmark:mcp
```

只使用临时合成库、真实stdio握手，报告`outputs/mcp-surface-benchmark.json`。10/100/1000 Skill均验证入口大小固定；当前修正英文文案后full为5442字节、runtime为2262字节（旧版2263），减少约58.4%。这是序列化协议定义/指引的字节，不是模型实际提示或Token节省率。

真实模型试验需要显式选择模型，可产生费用：

```bash
OPENCODE_NATIVE_BIN=/absolute/path/to/native/opencode pnpm benchmark:opencode provider/model
```

脚本保留现有provider配置，使用隔离Hub及100个合成Skill，对两种Hub-only模式分别执行求和验收与普通算术；不调用业务Skill。输出`outputs/opencode-runtime-comparison-latest.json`，只有合成答案/工具名和原始step_finish用量，没有私人Skill正文或凭据。缺失Token字段为null；代理返回cost=0不能证明真实计费免费。

2026-10-12，`cliproxyapi/gemini-3.8-flash-high`一次完整脚本运行结果：

| 任务 | full首请求input | runtime首请求input | full各步input之和 | runtime各步input之和 | 验收 |
|------|------------------|--------------------|-------------------|----------------------|------|
| 求和与验收标记 | 6512 | 5521 | 29318 | 24707 | 两种模式成功，均3次Hub工具调用 |
| 普通2+2 | 6484 | 5495 | 6484 | 5495 | 两种模式成功，均无Hub调用 |

首请求报告input约低15%，只适用于这次试验。各步输入之和会重复计入对话历史，不是上下文窗口大小。缓存读写均报告0，未获取Skill/工具细分Token；延迟和质量只有单次样本。第一次临时试验也通过，但不与本次脚本数据混算成通用节省率。

## 下一阶段验收

本轮已补[召回草案、Native三模式试验与Codex隔离发现](../research/RUNTIME_REVIEW_20261012.md)。Native基线首请求报告input23347→5483，但仅两任务，且后续缓存差异明显；不替代下面的完整质量/费用验收。

- Native、Hybrid、Hub-only必须使用同模型、同任务、相同非Skill工具和项目；分别验证实际可见Skill目录，不能仅看配置文件。
- 统计首请求/累计输入、缓存读写、工具Schema、正文加载、重复读取与长会话增长；宿主未提供细分数据时保留未知。
- 在含普通任务和Skill必需任务的标注集上测Recall@5、激活精度、任务成功和端到端延迟，先基线再设门槛；不能用两条任务宣布95%召回或质量等价。
- Codex以隔离测试配置验证用户/项目/插件/系统范围；确认安全和可恢复后再推进个人配置切换，不能把OpenCode结果外推。
