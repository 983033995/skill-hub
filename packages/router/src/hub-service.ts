/**
 * Hub 查询服务：CLI / MCP 共用（只读）。
 */

import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import {
  catalogToSkillMetas,
  auditSkillTree,
  detectConflicts,
  effectiveSkillScope,
  loadHubConfig,
  historyForSkill,
  readCatalog,
  readHistory,
  resolveHubConfigPaths,
  scanSkills,
  sha256Content,
  selectPreferredSkill,
  sourceMappingToProvenance,
  type Catalog,
  type Conflict,
  type SkillHistoryEntry,
  type SkillMeta,
  type SkillAuditResult,
} from "@skill-hub/core";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  type HubConfig,
  resolveAbsolutePath,
  type SkillScope,
} from "@skill-hub/shared";
import { routeWithProfile, type RouteWithProfileResult } from "./factory.js";
import { inspectBm25Index } from "./index-store.js";
import { skillRead } from "./runtime.js";
import { loadTaxonomy, OTHER_TAG, tagSkill, type SkillTag } from "./taxonomy.js";

export async function loadHubSkills(options?: {
  catalogPath?: string;
  hubHome?: string;
  skillsDir?: string;
  configPath?: string;
}): Promise<{ skills: SkillMeta[]; catalogPath: string; skillsDir: string }> {
  if (options?.configPath) await loadHubConfig(options.configPath);
  const layout = hubLayout(options?.hubHome ?? getDefaultHubHome());
  const catalogPath = options?.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;
  let catalogMissing = false;
  try {
    await lstat(catalogPath);
  } catch (err) {
    if (isMissingPathError(err)) {
      catalogMissing = true;
    } else {
      throw new SkillHubError({
        code: "E_PATH",
        message: `无法访问 catalog: ${catalogPath}`,
        details: { path: catalogPath },
        cause: err,
      });
    }
  }

  if (!catalogMissing) {
    // catalog 已存在时，格式或 schema 错误必须直接暴露，不能伪装成扫描成功。
    const catalog = await readCatalog(catalogPath);
    const skillsDir = options?.skillsDir ? resolveAbsolutePath(options.skillsDir) : layout.skills;
    return { skills: catalogToSkillMetas(catalog), catalogPath, skillsDir };
  }

  const skillsDir = options?.skillsDir
    ? resolveAbsolutePath(options.skillsDir)
    : resolveHubConfigPaths(await loadHubConfig(options?.configPath)).canonical_dir;
  try {
    const skills = await scanSkills(skillsDir);
    return { skills, catalogPath, skillsDir };
  } catch (err) {
    throw new SkillHubError({
      code: "E_INDEX",
      message: "无 catalog 且无法扫描 canonical skills，请先 ingest/index",
      details: { catalogPath, skills: skillsDir },
      cause: err,
    });
  }
}

function isMissingPathError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT";
}

export async function skillSearch(options: {
  query: string;
  topK?: number;
  profile?: string;
  scope?: SkillScope | SkillScope[];
  engine?: string;
  tag?: string;
  catalogPath?: string;
  configPath?: string;
  indexDir?: string;
  profilesDir?: string;
  taxonomyPath?: string;
}): Promise<
  Omit<RouteWithProfileResult, "results"> & {
    results: Array<RouteWithProfileResult["results"][number] & { tags: SkillTag[] }>;
    query: string;
    top_k: number;
    tag: string | null;
    indexFresh: boolean | null;
    indexRebuildRecommended: boolean;
    indexSource: "persistent" | "memory-filtered" | "memory";
    indexReason: string;
  }
