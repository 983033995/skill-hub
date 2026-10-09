/**
 * llm 模块类型定义（可选增强层）。
 *
 * 设计约束：
 * - 未配置时整条核心链路（BM25 路由/列表/详情）不受任何影响；
 * - Provider 仅通过本接口消费，新增模型服务只需实现 LlmProvider 并登记到 registry；
 * - 任何情况下 apiKey 不回传出本模块（status 只暴露 apiKeyConfigured 布尔值）。
 */

/** 已实现的 Provider 类型。新增服务在此扩展。 */
export const LLM_PROVIDER_TYPES = ["openai-compatible", "ollama"] as const;
export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];

/** 单个模型服务配置。 */
export interface LlmProviderConfig {
  /** 配置内唯一标识，如 "local" / "cloud"。 */
  id: string;
  type: LlmProviderType;
  /** 服务根地址，如 https://api.openai.com/v1 或 http://127.0.0.1:11434。 */
  baseUrl: string;
  /** 可选；支持 ${ENV_VAR} 插值。Ollama 本地服务通常不需要。 */
  apiKey?: string;
  /** 对话模型名；缺省时调用方必须显式传入。 */
  model?: string;
  /** 向量模型名（语义路由用）；缺省表示该服务不提供 embedding。 */
  embedModel?: string;
  /** 单次请求超时毫秒，默认 15000，范围 1000-120000。 */
  timeoutMs: number;
  /** 额外请求头（扩展用，仅 JSON 配置或 YAML 一级嵌套 map）。 */
  headers?: Record<string, string>;
}

/** 整份模型配置（可含多个服务，defaultProvider 指定默认）。 */
export interface LlmModelsConfig {
  defaultProvider?: string;
  providers: LlmProviderConfig[];
  /** 配置来源描述（文件路径或 "env"），用于状态展示与报错定位。 */
  source: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  model: string;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

/** 健康探测结果；ok=false 时 error 为面向用户的友好描述。 */
export interface LlmProbeResult {
  ok: boolean;
  latencyMs: number;
  models?: string[];
  error?: string;
}

/**
 * 模型服务统一抽象。
 * 实现方必须保证：所有网络/协议错误都包装为 LlmError 抛出，不泄漏原始异常。
 */
export interface LlmProvider {
  readonly id: string;
  readonly type: LlmProviderType;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
  embed(texts: string[], model?: string): Promise<EmbedResult>;
  probe(): Promise<LlmProbeResult>;
}

/** LLM 运行时错误码（区别于 SkillHubError 的配置类错误）。 */
export const LLM_ERROR_CODES = [
  "E_LLM_NOT_CONFIGURED",
  "E_LLM_UNAVAILABLE",
  "E_LLM_AUTH",
  "E_LLM_TIMEOUT",
  "E_LLM_BAD_RESPONSE",
] as const;
export type LlmErrorCode = (typeof LLM_ERROR_CODES)[number];

/**
 * LLM 调用错误：message 面向用户，hint 给出可操作的修复建议。
 */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly hint?: string;

  constructor(code: LlmErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "LlmError";
    this.code = code;
    this.hint = hint;
  }
}

/** 状态查询返回（供 Web/CLI 展示；永不因未配置而抛错）。 */
export interface LlmStatus {
  configured: boolean;
  state: "disabled" | "ready" | "unreachable" | "misconfigured";
  /** 配置来源：文件路径或 "env"。 */
  source: string | null;
  provider: {
    id: string;
    type: LlmProviderType;
    baseUrl: string;
    model: string | null;
    embedModel: string | null;
    apiKeyConfigured: boolean;
    timeoutMs: number;
  } | null;
  /** 配置中全部 provider id。 */
  providers: string[];
  probe?: LlmProbeResult;
  error: { code: string; message: string; hint: string | null } | null;
  /** 当前代码已支持的 provider 类型（供配置参考）。 */
  availableTypes: LlmProviderType[];
}
