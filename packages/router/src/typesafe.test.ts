import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import { SkillHubError } from "@skill-hub/shared";
import { createTypeSafeRouter } from "./typesafe.js";
import { routeWithProfile } from "./factory.js";

function skill(name: string, description: string): SkillMeta {
  return {
    name,
    description,
    path: `/private/${name}`,
    hash: `sha256:${name}`,
    mtimeMs: 1,
    keywords: [name],
  };
}

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("TYPESAFE_API_URL", "");
  vi.stubEnv("TYPESAFE_MODEL", "");
  vi.stubEnv("TYPESAFE_MIN_CONFIDENCE", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("TypeSafe Jev router", () => {
  it("sends metadata-only candidates and ranks by Choice probabilities", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: "jev-1.13.0",
          answers: {
            route: {
              type: "choice",
              choice: "s1",
              probabilities: { s0: 0.12, s1: 0.82, __none_of_the_above__: 0.06 },
              confidence: 0.73,
            },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const router = createTypeSafeRouter({ apiKey: "test-key" });
    await router.build([
      skill("copywriting", "Write and improve marketing copy."),
      skill("video-shotcraft", "Create cinematic product videos."),
    ]);
    const results = await router.query({ text: "做一个产品宣传视频", topK: 2 });

    expect(results.map((result) => result.name)).toEqual(["video-shotcraft", "copywriting"]);
    expect(results[0]?.score).toBe(0.82);
    expect(results[0]?.reasons).toContain("typesafe_choice");
    expect(router.getDecision()).toMatchObject({
      kind: "choice",
      selected: "video-shotcraft",
      confidence: 0.73,
      selectedProbability: 0.82,
      noneProbability: 0.06,
      escalationRecommended: false,
    });
    expect(router.getDecision()?.probabilities).toEqual({
      copywriting: 0.12,
      "video-shotcraft": 0.82,
      __none_of_the_above__: 0.06,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      state: unknown;
      questions: { route: { criteria: Record<string, { description?: string }> } };
    };
    expect(body.model).toBe("jev-latest");
    expect(body.state).toEqual({ query: "做一个产品宣传视频", profile: null });
    expect(JSON.stringify(body)).not.toContain("/private/");
    expect(JSON.stringify(body)).not.toContain("sha256:");
    expect(body.questions.route.criteria.s0?.description).toContain("marketing copy");
  });

  it("returns no skills when Jev selects none_of_the_above", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: {
              route: {
                type: "choice",
                choice: "__none_of_the_above__",
                probabilities: { s0: 0.2, __none_of_the_above__: 0.8 },
                confidence: 0.6,
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const router = createTypeSafeRouter({ apiKey: "test-key" });
    await router.build([skill("pdf", "Work with PDF files.")]);
    await expect(router.query({ text: "写一首歌" })).resolves.toEqual([]);
    expect(router.getDecision()).toMatchObject({
      selected: null,
      escalationRecommended: true,
      noneProbability: 0.8,
    });
  });

  it("fails clearly when the API key is missing", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "environment-key-must-not-be-used");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const router = createTypeSafeRouter({ apiKey: "" });
    await router.build([skill("pdf", "Work with PDF files.")]);
    await expect(router.query({ text: "合并 PDF" })).rejects.toMatchObject<Partial<SkillHubError>>({
      code: "E_INDEX",
      message: "Jev 路由未配置 TYPESAFE_API_KEY",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a candidate pool larger than Jev Choice supports", async () => {
    const router = createTypeSafeRouter({ apiKey: "test-key" });
    const candidates = Array.from({ length: 255 }, (_, index) =>
      skill(`skill-${index}`, "fixture"),
    );
    await expect(router.build(candidates)).rejects.toMatchObject<Partial<SkillHubError>>({
      code: "E_INDEX",
    });
  });

  it("rejects a Choice outside the declared candidate set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: {
              route: {
                type: "choice",
                choice: "not-declared",
                probabilities: { s0: 0.8, __none_of_the_above__: 0.2 },
                confidence: 0.6,
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const router = createTypeSafeRouter({ apiKey: "test-key" });
    await router.build([skill("pdf", "Work with PDF files.")]);
    await expect(router.query({ text: "合并 PDF" })).rejects.toMatchObject<Partial<SkillHubError>>({
      code: "E_INDEX",
      message: "Jev 路由响应选择了未声明的 Choice",
    });
  });

  it("recommends escalation using service confidence rather than the winning probability", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: {
              route: {
                type: "choice",
                choice: "s0",
                confidence: 0.6,
                probabilities: { s0: 0.8, __none_of_the_above__: 0.2 },
              },
            },
          }),
        ),
      ),
    );
    const router = createTypeSafeRouter({ apiKey: "test-key", confidenceThreshold: 0.65 });
    await router.build([skill("pdf", "Work with PDF files.")]);
    await router.query({ text: "合并 PDF" });
    expect(router.getDecision()).toMatchObject({
      confidence: 0.6,
      selectedProbability: 0.8,
      escalationRecommended: true,
      threshold: 0.65,
    });
  });

  it.each([
    { s0: 1 },
    { s0: 0.8, unexpected: 0.2 },
    { s0: 0.4, __none_of_the_above__: 0.1 },
    { s0: 0.2, __none_of_the_above__: 0.8 },
    { s0: -0.2, __none_of_the_above__: 1.2 },
  ])("rejects malformed distributions without returning a decision: %j", async (probabilities) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answers: { route: { type: "choice", choice: "s0", confidence: 0.6, probabilities } },
          }),
        ),
      ),
    );
    const router = createTypeSafeRouter({ apiKey: "test-key" });
    await router.build([skill("pdf", "PDF files")]);
    await expect(router.query({ text: "PDF" })).rejects.toMatchObject({ code: "E_INDEX" });
    expect(router.getDecision()).toBeUndefined();
  });

  it.each([undefined, -1, 2, "0.6"])(
    "rejects malformed service confidence: %s",
    async (confidence) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              answers: {
                route: {
                  type: "choice",
                  choice: "s0",
                  confidence,
                  probabilities: { s0: 0.8, __none_of_the_above__: 0.2 },
                },
              },
            }),
          ),
        ),
      );
      const router = createTypeSafeRouter({ apiKey: "test-key" });
      await router.build([skill("pdf", "PDF files")]);
      await expect(router.query({ text: "PDF" })).rejects.toMatchObject({ code: "E_INDEX" });
    },
  );

  it("rejects invalid local thresholds explicitly", () => {
    vi.stubEnv("TYPESAFE_MIN_CONFIDENCE", "invalid");
    expect(() => createTypeSafeRouter()).toThrow("TYPESAFE_MIN_CONFIDENCE");
    expect(() => createTypeSafeRouter({ confidenceThreshold: 2 })).toThrow(
      "TYPESAFE_MIN_CONFIDENCE",
    );
  });

  it("falls back to BM25 when the candidate pool exceeds the Choice limit", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await routeWithProfile({
      text: "pdf",
      engine: "external-typesafe",
      skills: [
        skill("pdf", "PDF files"),
        ...Array.from({ length: 254 }, (_, i) => skill(`other-${i}`, "other")),
      ],
    });
    expect(result).toMatchObject({ engineId: "bm25", degraded: true });
    expect(result.results[0]?.name).toBe("pdf");
    expect(result.degradeReason).toContain("254");
    expect(result.decision).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to BM25 on API failure without fabricating a confidence", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("overloaded", { status: 529 })));
    const result = await routeWithProfile({
      text: "pdf",
      engine: "external-typesafe",
      skills: [skill("pdf", "PDF files")],
    });
    expect(result).toMatchObject({ engineId: "bm25", degraded: true });
    expect(result.results[0]?.name).toBe("pdf");
    expect(result.decision).toBeUndefined();
  });
});