> {
  if (!options.query.trim()) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "skill_search 需要 query",
    });
  }

  const config = await loadHubConfig(options.configPath);
  const resolvedConfig = {
    ...config,
    canonical_dir: resolveAbsolutePath(config.canonical_dir),
    index_dir: resolveAbsolutePath(config.index_dir),
  };
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : hubLayout(getDefaultHubHome()).catalog;
  const { skills } = await loadHubSkills({
    catalogPath,
    skillsDir: resolvedConfig.canonical_dir,
  });
  const topK = options.topK ?? config.router.top_k ?? 5;
  const engine = options.engine ?? config.router.engine;

  let catalog: Catalog | null = null;
  try {
    catalog = await readCatalog(catalogPath);
  } catch {
    catalog = null;
  }
  const inspection =
    engine === "bm25"
      ? await inspectBm25Index({
          indexDir: options.indexDir
            ? resolveAbsolutePath(options.indexDir)
            : resolvedConfig.index_dir,
          catalog,
        })
      : null;
  const hasFilteredCandidates = Boolean(
    options.profile ||
    (options.scope && (Array.isArray(options.scope) ? options.scope.length : true)),
  );
  const canUsePersistent = Boolean(
    inspection?.fresh && inspection.router && !hasFilteredCandidates,
  );

  const routed = await routeWithProfile({
    text: options.query,
    topK,
    profile: options.profile,
    scope: options.scope,
    profilesDir: options.profilesDir,
    engine,
    skills,
    prebuiltEngine: canUsePersistent ? (inspection?.router ?? undefined) : undefined,
  });

  const indexFresh = inspection ? inspection.fresh : null;
  const indexSource = canUsePersistent
    ? "persistent"
    : inspection?.fresh && hasFilteredCandidates
      ? "memory-filtered"
      : "memory";
  const indexRebuildRecommended = Boolean(inspection && !inspection.fresh);

  const taxonomy = await loadTaxonomy({ path: options.taxonomyPath });
  const tagFilter = options.tag?.trim() || null;
  const tagged = routed.results.map((r) => ({ ...r, tags: tagSkill(r, taxonomy) }));
  const results = tagFilter ? tagged.filter((r) => r.tags.some((t) => t.id === tagFilter)) : tagged;

  return {
    ...routed,
    results,
    indexFresh,
    indexRebuildRecommended,
    indexSource,
    indexReason:
      inspection?.reason ??
      (engine === "bm25" ? "未检查持久化索引" : `engine=${engine} 不使用 bm25 artifact`),
    query: options.query,
    top_k: topK,
    tag: tagFilter,
  };
}

export interface SkillAuditReport {
  generatedAt: string;
  skills: SkillAuditResult[];
  summary: {
    skills: number;
    passed: number;
    failed: number;
    critical: number;
    high: number;
    warning: number;
    info: number;
    filesScanned: number;
    bytesScanned: number;
  };
}

/**
 * 对 Hub 中的 Skill 做只读静态审计：不执行脚本、不联网、不修改 catalog。
 * `failOn` 由 CLI 决定退出码，服务层始终返回完整报告。
 */
export async function skillAudit(
  options: {
    name?: string;
    catalogPath?: string;
    configPath?: string;
    maxFileBytes?: number;
    maxDepth?: number;
  } = {},
): Promise<SkillAuditReport> {
  const { skills } = await loadHubSkills({
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  const name = options.name?.trim();
  const selected = name
    ? skills.filter((skill) => skill.name === name)
    : skills.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (name && selected.length === 0) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `skill 不存在: ${name}`,
      details: { name },
    });
  }
  const audited = await Promise.all(
    selected.map((skill) =>
      auditSkillTree(skill.path, {
        name: skill.name,
        maxFileBytes: options.maxFileBytes,
        maxDepth: options.maxDepth,
      }),
    ),
  );
  const summary = audited.reduce<SkillAuditReport["summary"]>(
    (acc, result) => {
      acc.skills += 1;
      if (result.passed) acc.passed += 1;
      else acc.failed += 1;
      acc.critical += result.summary.critical;
      acc.high += result.summary.high;
      acc.warning += result.summary.warning;
      acc.info += result.summary.info;
      acc.filesScanned += result.summary.filesScanned;
      acc.bytesScanned += result.summary.bytesScanned;
      return acc;
    },
    {
      skills: 0,
      passed: 0,
      failed: 0,
      critical: 0,
      high: 0,
      warning: 0,
      info: 0,
      filesScanned: 0,
      bytesScanned: 0,
    },
  );
  return { generatedAt: new Date().toISOString(), skills: audited, summary };
}

