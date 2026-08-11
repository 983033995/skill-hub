/**
 * Hub 查询服务：CLI / MCP 共用（只读）。
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  catalogToSkillMetas,
  loadHubConfig,
  readCatalog,
  scanSkills,
  type SkillMeta,
} from "@skill-hub/core";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { routeWithProfile, type RouteWithProfileResult } from "./factory.js";

export async function loadHubSkills(options?: {
  catalogPath?: string;
  hubHome?: string;
}): Promise<{ skills: SkillMeta[]; catalogPath: string; skillsDir: string }> {
  const layout = hubLayout(options?.hubHome ?? getDefaultHubHome());
  const catalogPath = options?.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;

  try {
    const catalog = await readCatalog(catalogPath);
    return {
      skills: catalogToSkillMetas(catalog),
      catalogPath,
      skillsDir: layout.skills,
    };
  } catch {
    try {
      const skills = await scanSkills(layout.skills);
      return { skills, catalogPath, skillsDir: layout.skills };
    } catch {
      throw new SkillHubError({
        code: "E_INDEX",
        message: "无 catalog 且无法扫描 canonical skills，请先 ingest/index",
        details: { catalogPath, skills: layout.skills },
      });
    }
  }
}

export async function skillSearch(options: {
  query: string;
  topK?: number;
  profile?: string;
  engine?: string;
  catalogPath?: string;
  profilesDir?: string;
}): Promise<RouteWithProfileResult & { query: string; top_k: number }> {
  if (!options.query.trim()) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "skill_search 需要 query",
    });
  }

  const config = await loadHubConfig();
  const { skills } = await loadHubSkills({ catalogPath: options.catalogPath });
  const topK = options.topK ?? config.router.top_k ?? 5;
  const engine = options.engine ?? config.router.engine;

  const routed = await routeWithProfile({
    text: options.query,
    topK,
    profile: options.profile,
    profilesDir: options.profilesDir,
    engine,
    skills,
  });

  return {
    ...routed,
    query: options.query,
    top_k: topK,
  };
}

export async function skillFetch(options: {
  name: string;
  maxChars?: number;
  catalogPath?: string;
}): Promise<{
  name: string;
  path: string;
  hash?: string;
  description?: string;
  skillMdPath: string;
  body: string;
  truncated: boolean;
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

  const skillMdPath = path.join(meta.path, "SKILL.md");
  let body: string;
  try {
    body = await readFile(skillMdPath, "utf8");
  } catch {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `SKILL.md 不可读: ${skillMdPath}`,
      details: { skillMdPath },
    });
  }

  const maxChars = options.maxChars ?? 50_000;
  let truncated = false;
  if (body.length > maxChars) {
    body = body.slice(0, maxChars);
    truncated = true;
  }

  return {
    name: meta.name,
    path: meta.path,
    hash: meta.hash,
    description: meta.description,
    skillMdPath,
    body,
    truncated,
  };
}

export async function skillStats(options?: {
  catalogPath?: string;
}): Promise<{
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
}): Promise<{
  agents: Array<{ id: string; path: string; exists: boolean; count: number }>;
  unionApprox: number;
  filterAgent: string | null;
}> {
  const config = await loadHubConfig();
  const { existsSync } = await import("node:fs");
  const agentsOut: Array<{ id: string; path: string; exists: boolean; count: number }> =
    [];

  const want = options?.agent?.trim();
  const list = config.agents.filter((a) => a.enabled && (!want || a.id === want));

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

  return {
    agents: agentsOut,
    unionApprox: allNames.size,
    filterAgent: want || null,
  };
}
