/**
 * TypeSafe AI / Jev semantic router.
 *
 * Jev receives only Skill metadata and returns a calibrated Choice distribution.
 * The engine is opt-in; callers should keep BM25 as the deterministic fallback.
 */

import type { SkillMeta } from "@skill-hub/core";
import { performance } from "node:perf_hooks";
import { SkillHubError } from "@skill-hub/shared";
import type { RankedSkill, RouteQuery, RouterDecision, RouterEngine } from "./types.js";

const DEFAULT_API_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.65;
const MAX_SKILL_CANDIDATES = 254;
const NONE_ID = "__none_of_the_above__";

interface TypeSafeChoiceAnswer {
  type?: unknown;
  choice?: unknown;
  probabilities?: unknown;
  confidence?: unknown;
}

interface TypeSafeResponse {
  model?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  answers?: {
    route?: TypeSafeChoiceAnswer;
  };
}

export interface TypeSafeRouterOptions {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** 仅用于升级建议，不改变 Jev 的排序结果。 */
  confidenceThreshold?: number;
}

/** Non-sensitive telemetry for the most recent Jev request; never includes query or Skill metadata. */
export interface TypeSafeRequestMetrics {
  readonly model: string | null;
  readonly latencyMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** True means the HTTP response parsed as a JSON object; it does not assert a valid Choice decision. */
  readonly completed: boolean;
}

interface Candidate {
  id: string;
  meta: SkillMeta;
}

const ROUTE_CHOICE_INSTRUCTIONS =
  "Choose the Skill that is most directly useful for completing the user's task. " +
  "Use only the listed candidates. Choose none_of_the_above when no candidate is a reasonable match.";

/** Shared by the live router and local opt-in payload preview. */
export function buildTypeSafeRouteRequestBody(
  q: RouteQuery,
  candidates: Candidate[],
  model: string,
) {
  if (candidates.length > MAX_SKILL_CANDIDATES) {
    throw new SkillHubError({
      code: "E_INDEX",
      message: `Jev Choice 候选数超过 ${MAX_SKILL_CANDIDATES} 个: ${candidates.length}`,
      details: { engineId: "external-typesafe", candidateCount: candidates.length },
    });
  }
  const candidateIds = new Set<string>();
  for (const { id } of candidates) {
    if (id === NONE_ID || candidateIds.has(id)) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev Choice 候选 ID 必须唯一，且不能使用 none 保留 ID",
        details: { engineId: "external-typesafe" },
      });
    }
    candidateIds.add(id);
  }
  const criteria: Record<string, unknown> = Object.fromEntries(
    candidates.map(({ id, meta }) => [
      id,
      {
        name: meta.name,
        description: meta.description,
        keywords: meta.keywords ?? [],
      },
    ]),
  );
  criteria[NONE_ID] = {
    name: "none_of_the_above",
    description: "None of the listed skills is a reasonable match for the task.",
  };

  return {
    state: { query: q.text, profile: q.profile ?? null },
    model,
    questions: {
      route: {
        type: "choice" as const,
        instructions: ROUTE_CHOICE_INSTRUCTIONS,
        criteria,
      },
    },
  };
}

interface ChoiceEvaluation {
  choiceId: string;
  probabilitiesById: Record<string, number>;
  decision: RouterDecision;
}

/**
 * Jev-backed RouterEngine.
 *
 * The engine deliberately sends metadata only (name, description, keywords), never
 * SKILL.md bodies or attachments. It uses one Choice question so Jev's complete
 * probability distribution can be used as a Top-K ranking.
 */
export class TypeSafeRouterEngine implements RouterEngine {
  readonly engineId = "external-typesafe" as const;
  private skills: SkillMeta[] = [];
  private readonly apiKey?: string;
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly confidenceThreshold: number;
  private latestDecision?: RouterDecision;
  private latestRequestMetrics?: TypeSafeRequestMetrics;