/** 全库标签汇总：驱动 Web/CLI 的分类侧栏。派生数据，不写回 catalog。 */
export async function skillTagSummary(options?: {
  catalogPath?: string;
  taxonomyPath?: string;
}): Promise<{
  total: number;
  untagged: number;
  tags: Array<{ id: string; label: string; count: number }>;
}> {
  const { skills } = await loadHubSkills({ catalogPath: options?.catalogPath });
  const taxonomy = await loadTaxonomy({ path: options?.taxonomyPath });
  const counts = new Map<string, { id: string; label: string; count: number }>();
  let untagged = 0;
  for (const skill of skills) {
    const tags = tagSkill(skill, taxonomy);
    if (tags.every((t) => t.id === OTHER_TAG.id)) untagged += 1;
    for (const t of tags) {
      const entry = counts.get(t.id) ?? { id: t.id, label: t.label, count: 0 };
      entry.count += 1;
      counts.set(t.id, entry);
    }
  }
  const tags = [...counts.values()].sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
  return { total: skills.length, untagged, tags };
}

export async function skillFetch(options: {
  name: string;
  maxChars?: number;
  offset?: number;
  catalogPath?: string;
  taxonomyPath?: string;
}): Promise<{
  name: string;
  path: string;
  hash?: string;
  description?: string;
  provenance?: SkillMeta["provenance"];
  tags: SkillTag[];
  skillMdPath: string;
  body: string;
  truncated: boolean;
  offset: number;
  nextOffset: number | null;
  totalChars: number;
}> {
  const name = options.name.trim();
  if (!name) {
    throw new SkillHubError({ code: "E_CONFIG", message: "skill_fetch 需要 name" });
  }

  const { skills } = await loadHubSkills({ catalogPath: options.catalogPath });
  const meta = skills.find((s) => s.name === name);
  if (!meta) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `skill 不存在: ${name}`,
      details: { name },
    });
  }

  const read = await skillRead({
    name,
    file: "SKILL.md",
    offset: options.offset,
    // 保持旧接口的默认首段大小；skill_read 本身的默认值为 20_000。
    maxChars: options.maxChars ?? 50_000,
    catalogPath: options.catalogPath,
  });

  const taxonomy = await loadTaxonomy({ path: options.taxonomyPath });

  return {
    name: meta.name,
    path: meta.path,
    hash: read.hash,
    description: meta.description,
    provenance: meta.provenance,
    tags: tagSkill(meta, taxonomy),
    skillMdPath: path.join(meta.path, read.file),
    body: read.body,
    truncated: read.truncated,
    offset: read.offset,
    nextOffset: read.nextOffset,
    totalChars: read.totalChars,
  };
}

export async function skillStats(options?: { catalogPath?: string }): Promise<{
  catalogPath: string;
  skillsDir: string;
  skillCount: number;
  catalogUpdatedAt: string | null;
  catalogMtime: string | null;
  indexDir: string;
  engineDefault: string;
  topKDefault: number;
  sampleNames: string[];
}> {
  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options?.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;
  const config = await loadHubConfig();

  let skillCount = 0;
  let catalogUpdatedAt: string | null = null;
  let catalogMtime: string | null = null;
  let sampleNames: string[] = [];

  try {
    const catalog = await readCatalog(catalogPath);
    skillCount = Object.keys(catalog.skills).length;
    catalogUpdatedAt = catalog.updatedAt;
    sampleNames = Object.keys(catalog.skills).sort().slice(0, 12);
    try {
      const st = await stat(catalogPath);
      catalogMtime = st.mtime.toISOString();
    } catch {
      /* ignore */
    }
  } catch {
    try {
      const skills = await scanSkills(layout.skills);
      skillCount = skills.length;
      sampleNames = skills.map((s) => s.name).slice(0, 12);
    } catch {
      skillCount = 0;
    }
  }

  return {
    catalogPath,
    skillsDir: layout.skills,
    skillCount,
    catalogUpdatedAt,
    catalogMtime,
    indexDir: layout.index,
    engineDefault: config.router.engine,
    topKDefault: config.router.top_k,
    sampleNames,
  };
}

