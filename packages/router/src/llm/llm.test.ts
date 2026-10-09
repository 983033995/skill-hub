import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLlmProvider,
  getLlmStatus,
  interpolateEnv,
  LlmError,
  parseModelsYaml,
  requireLlmProvider,
  resolveLlmConfig,
} from "./index.js";
import type { LlmProviderConfig } from "./index.js";

const YAML_EXAMPLE = `
# skill-hub 模型配置示例
default: local
providers:
  - id: local
    type: ollama
    base_url: http://127.0.0.1:11434
    model: qwen3:8b
    embed_model: bge-m3
    timeout_ms: 20000
  - id: cloud
    type: openai-compatible
    base_url: https://api.openai.com/v1
    api_key: \${TEST_LLM_KEY}
    model: gpt-4o-mini
    embed_model: text-embedding-3-small
    headers:
      X-Team: skill-hub
`;

function providerCfg(overrides: Partial<LlmProviderConfig> = {}): LlmProviderConfig {
  return {
    id: "test",
    type: "openai-compatible",
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "gpt-4o-mini",
    timeoutMs: 15000,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "skill-hub-llm-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(home, { recursive: true, force: true });
});

describe("llm 配置解析", () => {
  it("解析 YAML 示例：多 provider + 嵌套 headers + 环境变量插值", async () => {
    const parsed = parseModelsYaml(YAML_EXAMPLE, "test");
    expect(parsed.default).toBe("local");
    const providers = parsed.providers as Record<string, unknown>[];
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ id: "local", type: "ollama", embed_model: "bge-m3" });
    expect((providers[1].headers as Record<string, string>)["X-Team"]).toBe("skill-hub");

    const config = await resolveLlmConfig({ SKILL_HUB_HOME: home, TEST_LLM_KEY: "sk-real" } as NodeJS.ProcessEnv);
    expect(config).toBeNull(); // 目录下还没有文件

    await writeFile(path.join(home, "models.yaml"), YAML_EXAMPLE);
    const loaded = await resolveLlmConfig({ SKILL_HUB_HOME: home, TEST_LLM_KEY: "sk-real" } as NodeJS.ProcessEnv);
    expect(loaded?.defaultProvider).toBe("local");
    expect(loaded?.providers).toHaveLength(2);
    expect(loaded?.providers[1].apiKey).toBe("sk-real");
    expect(loaded?.providers[0].timeoutMs).toBe(20000);
  });

  it("支持 models.json 与 SKILL_HUB_MODELS_CONFIG 显式路径", async () => {
    const file = path.join(home, "custom.json");
    await writeFile(
      file,
      JSON.stringify({
        default: "p1",
        providers: [{ id: "p1", type: "ollama", base_url: "http://127.0.0.1:11434" }],
      }),
    );
    const config = await resolveLlmConfig({ SKILL_HUB_HOME: home, SKILL_HUB_MODELS_CONFIG: file } as NodeJS.ProcessEnv);
    expect(config?.source).toBe(file);
    expect(config?.providers[0].timeoutMs).toBe(15000); // 默认超时
  });

  it("环境变量快捷配置优先于文件", async () => {
    await writeFile(path.join(home, "models.yaml"), YAML_EXAMPLE);
    const config = await resolveLlmConfig({
      SKILL_HUB_HOME: home,
      SKILL_HUB_LLM_TYPE: "ollama",
      SKILL_HUB_LLM_BASE_URL: "http://127.0.0.1:11434/",
      SKILL_HUB_LLM_MODEL: "qwen3:8b",
    } as NodeJS.ProcessEnv);
    expect(config?.source).toBe("env");
    expect(config?.providers[0]).toMatchObject({ id: "default", type: "ollama", model: "qwen3:8b" });
    expect(config?.providers[0].baseUrl).toBe("http://127.0.0.1:11434"); // 尾斜杠归一化
  });

  it("未配置时返回 null（disabled，不是错误）", async () => {
    await expect(resolveLlmConfig({ SKILL_HUB_HOME: home } as NodeJS.ProcessEnv)).resolves.toBeNull();
  });

  it("配置错误显式报 E_CONFIG：坏类型 / 重复 id / 未解析的 ${VAR} / 坏 URL", async () => {
    const bad = async (yaml: string, env: NodeJS.ProcessEnv = {} as NodeJS.ProcessEnv) => {
      await writeFile(path.join(home, "models.yaml"), yaml);
      return resolveLlmConfig({ ...env, SKILL_HUB_HOME: home } as NodeJS.ProcessEnv);
    };
    await expect(
      bad("providers:\n  - id: a\n    type: vllm\n    base_url: http://x"),
    ).rejects.toThrow(/type 不支持/);
    await expect(
      bad(
        "providers:\n  - id: a\n    type: ollama\n    base_url: http://x\n  - id: a\n    type: ollama\n    base_url: http://y",
      ),
    ).rejects.toThrow(/id 重复/);
    await expect(
      bad("providers:\n  - id: a\n    type: openai-compatible\n    base_url: http://x\n    api_key: ${MISSING_VAR}"),
    ).rejects.toThrow(/未定义的环境变量/);
    await expect(
      bad("providers:\n  - id: a\n    type: ollama\n    base_url: ftp://x"),
    ).rejects.toThrow(/base_url/);
  });

  it("interpolateEnv 保留未定义变量的原样", () => {
    expect(interpolateEnv("${A}-x-${B}", { A: "1" } as NodeJS.ProcessEnv)).toBe("1-x-${B}");
  });
});

