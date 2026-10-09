/** llm 可选增强层对外出口。 */

export {
  findModelsConfigPath,
  interpolateEnv,
  MODELS_CONFIG_FILENAMES,
  parseModelsYaml,
  pickDefaultProvider,
  resolveLlmConfig,
} from "./config.js";
export { createLlmProvider, getLlmStatus, requireLlmProvider } from "./registry.js";
export type { LlmStatusOptions } from "./registry.js";
export { OllamaProvider } from "./ollama.js";
export { OpenAiCompatibleProvider } from "./openai-compatible.js";
export {
  LLM_ERROR_CODES,
  LLM_PROVIDER_TYPES,
  LlmError,
} from "./types.js";
export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
  LlmErrorCode,
  LlmModelsConfig,
  LlmProbeResult,
  LlmProvider,
  LlmProviderConfig,
  LlmProviderType,
  LlmStatus,
} from "./types.js";
