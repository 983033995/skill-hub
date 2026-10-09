/**
 * @skill-hub/router — BM25 索引与 Top-K 路由 + profile + external 适配。
 */

export type {
  Bm25IndexArtifact,
  IndexMeta,
  RankedSkill,
  RouterDecision,
  RouteQuery,
  RouterEngine,
} from "./types.js";
export { tokenize } from "./tokenize.js";
export { effectiveScope, filterByScope } from "./scope.js";
export type { ScopeFilter } from "./scope.js";
export { Bm25Router, createBm25Router } from "./bm25.js";
export { BM25_ARTIFACT_FILENAME, inspectBm25Index } from "./index-store.js";
export type { IndexInspection } from "./index-store.js";
export {
  filterByProfile,
  loadProfile,
  matchNameGlob,
  parseProfileYaml,
  skillMatchesProfile,
} from "./profile.js";
export type { ProfileDef } from "./profile.js";
export { ExternalRouterEngine, createExternalRouter } from "./external.js";
export { TypeSafeRouterEngine, createTypeSafeRouter } from "./typesafe.js";
export type { TypeSafeRouterOptions } from "./typesafe.js";
export { createRouterEngine, routeWithProfile } from "./factory.js";
export type {
  CreateRouterOptions,
  RouteWithProfileOptions,
  RouteWithProfileResult,
  RouterBundle,
} from "./factory.js";
export { skillFiles, skillList, skillRead } from "./runtime.js";
export type {
  SkillFilesResult,
  SkillListItem,
  SkillListResult,
  SkillReadResult,
} from "./runtime.js";
export {
  loadHubSkills,
  skillExplain,
  skillFetch,
  skillAudit,
  skillHistory,
  skillInventorySummary,
  skillPaths,
  skillSearch,
  skillStats,
  skillTagSummary,
} from "./hub-service.js";
export type {
  SkillAuditReport,
  SkillExplainResult,
  SkillPathRecord,
  SkillPathResult,
} from "./hub-service.js";
export {
  DEFAULT_TAXONOMY,
  OTHER_TAG,
  loadTaxonomy,
  parseTaxonomyYaml,
  tagSkill,
} from "./taxonomy.js";
export type { SkillTag, TaxonomyTag } from "./taxonomy.js";
export {
  createLlmProvider,
  findModelsConfigPath,
  getLlmStatus,
  LLM_ERROR_CODES,
  LLM_PROVIDER_TYPES,
  LlmError,
  MODELS_CONFIG_FILENAMES,
  requireLlmProvider,
  resolveLlmConfig,
} from "./llm/index.js";
export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  EmbedResult,
  LlmModelsConfig,
  LlmProbeResult,
  LlmProvider,
  LlmProviderConfig,
  LlmProviderType,
  LlmStatus,
  LlmStatusOptions,
} from "./llm/index.js";

/** @deprecated */
export function routerPlaceholder(): string {
  return "skill-hub/router";
}
