/**
 * @skill-hub/router — BM25 索引与 Top-K 路由 + profile + external 适配。
 */

export type { IndexMeta, RankedSkill, RouteQuery, RouterEngine } from "./types.js";
export { tokenize } from "./tokenize.js";
export { Bm25Router, createBm25Router } from "./bm25.js";
export {
  filterByProfile,
  loadProfile,
  matchNameGlob,
  parseProfileYaml,
  skillMatchesProfile,
} from "./profile.js";
export type { ProfileDef } from "./profile.js";
export { ExternalRouterEngine, createExternalRouter } from "./external.js";
export { createRouterEngine, routeWithProfile } from "./factory.js";
export type {
  CreateRouterOptions,
  RouteWithProfileOptions,
  RouteWithProfileResult,
  RouterBundle,
} from "./factory.js";
export {
  loadHubSkills,
  skillFetch,
  skillInventorySummary,
  skillSearch,
  skillStats,
} from "./hub-service.js";

/** @deprecated */
export function routerPlaceholder(): string {
  return "skill-hub/router";
}
