/**
 * 路由引擎工厂：按配置选择 bm25 / hybrid / external-*，失败降级 bm25。
 */

import type { SkillMeta } from "@skill-hub/core";
import type { RouterEngineId } from "@skill-hub/shared";
import type { SkillScope } from "@skill-hub/shared";
import { createBm25Router } from "./bm25.js";
import { createExternalRouter } from "./external.js";
import { createTypeSafeRouter } from "./typesafe.js";
import type { RankedSkill, RouteQuery, RouterDecision, RouterEngine } from "./types.js";
import { filterByProfile, loadProfile, type ProfileDef } from "./profile.js";
import { filterByScope, type ScopeFilter } from "./scope.js";

export interface CreateRouterOptions {
  engine?: RouterEngineId | string;
  /** 外部/hybrid 失败时是否降级 bm25，默认 true */
  allowDegrade?: boolean;
  profilesDir?: string;
}

export interface RouterBundle {
  engine: RouterEngine;
  engineId: string;
  degraded: boolean;
  degradeReason?: string;
}

export async function createRouterEngine(options: CreateRouterOptions = {}): Promise<RouterBundle> {
  const want = String(options.engine ?? "bm25");
  const allowDegrade = options.allowDegrade !== false;

  if (want === "bm25" || want === "hybrid") {
    // hybrid v0.1：仍用 bm25（后续可加向量侧）
    const engine = createBm25Router();
    return {
      engine,
      engineId: want === "hybrid" ? "hybrid-bm25" : "bm25",
      degraded: want === "hybrid",
      degradeReason: want === "hybrid" ? "hybrid 暂以降级 bm25 实现" : undefined,
    };
  }

  if (want === "external-typesafe" || want === "typesafe" || want === "jev") {
    const engine = createTypeSafeRouter();
    if (!process.env.TYPESAFE_API_KEY && allowDegrade) {
      return {
        engine: createBm25Router(),
        engineId: "bm25",
        degraded: true,
        degradeReason: "TypeSafe Jev 未配置 TYPESAFE_API_KEY，已降级 bm25",
      };
    }
    return { engine, engineId: "external-typesafe", degraded: false };
  }

  if (want.startsWith("external-") || want === "external") {
    const engineId = want === "external" ? "external" : want;
    const ext = createExternalRouter(engineId);
    if (!process.env.SKILL_HUB_EXTERNAL_ENGINE_CMD) {
      if (!allowDegrade) {
        return { engine: ext, engineId, degraded: false };
      }
      return {
        engine: createBm25Router(),
        engineId: "bm25",
        degraded: true,
        degradeReason: `外部引擎 ${engineId} 未配置 CMD，已降级 bm25`,
      };
    }
    return { engine: ext, engineId, degraded: false };
  }

  // 未知引擎 → bm25
  return {
    engine: createBm25Router(),
    engineId: "bm25",
    degraded: true,
    degradeReason: `未知 engine=${want}，已降级 bm25`,
  };
}

export interface RouteWithProfileOptions {
  text: string;
  topK?: number;
  profile?: string;
  scope?: ScopeFilter;
  profilesDir?: string;
  engine?: RouterEngineId | string;
  skills: SkillMeta[];
  /** freshness 已确认且候选未做 profile/scope 过滤时可直接复用持久化引擎。 */
  prebuiltEngine?: RouterEngine;
}

export interface RouteWithProfileResult {
  results: RankedSkill[];
  decision?: RouterDecision;
  engineId: string;
  degraded: boolean;
  degradeReason?: string;
  profile: string | null;
  profileMatched: number | null;
  profileFallback: boolean;
  scope: SkillScope[] | null;
  scopeMatched: number | null;
  candidateCount: number;
}

/**
 * 统一路由：profile 过滤 → build → query；external 失败再降级 bm25 重试。
 */
export async function routeWithProfile(
  options: RouteWithProfileOptions,
): Promise<RouteWithProfileResult> {
  let skills = options.skills;
  let profileMatched: number | null = null;
  let profileFallback = false;
  let scopeMatched: number | null = null;
  const profileName: string | null = options.profile ?? null;
  const scopeValues = options.scope
    ? Array.isArray(options.scope)
      ? options.scope
      : [options.scope]
    : null;
  if (options.scope) {
    const filtered = filterByScope(skills, options.scope);
    skills = filtered.skills;
    scopeMatched = filtered.matched;
  }
  let profileDef: ProfileDef | null = null;

  if (options.profile) {
    profileDef = await loadProfile(options.profile, options.profilesDir);
    const filtered = filterByProfile(skills, profileDef);
    skills = filtered.skills;
    profileMatched = filtered.matched;
    profileFallback = filtered.fallback;
  }

  const bundle = options.prebuiltEngine
    ? {
        engine: options.prebuiltEngine,
        engineId: options.prebuiltEngine.engineId,
        degraded: false,
      }
    : await createRouterEngine({
        engine: options.engine,
        profilesDir: options.profilesDir,
      });

  try {
    if (!options.prebuiltEngine) await bundle.engine.build(skills);
    const results = await bundle.engine.query({
      text: options.text,
      topK: options.topK ?? 5,
      profile: options.profile,
      scope: options.scope,
    } satisfies RouteQuery);

    return {
      results,
      decision: bundle.engine.getDecision?.(),
      engineId: bundle.engineId,
      degraded: bundle.degraded,
      degradeReason: bundle.degradeReason,
      profile: profileName,
      profileMatched,
      profileFallback,
      scope: scopeValues,
      scopeMatched,
      candidateCount: skills.length,
    };
  } catch (err) {
    // external 运行时失败 → 降级 bm25
    if (bundle.engineId.startsWith("external") || bundle.engineId === "external") {
      const fb = createBm25Router();
      await fb.build(skills);
      const results = await fb.query({
        text: options.text,
        topK: options.topK ?? 5,
        profile: options.profile,
        scope: options.scope,
      });
      return {
        results,
        engineId: "bm25",
        degraded: true,
        degradeReason: `外部引擎失败，已降级 bm25: ${err instanceof Error ? err.message : String(err)}`,
        profile: profileName,
        profileMatched,
        profileFallback,
        scope: scopeValues,
        scopeMatched,
        candidateCount: skills.length,
      };
    }
    throw err;
  }
}
