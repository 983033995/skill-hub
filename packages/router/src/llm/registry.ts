/**
 * llm registry：Provider 工厂与状态查询。
 *
 * 降级原则：
 * - getLlmStatus 永不因"未配置"抛错（disabled 是正常状态）；
 * - 配置存在但非法 → state=misconfigured，错误信息内联返回，不中断调用方；
 * - probe 失败 → state=unreachable，附友好 hint；
 * 核心路由链路只在显式需要模型时才调用 requireLlmProvider。
 */

import { SkillHubError } from "@skill-hub/shared";
import { pickDefaultProvider, resolveLlmConfig } from "./config.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import {
  LLM_PROVIDER_TYPES,
  LlmError,
  type LlmModelsConfig,
  type LlmProvider,
  type LlmProviderConfig,
  type LlmStatus,
} from "./types.js";

/** Provider 工厂：新增模型服务在此登记一个分支即可。 */
export function createLlmProvider(cfg: LlmProviderConfig): LlmProvider {
  switch (cfg.type) {
    case "openai-compatible":
      return new OpenAiCompatibleProvider(cfg);
    case "ollama":
      return new OllamaProvider(cfg);
    default:
      throw new SkillHubError({
        code: "E_CONFIG",
        message: `未知的 provider 类型: ${String(cfg.type)}（可选 ${LLM_PROVIDER_TYPES.join(" | ")}）`,
      });
  }
}

/**
 * 取默认 Provider 实例。仅在线上消费方（如语义路由）调用：
 * 未配置时抛 LlmError(E_LLM_NOT_CONFIGURED)，调用方应捕获并降级到确定性路径。
 */
export async function requireLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ provider: LlmProvider; config: LlmModelsConfig }> {
  const config = await resolveLlmConfig(env);
  if (!config) {
    throw new LlmError(
      "E_LLM_NOT_CONFIGURED",
      "未配置模型服务，增强能力不可用",
      "复制 configs/models.yaml 到 ~/.skill-hub/models.yaml，或设置 SKILL_HUB_LLM_* 环境变量；不配置不影响核心功能。",
    );
  }
  return { provider: createLlmProvider(pickDefaultProvider(config)), config };
}

export interface LlmStatusOptions {
  /** 为 true 时实际请求一次服务做健康探测（有网络开销）。 */
  probe?: boolean;
  env?: NodeJS.ProcessEnv;
}

/** 状态查询：供 Web/CLI 展示，永不抛出。 */
export async function getLlmStatus(options: LlmStatusOptions = {}): Promise<LlmStatus> {
  const env = options.env ?? process.env;
  const base: LlmStatus = {
    configured: false,
    state: "disabled",
    source: null,
    provider: null,
    providers: [],
    error: null,
    availableTypes: [...LLM_PROVIDER_TYPES],
  };

  let config: LlmModelsConfig | null;
  try {
    config = await resolveLlmConfig(env);
  } catch (err) {
    // 配置存在但非法：降级展示，不影响主流程
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      configured: true,
      state: "misconfigured",
      source: err instanceof SkillHubError ? String(err.details?.source ?? "unknown") : "unknown",
      error: {
        code: err instanceof SkillHubError ? err.code : "E_INTERNAL",
        message,
        hint: "修正后自动生效；配置错误期间核心功能不受影响。参考 configs/models.yaml。",
      },
    };
  }

  if (!config) return base;

  const cfg = pickDefaultProvider(config);
  const status: LlmStatus = {
    ...base,
    configured: true,
    state: "ready",
    source: config.source,
    provider: {
      id: cfg.id,
      type: cfg.type,
      baseUrl: cfg.baseUrl,
      model: cfg.model ?? null,
      embedModel: cfg.embedModel ?? null,
      apiKeyConfigured: Boolean(cfg.apiKey),
      timeoutMs: cfg.timeoutMs,
    },
    providers: config.providers.map((p) => p.id),
  };

  if (options.probe) {
    const probe = await createLlmProvider(cfg).probe();
    status.probe = probe;
    if (!probe.ok) {
      status.state = "unreachable";
      status.error = {
        code: "E_LLM_UNAVAILABLE",
        message: probe.error ?? "模型服务不可达",
        hint: "核心功能不依赖模型，可继续正常使用；需要增强能力时请检查服务状态。",
      };
    }
  }
  return status;
}
