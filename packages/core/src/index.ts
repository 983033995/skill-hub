/**
 * @skill-hub/core — Skill 解析、扫描、冲突与 catalog。
 */

export type {
  Catalog,
  CatalogSkillEntry,
  Conflict,
  ConflictVariant,
  ScanOptions,
  SkillMeta,
  SkillProvenance,
  SkillScope,
  SkillSourceType,
  SkillStatus,
} from "./types.js";

export { sha256Content } from "./hash.js";
export { hashSkillTree } from "./tree.js";
export { auditSkillTree } from "./audit.js";
export type {
  AuditSeverity,
  AuditSkillOptions,
  SkillAuditFinding,
  SkillAuditResult,
  SkillAuditSummary,
} from "./audit.js";
export { inspectTakeover } from "./takeover.js";
export { manageSkills, MANAGED_LOCK_FILENAME } from "./managed.js";
export type { ManagedAction, ManageSkillsOptions, ManageSkillsResult } from "./managed.js";
export type { TakeoverRoot } from "./takeover.js";
export { splitFrontmatter } from "./frontmatter.js";
export { parseSkillMd } from "./parse.js";
export { scanSkills } from "./scan.js";
export {
  detectConflicts,
  effectiveSkillScope,
  mergeSkillMetas,
  selectPreferredSkill,
} from "./conflict.js";
export {
  buildCatalog,
  catalogHash,
  catalogToSkillMetas,
  createEmptyCatalog,
  readCatalog,
  skillMetaToCatalogEntry,
  upsertSkills,
  writeCatalog,
} from "./catalog.js";

export { appendHistory, appendHistoryBatch, historyForSkill, readHistory } from "./history.js";
export type { SkillHistoryEntry, SkillHistoryType } from "./history.js";

export {
  defaultHubConfig,
  loadHubConfig,
  parseHubConfigYaml,
  resolveHubConfigPaths,
  sourceMappingToProvenance,
} from "./config.js";

export { assertSkillInsideCanonical, materializeToCanonical } from "./materialize.js";
export type { MaterializeOptions, MaterializeResult } from "./materialize.js";

/** @deprecated 脚手架兼容 */
export function corePlaceholder(): string {
  return "skill-hub/core depends on skill-hub/shared";
}
