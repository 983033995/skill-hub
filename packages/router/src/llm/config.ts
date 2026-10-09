/**
 * llm 配置加载：models.yaml / models.json / SKILL_HUB_LLM_* 环境变量。
 *
 * 解析顺序（先命中先生效）：
 *   1. 环境变量快捷配置（SKILL_HUB_LLM_TYPE 或 SKILL_HUB_LLM_BASE_URL 存在即启用）
 *   2. SKILL_HUB_MODELS_CONFIG 指定的文件
 *   3. ~/.skill-hub/models.yaml → ~/.skill-hub/models.json
 *   4. 都没有 → 返回 null（disabled，属正常状态，不是错误）
 *
 * 与 taxonomy 一致：文件存在但内容非法时显式抛 SkillHubError(E_CONFIG)，
 * 不静默回退；由调用方（status 查询）捕获并降级展示。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDefaultHubHome, SkillHubError } from "@skill-hub/shared";
import {
  LLM_PROVIDER_TYPES,
  type LlmModelsConfig,
  type LlmProviderConfig,
  type LlmProviderType,
} from "./types.js";

export const MODELS_CONFIG_FILENAMES = ["models.yaml", "models.json"] as const;

const DEFAULT_TIMEOUT_MS = 15000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;

/** 字符串中的 ${VAR} 用环境变量替换；未定义的变量保留原样，由校验阶段报错。 */
export function interpolateEnv(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (raw, name: string) => {
    const v = env[name];
    return v === undefined ? raw : v;
  });
}

/** 环境变量快捷配置：无需文件即可接入一个服务。 */
function configFromEnv(env: NodeJS.ProcessEnv): LlmModelsConfig | null {
  const type = env.SKILL_HUB_LLM_TYPE?.trim();
  const baseUrl = env.SKILL_HUB_LLM_BASE_URL?.trim();
  if (!type && !baseUrl) return null;
  return validateConfig(
    {
      defaultProvider: env.SKILL_HUB_LLM_ID?.trim() || "default",
      providers: [
        {
          id: env.SKILL_HUB_LLM_ID?.trim() || "default",
          type: type || "openai-compatible",
          base_url: baseUrl || "",
          api_key: env.SKILL_HUB_LLM_API_KEY,
          model: env.SKILL_HUB_LLM_MODEL,
          embed_model: env.SKILL_HUB_LLM_EMBED_MODEL,
          timeout_ms: env.SKILL_HUB_LLM_TIMEOUT_MS,
        },
      ],
      source: "env",
    },
    env,
  );
}

function parseTimeout(raw: string | undefined, field: string): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_TIMEOUT_MS;
  if (!/^\d+$/.test(raw.trim())) {
    throw new SkillHubError({ code: "E_CONFIG", message: `${field} 必须是正整数毫秒: ${raw}` });
  }
  const value = Number(raw);
  if (value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `${field} 越界（${MIN_TIMEOUT_MS}-${MAX_TIMEOUT_MS}ms）: ${value}`,
    });
  }
  return value;
}

/* ── YAML 子集解析（与 profile/taxonomy 同一惯例，无外部依赖） ──────────
 * 支持形态：
 *   default: local
 *   providers:
 *     - id: local
 *       type: ollama
 *       base_url: http://127.0.0.1:11434
 *       headers:            # 可选一级嵌套 map
 *         X-Custom: foo
 */