export async function skillInventorySummary(options?: {
  agent?: string;
  scope?: SkillScope | SkillScope[];
}): Promise<{
  agents: Array<{ id: string; path: string; exists: boolean; count: number }>;
  sources: Array<{
    id: string;
    path: string;
    scope: SkillScope;
    exists: boolean;
    count: number;
  }>;
  unionApprox: number;
  filterAgent: string | null;
  filterScope: SkillScope[] | null;
}> {
  const config = await loadHubConfig();
  const { existsSync } = await import("node:fs");
  const agentsOut: Array<{ id: string; path: string; exists: boolean; count: number }> = [];
  const sourcesOut: Array<{
    id: string;
    path: string;
    scope: SkillScope;
    exists: boolean;
    count: number;
  }> = [];

  const want = options?.agent?.trim();
  const scopeValues = options?.scope
    ? Array.isArray(options.scope)
      ? options.scope
      : [options.scope]
    : null;
  const scopeSet = scopeValues ? new Set(scopeValues) : null;
  const list = config.agents.filter(
    (a) => a.enabled && (!want || a.id === want) && (!scopeSet || scopeSet.has("user")),
  );

  const allNames = new Set<string>();
  for (const a of list) {
    const p = resolveAbsolutePath(a.skills_dir);
    const exists = existsSync(p);
    let count = 0;
    if (exists) {
      try {
        const skills = await scanSkills(p);
        count = skills.length;
        for (const s of skills) allNames.add(s.name);
      } catch {
        count = 0;
      }
    }
    agentsOut.push({ id: a.id, path: p, exists, count });
  }

  for (const source of config.sources ?? []) {
    if (!source.enabled || (scopeSet && !scopeSet.has(source.scope))) continue;
    const p = resolveAbsolutePath(source.path);
    const exists = existsSync(p);
    let count = 0;
    if (exists) {
      try {
        const skills = await scanSkills(p, {
          provenance: sourceMappingToProvenance(source, p),
        });
        count = skills.length;
        for (const s of skills) allNames.add(s.name);
      } catch {
        count = 0;
      }
    }
    sourcesOut.push({
      id: source.id,
      path: p,
      scope: source.scope,
      exists,
      count,
    });
  }

  return {
    agents: agentsOut,
    sources: sourcesOut,
    unionApprox: allNames.size,
    filterAgent: want || null,
    filterScope: scopeValues,
  };
}

export interface SkillPathRecord {
  agentId: string;
  enabled: boolean;
  target: string;
  exists: boolean;
  mode: "missing" | "symlink" | "copy" | "real";
  status: "missing" | "ok" | "wrong_target" | "broken_symlink" | "content_mismatch" | "real_path";
  actual?: string;
  detail?: string;
}

export interface SkillPathResult {
  name: string;
  recordedPath: string;
  canonicalPath: string;
  canonicalExists: boolean;
  source: {
    path: string | null;
    ref: string | null;
    type: string | null;
  };
  agents: SkillPathRecord[];
}

export interface SkillExplainResult {
  name: string;
  catalogPath: string;
  meta: SkillMeta;
  scope: SkillScope;
  source: string | null;
  revision: string | null;
  status: string | null;
  variants: SkillMeta[];
  winner: SkillMeta | null;
  winnerReason: string | null;
  conflict: Conflict | null;
  overlay: {
    overlayOf: string | null;
    base: Pick<SkillMeta, "name" | "path" | "hash" | "provenance"> | null;
  };
  paths: SkillPathResult;
  history: SkillHistoryEntry[];
}

