/**
 * Ollama 本地推理 Provider：/api/chat、/api/embed、/api/tags。
 * 适用于本地部署的开源模型（qwen、llama、bge-m3 等），零外发、零成本。
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

interface OllamaChatResponse {
  message?: { content?: unknown };
  model?: string;
}

interface OllamaEmbedResponse {
  embeddings?: unknown;
  model?: string;
}

interface OllamaTagsResponse {
  models?: { name?: unknown }[];
}

export class OllamaProvider implements LlmProvider {
  readonly id: string;
  readonly type = "ollama" as const;
  private readonly cfg: LlmProviderConfig;

  constructor(cfg: LlmProviderConfig) {
    this.cfg = cfg;
    this.id = cfg.id;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const model = requireModel(this.cfg, options.model, "chat");
    const res = (await postJson(this.cfg, `${this.cfg.baseUrl}/api/chat`, {
      model,
      messages,
      stream: false,
      options: {
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
      },
    })) as OllamaChatResponse;
    const content = res.message?.content;
    if (typeof content !== "string") {
      throw new LlmError(
        "E_LLM_BAD_RESPONSE",
        `Ollama 响应缺少 message.content（${this.id}）`,
        "请确认 Ollama 版本 ≥ 0.1.14 且模型已拉取（ollama pull <model>）。",
      );
    }
    return { content, model: res.model ?? model };
  }

  async embed(texts: string[], model?: string): Promise<EmbedResult> {
    const resolved = requireModel(this.cfg, model, "embed");
    if (texts.length === 0) {
      throw new LlmError("E_LLM_NOT_CONFIGURED", "embed 调用需要至少一段文本");
    }
    const res = (await postJson(this.cfg, `${this.cfg.baseUrl}/api/embed`, {
      model: resolved,
      input: texts,
    })) as OllamaEmbedResponse;
    const vectors = res.embeddings;
    if (
      !Array.isArray(vectors) ||
      vectors.length !== texts.length ||
      !vectors.every((v) => Array.isArray(v) && v.every((n) => typeof n === "number"))
    ) {
      throw new LlmError(
        "E_LLM_BAD_RESPONSE",
        `Ollama embedding 响应格式异常（${this.id}）`,
        "请确认 Ollama ≥ 0.4 且 embed_model 已拉取（如 ollama pull bge-m3）。",
      );
    }
    const typed = vectors as number[][];
    return { vectors: typed, model: res.model ?? resolved, dimensions: typed[0]?.length ?? 0 };
  }

  async probe(): Promise<LlmProbeResult> {
    const started = Date.now();
    try {
      const res = (await getJson(this.cfg, `${this.cfg.baseUrl}/api/tags`)) as OllamaTagsResponse;
      const models = (res.models ?? [])
        .map((m) => m.name)
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