export function parseModelsYaml(raw: string, source: string): Record<string, unknown> {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const root: Record<string, unknown> = {};
  const providers: Record<string, unknown>[] = [];
  let current: Record<string, unknown> | null = null;
  let currentNestedKey: string | null = null;
  let inProviders = false;

  const fail = (lineNo: number, msg: string): never => {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `模型配置解析失败（${source} 第 ${lineNo} 行）: ${msg}`,
      details: { source, line: lineNo },
    });
  };

  const keyValue = (text: string): { key: string; value: string } | null => {
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(text);
    const key = m?.[1];
    const value = m?.[2];
    if (key === undefined || value === undefined) return null;
    return { key, value };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const line = lines[i] ?? "";
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.length - line.trimStart().length;
    const text = line.trim();

    if (indent === 0) {
      current = null;
      currentNestedKey = null;
      if (text === "providers:") {
        inProviders = true;
        continue;
      }
      inProviders = false;
      const kv = keyValue(text) ?? fail(lineNo, `无法解析: ${text}`);
      root[kv.key] = stripQuotes(kv.value);
      continue;
    }

    if (!inProviders) fail(lineNo, "仅 providers 下允许缩进内容");

    if (text.startsWith("- ")) {
      const kv = keyValue(text.slice(2)) ?? fail(lineNo, "列表项首行必须是 '- key: value'");
      current = { [kv.key]: stripQuotes(kv.value) };
      currentNestedKey = null;
      providers.push(current);
      continue;
    }

    if (!current) fail(lineNo, "providers 下必须先以 '- id: ...' 开始一个服务条目");
    const cur: Record<string, unknown> = current ?? {};

    const kv = keyValue(text) ?? fail(lineNo, `无法解析: ${text}`);

    if (kv.value === "") {
      // 一级嵌套 map（如 headers:）
      cur[kv.key] = {};
      currentNestedKey = kv.key;
      continue;
    }
    const nested = currentNestedKey ? cur[currentNestedKey] : undefined;
    if (currentNestedKey && indent >= 6 && typeof nested === "object" && nested !== null) {
      (nested as Record<string, unknown>)[kv.key] = stripQuotes(kv.value);
      continue;
    }
    currentNestedKey = null;
    cur[kv.key] = stripQuotes(kv.value);
  }

  if (providers.length > 0) root.providers = providers;
  return root;
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/* ── 结构校验与归一化 ─────────────────────────────────────────────── */

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function validateConfig(
  raw: { defaultProvider?: unknown; providers: unknown; source: string },
  env: NodeJS.ProcessEnv,
): LlmModelsConfig {
  const { source } = raw;
  const fail = (msg: string): never => {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `模型配置无效（${source}）: ${msg}。参考 configs/models.yaml 示例。`,
      details: { source },
    });
  };

  const rawProviders: unknown = raw.providers;
  if (!Array.isArray(rawProviders) || rawProviders.length === 0) {
    fail("providers 必须是非空列表");
  }
  const providerItems = rawProviders as Record<string, unknown>[];
  if (providerItems.length > 16) fail("providers 最多 16 个");

  const seen = new Set<string>();
  const providers = providerItems.map((item, idx) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      fail(`providers[${idx}] 必须是 map`);
    }
    const id = asString(item.id) ?? fail(`providers[${idx}] 缺少 id`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) fail(`id 非法: ${id}`);
    if (seen.has(id)) fail(`id 重复: ${id}`);
    seen.add(id);

    const typeRaw = asString(item.type) ?? fail(`providers[${idx}].type 缺失`);
    if (!(LLM_PROVIDER_TYPES as readonly string[]).includes(typeRaw)) {
      fail(`providers[${idx}].type 不支持: ${typeRaw}（可选 ${LLM_PROVIDER_TYPES.join(" | ")}）`);
    }

    const baseUrlRaw = asString(item.base_url) ?? fail(`providers[${idx}].base_url 缺失`);
    const baseUrl = interpolateEnv(baseUrlRaw, env).replace(/\/+$/, "");
    if (/\$\{[^}]+\}/.test(baseUrl)) fail(`providers[${idx}].base_url 引用了未定义的环境变量: ${baseUrlRaw}`);
    try {
      const u = new URL(baseUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
    } catch {
      fail(`providers[${idx}].base_url 不是合法的 http(s) 地址: ${baseUrl}`);
    }

    const apiKeyRaw = asString(item.api_key);
    const apiKey = apiKeyRaw ? interpolateEnv(apiKeyRaw, env) : undefined;
    if (apiKey && /\$\{[^}]+\}/.test(apiKey)) {
      fail(`providers[${idx}].api_key 引用了未定义的环境变量: ${apiKeyRaw}`);
    }

    let headers: Record<string, string> | undefined;
    if (item.headers !== undefined) {
      if (typeof item.headers !== "object" || item.headers === null || Array.isArray(item.headers)) {
        fail(`providers[${idx}].headers 必须是 map`);
      }
      headers = {};
      for (const [k, v] of Object.entries(item.headers as Record<string, unknown>)) {
        if (typeof v !== "string") fail(`providers[${idx}].headers.${k} 必须是字符串`);
        headers[k] = interpolateEnv(v as string, env);
      }
    }

    return {
      id,
      type: typeRaw as LlmProviderType,
      baseUrl,
      apiKey,
      model: asString(item.model),
      embedModel: asString(item.embed_model),
      timeoutMs: parseTimeout(
        item.timeout_ms === undefined ? undefined : String(item.timeout_ms),
        `providers[${idx}].timeout_ms`,
      ),
      headers,
    } satisfies LlmProviderConfig;
  });

  let defaultProvider = asString(raw.defaultProvider);
  if (defaultProvider && !seen.has(defaultProvider)) {
    fail(`default 指向不存在的 provider: ${defaultProvider}`);
  }
  defaultProvider ??= providers[0]?.id ?? fail("providers 为空");

  return { defaultProvider, providers, source };
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** 定位配置文件：显式路径 > HUB_HOME 下默认文件名。 */
export async function findModelsConfigPath(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  const explicit = env.SKILL_HUB_MODELS_CONFIG?.trim();
  if (explicit) {
    const content = await readIfExists(explicit);
    if (content === null) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: `SKILL_HUB_MODELS_CONFIG 指定的文件不存在: ${explicit}`,
      });
    }
    return explicit;
  }
  const home = getDefaultHubHome(env);
  for (const name of MODELS_CONFIG_FILENAMES) {
    const candidate = path.join(home, name);
    if ((await readIfExists(candidate)) !== null) return candidate;
  }
  return null;
}

/**
 * 解析模型配置。未配置返回 null（正常 disabled 状态）；
 * 配置存在但非法时抛 SkillHubError(E_CONFIG)。
 */
export async function resolveLlmConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<LlmModelsConfig | null> {
  const fromEnv = configFromEnv(env);
  if (fromEnv) return fromEnv;

  const file = await findModelsConfigPath(env);
  if (!file) return null;

  const content = (await readIfExists(file)) ?? "";
  let parsed: Record<string, unknown>;
  if (file.endsWith(".json")) {
    try {
      parsed = JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: `模型配置 JSON 解析失败（${file}）: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    parsed = parseModelsYaml(content, file);
  }
  return validateConfig(
    {
      defaultProvider: parsed.default,
      providers: parsed.providers,
      source: file,
    },
    env,
  );
}

/** 取默认 Provider 配置（defaultProvider 缺省时为第一个）。 */
export function pickDefaultProvider(config: LlmModelsConfig): LlmProviderConfig {
  const id = config.defaultProvider ?? config.providers[0]?.id;
  const found = config.providers.find((p) => p.id === id);
  if (!found) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `模型配置（${config.source}）没有可用的默认 provider`,
    });
  }
  return found;
}