interface InsightContext {
  config: HubConfig;
  catalogPath: string;
  catalog: Catalog | null;
  meta: SkillMeta;
  variants: SkillMeta[];
}

export async function skillPaths(options: {
  name: string;
  catalogPath?: string;
  configPath?: string;
}): Promise<SkillPathResult> {
  const context = await loadInsightContext(options);
  const { meta, config } = context;
  const canonicalPath = path.join(config.canonical_dir, meta.name);
  const canonicalExists = await pathExists(canonicalPath);
  const agents = await Promise.all(
    config.agents.map(async (agent) => {
      const target = path.join(agent.skills_dir, meta.name);
      return {
        agentId: agent.id,
        enabled: agent.enabled,
        target,
        ...(await inspectProjection(target, meta.path, meta.hash)),
      };
    }),
  );

  return {
    name: meta.name,
    recordedPath: meta.path,
    canonicalPath,
    canonicalExists,
    source: {
      path: meta.provenance?.sourceRef ?? meta.source ?? null,
      ref: meta.provenance?.sourceRef ?? meta.source ?? null,
      type: meta.provenance?.sourceType ?? null,
    },
    agents,
  };
}

export async function skillExplain(options: {
  name: string;
  catalogPath?: string;
  configPath?: string;
  historyPath?: string;
}): Promise<SkillExplainResult> {
  const context = await loadInsightContext(options);
  const { meta, variants } = context;
  const conflict = detectConflicts(variants).find((item) => item.name === meta.name) ?? null;
  const winner = selectPreferredSkill(variants) ?? null;
  const overlayOf = meta.provenance?.overlayOf ?? null;
  let base: SkillMeta | null = null;
  if (overlayOf) {
    base = variants.find((item) => item.name === overlayOf) ?? null;
    const baseEntry = context.catalog?.skills[overlayOf];
    if (!base && baseEntry && context.catalog) {
      base =
        catalogToSkillMetas({
          version: 1,
          updatedAt: context.catalog.updatedAt,
          skills: { [overlayOf]: baseEntry },
        })[0] ?? null;
    }
  }
  const historyPath = options.historyPath
    ? resolveAbsolutePath(options.historyPath)
    : hubLayout(getDefaultHubHome()).history;

  return {
    name: meta.name,
    catalogPath: context.catalogPath,
    meta,
    scope: effectiveSkillScope(meta),
    source: meta.provenance?.sourceRef ?? meta.source ?? null,
    revision: meta.provenance?.revision ?? null,
    status: meta.provenance?.status ?? null,
    variants,
    winner,
    winnerReason: conflict?.winnerReason ?? null,
    conflict,
    overlay: { overlayOf, base: base ? pickSkillIdentity(base) : null },
    paths: await skillPaths(options),
    history: await historyForSkill(historyPath, meta.name),
  };
}

export async function skillHistory(options: {
  name?: string;
  historyPath?: string;
  limit?: number;
}): Promise<{
  path: string;
  name: string | null;
  entries: SkillHistoryEntry[];
}> {
  const historyPath = options.historyPath
    ? resolveAbsolutePath(options.historyPath)
    : hubLayout(getDefaultHubHome()).history;
  const name = options.name?.trim() || null;
  const all = await readHistory(historyPath);
  const filtered = name ? all.filter((entry) => entry.name === name) : all;
  const limit = Math.max(1, Math.floor(options.limit ?? 50));
  return {
    path: historyPath,
    name,
    entries: filtered.slice().reverse().slice(0, limit),
  };
}

