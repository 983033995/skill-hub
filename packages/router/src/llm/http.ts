/**
 * Provider 共用的 HTTP 助手：超时、错误分类、友好提示。
 * 所有网络/协议异常统一包装为 LlmError，原始异常不向上泄漏。
 */

import { LlmError, type LlmProviderConfig } from "./types.js";

function authHeaders(cfg: LlmProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { ...cfg.headers };
  if (cfg.apiKey && !headers.authorization && !headers.Authorization) {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  return headers;
}

/** 从错误响应体中提取可读信息（OpenAI 风格 {"error":{"message":...}} 或纯文本）。 */
async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: unknown }; message?: unknown };
      const msg = json.error?.message ?? json.message;
      if (typeof msg === "string" && msg.trim()) return msg.slice(0, 300);
    } catch {
      if (text.trim()) return text.trim().slice(0, 300);
    }
  } catch {
    /* 忽略读取失败 */
  }
  return `HTTP ${res.status}`;
}

function classifyHttpError(status: number, detail: string, cfg: LlmProviderConfig): LlmError {
  if (status === 401 || status === 403) {
    return new LlmError(
      "E_LLM_AUTH",
      `模型服务鉴权失败（${cfg.id}）: ${detail}`,
      "请检查 api_key 是否正确、是否过期；本地 Ollama 一般无需 api_key。",
    );
  }
  if (status === 404) {
    return new LlmError(
      "E_LLM_BAD_RESPONSE",
      `模型或接口不存在（${cfg.id}）: ${detail}`,
      "请检查 model / embed_model 名称与 base_url 路径（OpenAI 兼容服务通常以 /v1 结尾）。",
    );
  }
  if (status === 429) {
    return new LlmError(
      "E_LLM_UNAVAILABLE",
      `模型服务限流（${cfg.id}）: ${detail}`,
      "稍后重试，或切换到其他已配置的 provider。",
    );
  }
  return new LlmError(
    "E_LLM_UNAVAILABLE",
    `模型服务返回异常（${cfg.id}, HTTP ${status}）: ${detail}`,
    "请确认服务状态；核心功能不依赖模型，可继续正常使用。",
  );
}

function classifyNetworkError(err: unknown, cfg: LlmProviderConfig): LlmError {
  if (err instanceof LlmError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") {
    return new LlmError(
      "E_LLM_TIMEOUT",
      `模型服务响应超时（${cfg.id}, ${cfg.timeoutMs}ms）: ${cfg.baseUrl}`,
      "可增大 timeout_ms，或检查服务负载与网络。",
    );
  }
  const reason = err instanceof Error ? err.message : String(err);
  return new LlmError(
    "E_LLM_UNAVAILABLE",
    `无法连接模型服务（${cfg.id}）: ${cfg.baseUrl}（${reason.slice(0, 200)}）`,
    cfg.type === "ollama"
      ? "请确认本地服务已启动（如 ollama serve），且 base_url 端口正确（默认 11434）。"
      : "请检查 base_url 与网络连通性；核心功能不依赖模型，可继续正常使用。",
  );
}

async function request(
  cfg: LlmProviderConfig,
  method: "GET" | "POST",
  url: string,
  body?: unknown,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...authHeaders(cfg),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw classifyHttpError(res.status, await extractErrorMessage(res), cfg);
    }
    try {
      return await res.json();
    } catch {
      throw new LlmError(
        "E_LLM_BAD_RESPONSE",
        `模型服务返回了非 JSON 内容（${cfg.id}）: ${url}`,
        "请确认 base_url 指向正确的 API 根路径。",
      );
    }
  } catch (err) {
    throw classifyNetworkError(err, cfg);
  } finally {
    clearTimeout(timer);
  }
}

export function getJson(cfg: LlmProviderConfig, url: string): Promise<unknown> {
  return request(cfg, "GET", url);
}

export function postJson(cfg: LlmProviderConfig, url: string, body: unknown): Promise<unknown> {
  return request(cfg, "POST", url, body);
}

/** 要求 chat 模型名：调用方显式传入 > 配置默认；都没有则友好报错。 */
export function requireModel(cfg: LlmProviderConfig, model: string | undefined, kind: "chat" | "embed"): string {
  const resolved = model ?? (kind === "chat" ? cfg.model : cfg.embedModel);
  if (!resolved) {
    const field = kind === "chat" ? "model" : "embed_model";
    throw new LlmError(
      "E_LLM_NOT_CONFIGURED",
      `provider ${cfg.id} 未配置 ${field}，且调用方未指定模型名`,
      `在 models.yaml 的 providers[].${field} 中补上模型名，或在调用时显式传入。`,
    );
  }
  return resolved;
}
