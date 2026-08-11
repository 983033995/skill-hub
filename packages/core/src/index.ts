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
} from "./types.js";

export { sha256Content } from "./hash.js";
export { splitFrontmatter } from "./frontmatter.js";
export { parseSkillMd } from "./parse.js";
export { scanSkills } from "./scan.js";
export { detectConflicts, mergeSkillMetas } from "./conflict.js";
export {
  buildCatalog,
  catalogToSkillMetas,
  createEmptyCatalog,
  readCatalog,
  skillMetaToCatalogEntry,
  upsertSkills,
  writeCatalog,
} from "./catalog.js";

export {
  defaultHubConfig,
  loadHubConfig,
  parseHubConfigYaml,
  resolveHubConfigPaths,
} from "./config.js";

export {
  assertSkillInsideCanonical,
  materializeToCanonical,
} from "./materialize.js";
export type { MaterializeOptions, MaterializeResult } from "./materialize.js";

/** @deprecated 脚手架兼容 */
export function corePlaceholder(): string {
  return "skill-hub/core depends on skill-hub/shared";
}