describe("llm provider 调用（mock fetch）", () => {
  it("openai-compatible chat：正确 payload、Authorization 头与解析", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "你好" } }], model: "gpt-4o-mini" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLlmProvider(providerCfg());
    const result = await provider.chat([{ role: "user", content: "hi" }], { temperature: 0.2 });
    expect(result.content).toBe("你好");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.2);
  });

  it("openai-compatible embed：返回向量与维度", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
      ),
    );
    const provider = createLlmProvider(providerCfg({ embedModel: "text-embedding-3-small" }));
    const result = await provider.embed(["a", "b"]);
    expect(result.dimensions).toBe(2);
    expect(result.vectors).toHaveLength(2);
  });

  it("ollama chat / probe 走 /api 路径", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: { content: "本地回答" } }))
      .mockResolvedValueOnce(jsonResponse({ models: [{ name: "qwen3:8b" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLlmProvider(
      providerCfg({ type: "ollama", baseUrl: "http://127.0.0.1:11434", apiKey: undefined, model: "qwen3:8b" }),
    );
    const chat = await provider.chat([{ role: "user", content: "hi" }]);
    expect(chat.content).toBe("本地回答");
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("http://127.0.0.1:11434/api/chat");

    const probe = await provider.probe();
    expect(probe.ok).toBe(true);
    expect(probe.models).toContain("qwen3:8b");
  });

  it("错误分类友好：401→E_LLM_AUTH，超时→E_LLM_TIMEOUT，断连→E_LLM_UNAVAILABLE", async () => {
    const provider = createLlmProvider(providerCfg());

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "bad key" } }, 401)));
    await expect(provider.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({
      code: "E_LLM_AUTH",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" })));
    await expect(provider.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({
      code: "E_LLM_TIMEOUT",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await provider.chat([{ role: "user", content: "x" }]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe("E_LLM_UNAVAILABLE");
    expect((err as LlmError).hint).toMatch(/base_url/);
  });

  it("缺模型名时报 E_LLM_NOT_CONFIGURED 并给出指引", async () => {
    const provider = createLlmProvider(providerCfg({ model: undefined }));
    await expect(provider.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({
      code: "E_LLM_NOT_CONFIGURED",
    });
  });
});

describe("llm status 降级行为", () => {
  it("未配置 → disabled，不抛错", async () => {
    const status = await getLlmStatus({ env: { SKILL_HUB_HOME: home } as NodeJS.ProcessEnv });
    expect(status).toMatchObject({ configured: false, state: "disabled", provider: null });
    expect(status.availableTypes).toContain("ollama");
  });

  it("配置非法 → misconfigured，错误内联返回", async () => {
    await writeFile(path.join(home, "models.yaml"), "providers:\n  - id: a\n    type: bad\n    base_url: http://x");
    const status = await getLlmStatus({ env: { SKILL_HUB_HOME: home } as NodeJS.ProcessEnv });
    expect(status.state).toBe("misconfigured");
    expect(status.error?.message).toMatch(/type 不支持/);
  });

  it("probe 成功 → ready；probe 失败 → unreachable + hint，且不泄漏 apiKey", async () => {
    await writeFile(path.join(home, "models.yaml"), YAML_EXAMPLE);
    const env = { SKILL_HUB_HOME: home, TEST_LLM_KEY: "sk-secret" } as NodeJS.ProcessEnv;

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: "qwen3:8b" }] })));
    const ok = await getLlmStatus({ env, probe: true });
    expect(ok.state).toBe("ready");
    expect(ok.probe?.models).toContain("qwen3:8b");
    expect(JSON.stringify(ok)).not.toContain("sk-secret");
    expect(ok.provider?.apiKeyConfigured).toBe(false); // 默认 provider 是 local(ollama)，无 key

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const down = await getLlmStatus({ env, probe: true });
    expect(down.state).toBe("unreachable");
    expect(down.error?.hint).toMatch(/核心功能/);
  });

  it("requireLlmProvider 未配置时抛 E_LLM_NOT_CONFIGURED（供消费方降级）", async () => {
    await expect(
      requireLlmProvider({ SKILL_HUB_HOME: home } as NodeJS.ProcessEnv),
    ).rejects.toMatchObject({ code: "E_LLM_NOT_CONFIGURED" });
  });
});
