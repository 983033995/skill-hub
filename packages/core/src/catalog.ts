import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { SkillHubError, resolveAbsolutePath } from "@skill-hub/shared";
import type { Catalog, CatalogSkillEntry, SkillMeta } from "./types.js";

export function createEmptyCatalog(now: Date = new Date()): Catalog {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    skills: {},
  };
}

export function skillMetaToCatalogEntry(meta: SkillMeta): CatalogSkillEntry {
  const entry: CatalogSkillEntry = {
    name: meta.name,
    description: meta.description,
    path: meta.path,
    hash: meta.hash,
    mtimeMs: meta.mtimeMs,
  };
  if (meta.keywords) entry.keywords = meta.keywords;
  if (meta.source) entry.source = meta.source;
  return entry;
}

export function catalogToSkillMetas(catalog: Catalog): SkillMeta[] {
  return Object.values(catalog.skills)
    .map(
      (e): SkillMeta => ({
        name: e.name,
        description: e.description,
        path: e.path,
        hash: e.hash,
        mtimeMs: e.mtimeMs ?? 0,
        keywords: e.keywords,
        source: e.source,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 用一组 SkillMeta 覆盖构建 catalog。 */
export function buildCatalog(skills: SkillMeta[], now: Date = new Date()): Catalog {
  const catalog = createEmptyCatalog(now);
  for (const s of skills) {
    catalog.skills[s.name] = skillMetaToCatalogEntry(s);
  }
  return catalog;
}

/**
 * 合并进现有 catalog。
 * - 默认同名直接覆盖（用于 canonical 唯一真源）
 * - `skipOnConflict`：若 hash 不同则跳过并返回 skipped 名
 */
export function upsertSkills(
  catalog: Catalog,
  skills: SkillMeta[],
  options: { skipOnHashConflict?: boolean; now?: Date } = {},
): { catalog: Catalog; skipped: string[]; updated: string[] } {
  const next: Catalog = {
    version: 1,
    updatedAt: (options.now ?? new Date()).toISOString(),
    skills: { ...catalog.skills },
  };
  const skipped: string[] = [];
  const updated: string[] = [];

  for (const s of skills) {
    const existing = next.skills[s.name];
    if (
      options.skipOnHashConflict &&
      existing &&
      existing.hash !== s.hash
    ) {
      skipped.push(s.name);
      continue;
    }
    next.skills[s.name] = skillMetaToCatalogEntry(s);
    updated.push(s.name);
  }

  return { catalog: next, skipped, updated };
}

export async function readCatalog(filePath: string): Promise<Catalog> {
  const abs = resolveAbsolutePath(filePath);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    throw new SkillHubError({
      code: "E_PATH",
      message: `无法读取 catalog: ${abs}`,
      details: { path: abs },
      cause: err,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (err) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: `catalog JSON 无效: ${abs}`,
      details: { path: abs },
      cause: err,
    });
  }

  return validateCatalog(parsed, abs);
}

export async function writeCatalog(filePath: string, catalog: Catalog): Promise<void> {
  const abs = resolveAbsolutePath(filePath);
  await mkdir(path.dirname(abs), { recursive: true });
  const body = `${JSON.stringify(catalog, null, 2)}\n`;
  await writeFile(abs, body, "utf8");
}

function validateCatalog(value: unknown, source: string): Catalog {
  if (!value || typeof value !== "object") {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "catalog 根必须是对象",
      details: { path: source },
    });
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: `不支持的 catalog.version: ${String(obj.version)}`,
      details: { path: source },
    });
  }
  if (typeof obj.updatedAt !== "string") {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "catalog.updatedAt 必须是字符串",
      details: { path: source },
    });
  }
  if (!obj.skills || typeof obj.skills !== "object") {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "catalog.skills 必须是对象",
      details: { path: source },
    });
  }

  return {
    version: 1,
    updatedAt: obj.updatedAt,
    skills: obj.skills as Catalog["skills"],
  };
}