async function loadInsightContext(options: {
  name: string;
  catalogPath?: string;
  configPath?: string;
}): Promise<InsightContext> {
  const name = options.name.trim();
  if (!name) throw new SkillHubError({ code: "E_CONFIG", message: "命令需要 name" });

  const config = resolveHubConfigPaths(await loadHubConfig(options.configPath));
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : hubLayout(getDefaultHubHome()).catalog;
  let catalog: Catalog | null = null;
  let catalogSkills: SkillMeta[] = [];
  try {
    catalog = await readCatalog(catalogPath);
    catalogSkills = catalogToSkillMetas(catalog);
  } catch {
    catalogSkills = await scanSkills(config.canonical_dir, {
      provenance: { scope: "user", sourceType: "local", sourceRef: config.canonical_dir },
    });
  }

  const catalogMeta = catalogSkills.find((item) => item.name === name);
  if (!catalogMeta) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `skill 不存在: ${name}`,
      details: { name, catalogPath },
    });
  }

  const variants: SkillMeta[] = [catalogMeta];
  for (const agent of config.agents.filter((item) => item.enabled)) {
    const agentPath = resolveAbsolutePath(agent.skills_dir);
    try {
      const found = await scanSkills(agentPath, {
        agentId: agent.id,
        source: agentPath,
        provenance: { scope: "user", sourceType: "local", sourceRef: agentPath },
        maxDepth: 5,
      });
      variants.push(...found.filter((item) => item.name === name));
    } catch {
      // explain/path 是只读诊断；缺失的 Agent 目录由 path 结果显示 missing。
    }
  }
  for (const source of (config.sources ?? []).filter((item) => item.enabled)) {
    const sourcePath = resolveAbsolutePath(source.path);
    try {
      const found = await scanSkills(sourcePath, {
        source: sourcePath,
        provenance: sourceMappingToProvenance(source, sourcePath),
        maxDepth: 5,
      });
      variants.push(...found.filter((item) => item.name === name));
    } catch {
      // 未挂载的 workspace/project source 不应阻断对 catalog Skill 的解释。
    }
  }

  const unique = new Map<string, SkillMeta>();
  for (const variant of variants) {
    const key = [
      variant.path,
      variant.hash,
      variant.provenance?.sourceRef ?? "",
      variant.agentsPresent?.join(",") ?? "",
    ].join("|");
    unique.set(key, variant);
  }
  return { config, catalogPath, catalog, meta: catalogMeta, variants: [...unique.values()] };
}

async function inspectProjection(
  target: string,
  expected: string,
  expectedHash: string,
): Promise<Omit<SkillPathRecord, "agentId" | "enabled" | "target">> {
  let st;
  try {
    st = await lstat(target);
  } catch {
    return { exists: false, mode: "missing", status: "missing", detail: "目标不存在" };
  }
  if (st.isSymbolicLink()) {
    try {
      const actual = await realpath(target);
      const want = await safeRealpath(expected);
      return actual === want
        ? { exists: true, mode: "symlink", status: "ok", actual }
        : {
            exists: true,
            mode: "symlink",
            status: "wrong_target",
            actual,
            detail: `当前指向 ${actual}`,
          };
    } catch {
      return {
        exists: true,
        mode: "symlink",
        status: "broken_symlink",
        detail: "死链",
      };
    }
  }
  if (st.isDirectory()) {
    const actualHash = await readSkillHash(target);
    if (actualHash === expectedHash) {
      return { exists: true, mode: "copy", status: "ok", detail: "实体副本内容匹配" };
    }
    return {
      exists: true,
      mode: "copy",
      status: "content_mismatch",
      detail: "实体副本 SKILL.md hash 不匹配",
    };
  }
  return { exists: true, mode: "real", status: "real_path", detail: "目标是实体文件" };
}

async function readSkillHash(dir: string): Promise<string | null> {
  for (const fileName of ["SKILL.md", "skill.md"]) {
    try {
      return sha256Content(await readFile(path.join(dir, fileName), "utf8"));
    } catch {
      // try alternate casing
    }
  }
  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeRealpath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

function pickSkillIdentity(
  skill: SkillMeta,
): Pick<SkillMeta, "name" | "path" | "hash" | "provenance"> {
  return {
    name: skill.name,
    path: skill.path,
    hash: skill.hash,
    provenance: skill.provenance,
  };
}
