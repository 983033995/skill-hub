/**
 * OpenAI 兼容 Provider：适用于 OpenAI 官方及一切兼容 /v1/chat/completions、
 * /v1/embeddings、/v1/models 协议的第三方服务（Azure 代理、one-api、
 * CLIProxyAPI、DeepSeek、Moonshot 等）。
 */

import { getJson, postJson, requireModel } from "./http.js";
import {
  LlmError,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type EmbedResult,
  type LlmProbeResult,
  type LlmProvider,
  type LlmProviderConfig,
} from "./types.js";

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
  model?: string;
}

interface EmbeddingsResponse {
  data?: { embedding?: unknown }[];
  model?: string;
}

interface ModelsResponse {
  data?: { id?: unknown }[];
}

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly id: string;
  readonly type = "openai-compatible" as const;
  private readonly cfg: LlmProviderConfig;

  constructor(cfg: LlmProviderConfig) {
    this.cfg = cfg;
    this.id = cfg.id;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = requireModel(this.cfg, options.model, "chat");
    const res = (await postJson(this.cfg, `${this.cfg.baseUrl}/chat/completions`, {
      model,
      messages,
      stream: false,
      ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    })) as ChatCompletionResponse;
    const content = res.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new LlmError(
        "E_LLM_BAD_RESPONSE",
        `模型服务响应缺少 choices[0].message.content（${this.id}）`,
        "请确认该服务兼容 OpenAI chat completions 协议。",
      );
    }
    return { content, model: res.model ?? model };
  }

  async embed(texts: string[], model?: string): Promise<EmbedResult> {
    const resolved = requireModel(this.cfg, model, "embed");
    if (texts.length === 0) {
      throw new LlmError("E_LLM_NOT_CONFIGURED", "embed 调用需要至少一段文本");
    }
    const res = (await postJson(this.cfg, `${this.cfg.baseUrl}/embeddings`, {
      model: resolved,
      input: texts,
    })) as EmbeddingsResponse;
    const vectors = (res.data ?? []).map((d) => d.embedding);
    if (
      vectors.length !== texts.length ||
      !vectors.every((v) => Array.isArray(v) && v.every((n) => typeof n === "number"))
    ) {
      throw new LlmError(
        "E_LLM_BAD_RESPONSE",
        `模型服务 embedding 响应格式异常（${this.id}）`,
        "请确认该服务兼容 OpenAI embeddings 协议。",
      );
    }
    const typed = vectors as number[][];
    return { vectors: typed, model: res.model ?? resolved, dimensions: typed[0]?.length ?? 0 };
  }

  async probe(): Promise<LlmProbeResult> {
    const started = Date.now();
    try {
      const res = (await getJson(this.cfg, `${this.cfg.baseUrl}/models`)) as ModelsResponse;
      const models = (res.data ?? [])
        .map((m) => m.id)
        .filter((v): v is string => typeof v === "string")
        .slice(0, 20);
      return { ok: true, latencyMs: Date.now() - started, models };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof LlmError ? `${err.message}${err.hint ? `（${err.hint}）` : ""}` : String(err),
      };
    }
  }
}