  constructor(options: TypeSafeRouterOptions = {}) {
    // 显式传入空字符串用于测试/禁用时，不应被环境变量重新启用。
    this.apiKey =
      options.apiKey !== undefined
        ? options.apiKey.trim() || undefined
        : process.env.TYPESAFE_API_KEY?.trim() || undefined;
    this.apiUrl = options.apiUrl?.trim() || process.env.TYPESAFE_API_URL?.trim() || DEFAULT_API_URL;
    this.model = options.model?.trim() || process.env.TYPESAFE_MODEL?.trim() || DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? parseTimeout(process.env.TYPESAFE_TIMEOUT_MS);
    this.confidenceThreshold =
      options.confidenceThreshold === undefined
        ? parseConfidenceThreshold(process.env.TYPESAFE_MIN_CONFIDENCE)
        : normalizeConfidenceThreshold(options.confidenceThreshold);
  }

  async build(skills: SkillMeta[]): Promise<void> {
    this.latestDecision = undefined;
    this.latestRequestMetrics = undefined;
    if (skills.length > MAX_SKILL_CANDIDATES) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: `Jev Choice 候选数超过 ${MAX_SKILL_CANDIDATES} 个: ${skills.length}`,
        details: { engineId: this.engineId, candidateCount: skills.length },
      });
    }
    this.skills = skills.slice();
  }

  async query(q: RouteQuery): Promise<RankedSkill[]> {
    this.latestDecision = undefined;
    this.latestRequestMetrics = undefined;
    if (!this.apiKey) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev 路由未配置 TYPESAFE_API_KEY",
        details: { engineId: this.engineId },
      });
    }
    if (this.skills.length === 0) return [];

    const candidates: Candidate[] = this.skills.map((meta, index) => ({
      id: `s${index}`,
      meta,
    }));
    const evaluation = await this.evaluateChoice(q, candidates);
    this.latestDecision = evaluation.decision;

    if (evaluation.choiceId === NONE_ID) return [];

    const topK = Math.max(0, q.topK ?? 5);
    return candidates
      .map(({ id, meta }) => {
        const probability = evaluation.probabilitiesById[id] ?? 0;
        const score = typeof probability === "number" ? probability : 0;
        const reasons = [`typesafe_probability:${score.toFixed(4)}`];
        if (evaluation.choiceId === id) reasons.unshift("typesafe_choice");
        return { ...meta, score, reasons } satisfies RankedSkill;
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, topK);
  }

  getDecision(): RouterDecision | undefined {
    return this.latestDecision;
  }

  /**
   * Returns an instance-scoped snapshot for the most recent query attempt.
   * It is undefined when that query did not issue an HTTP request. Like getDecision(),
   * it is not a per-call result and should not be correlated across concurrent queries.
   */
  getLastRequestMetrics(): TypeSafeRequestMetrics | undefined {
    return this.latestRequestMetrics ? { ...this.latestRequestMetrics } : undefined;
  }

  private async evaluateChoice(q: RouteQuery, candidates: Candidate[]): Promise<ChoiceEvaluation> {
    const response = await this.request(buildTypeSafeRouteRequestBody(q, candidates, this.model));

    const answer = response.answers?.route;
    if (!answer || answer.type !== "choice" || typeof answer.choice !== "string") {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev 路由响应缺少有效的 Choice answer",
        details: { engineId: this.engineId, model: response.model ?? null },
      });
    }
    const allowedChoices = new Set([...candidates.map(({ id }) => id), NONE_ID]);
    if (!allowedChoices.has(answer.choice)) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev 路由响应选择了未声明的 Choice",
        details: { engineId: this.engineId, choice: answer.choice },
      });
    }
    if (!isProbabilityMap(answer.probabilities)) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev 路由响应缺少有效的 probabilities",
        details: { engineId: this.engineId, model: response.model ?? null },
      });
    }
    const probabilities = answer.probabilities;
    const entries = Object.entries(probabilities);
    const total = entries.reduce((sum, [, probability]) => sum + probability, 0);
    const selectedProbability = probabilities[answer.choice];
    if (
      entries.length !== allowedChoices.size ||
      entries.some(([id]) => !allowedChoices.has(id)) ||
      selectedProbability === undefined ||
      Math.abs(total - 1) > 0.001 ||
      entries.some(([, probability]) => probability > selectedProbability + 1e-8) ||
      typeof answer.confidence !== "number" ||
      !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 ||
      answer.confidence > 1
    ) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "Jev 路由响应的概率分布或 confidence 不符合 Choice 契约",
        details: { engineId: this.engineId },
      });
    }

    const selected = candidates.find(({ id }) => id === answer.choice)?.meta.name ?? null;
    const confidence = answer.confidence;
    const noneProbability = probabilities[NONE_ID] ?? 0;
    const probabilitiesBySkill: Record<string, number> = Object.fromEntries(
      candidates.map(({ id, meta }) => [meta.name, probabilities[id] ?? 0]),
    );
    probabilitiesBySkill[NONE_ID] = noneProbability;
    return {
      choiceId: answer.choice,
      probabilitiesById: probabilities,
      decision: {
        kind: "choice",
        model: typeof response.model === "string" ? response.model : null,
        selected,
        confidence,
        selectedProbability,
        noneProbability,
        threshold: this.confidenceThreshold,
        escalationRecommended: answer.choice === NONE_ID || confidence < this.confidenceThreshold,
        probabilities: probabilitiesBySkill,
      },
    };
  }

  private async request(body: unknown): Promise<TypeSafeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startedAt = performance.now();
    try {
      const response = await fetch(this.apiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new SkillHubError({
          code: "E_INDEX",
          message: `Jev API 返回 HTTP ${response.status}: ${text.slice(0, 240)}`,
          details: { engineId: this.engineId, status: response.status },
        });
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (cause) {
        throw new SkillHubError({
          code: "E_INDEX",
          message: "Jev API 返回非 JSON 内容",
          details: { engineId: this.engineId },
          cause,
        });
      }
      if (!isRecord(parsed)) {
        throw new SkillHubError({
          code: "E_INDEX",
          message: "Jev API 返回结构不是对象",
          details: { engineId: this.engineId },
        });
      }
      const result = parsed as TypeSafeResponse;
      this.latestRequestMetrics = {
        model: typeof result.model === "string" ? result.model : null,
        latencyMs: elapsedMs(startedAt),
        inputTokens: tokenCount(result.usage?.input_tokens),
        outputTokens: tokenCount(result.usage?.output_tokens),
        completed: true,
      };
      return result;
    } catch (err) {
      this.latestRequestMetrics = {
        model: null,
        latencyMs: elapsedMs(startedAt),
        inputTokens: null,
        outputTokens: null,
        completed: false,
      };
      if (err instanceof SkillHubError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new SkillHubError({
        code: "E_INDEX",
        message: `Jev API 请求失败: ${message.slice(0, 240)}`,
        details: { engineId: this.engineId, apiUrl: this.apiUrl },
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

function elapsedMs(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function createTypeSafeRouter(options: TypeSafeRouterOptions = {}): TypeSafeRouterEngine {
  return new TypeSafeRouterEngine(options);
}

function parseTimeout(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 120_000) {
    return DEFAULT_TIMEOUT_MS;
  }
  return value;
}

function parseConfidenceThreshold(raw: string | undefined): number {
  if (!raw?.trim()) return DEFAULT_CONFIDENCE_THRESHOLD;
  const value = Number(raw);
  return normalizeConfidenceThreshold(value);
}

function normalizeConfidenceThreshold(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "TYPESAFE_MIN_CONFIDENCE 必须为 0 到 1 的有限数值",
    });
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProbabilityMap(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (probability) =>
        typeof probability === "number" &&
        Number.isFinite(probability) &&
        probability >= 0 &&
        probability <= 1,
    )
  );
}
