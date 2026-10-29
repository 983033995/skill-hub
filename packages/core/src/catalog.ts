import { readFile, writeFile, mkdir, rename, rm, open, lstat, unlink } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
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

/**
 * 对 catalog 的 Skill 内容计算稳定 hash。
 *
 * 不包含 updatedAt，且按 Skill 名排序，避免仅因为 JSON 键顺序或写入时间
 * 变化就误判索引过期。
 */
export function catalogHash(catalog: Catalog): string {
  const normalized = Object.fromEntries(
    Object.keys(catalog.skills)
      .sort()
      .map((name) => [name, stableValue(catalog.skills[name])]),
  );
  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return `sha256:${hash}`;
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
  if (meta.provenance) entry.provenance = { ...meta.provenance };
  return entry;
}

export function catalogToSkillMetas(catalog: Catalog): SkillMeta[] {
  return Object.values(catalog.skills)
    .map((e): SkillMeta => ({
      name: e.name,
      description: e.description,
      path: e.path,
      hash: e.hash,
      mtimeMs: e.mtimeMs ?? 0,
      keywords: e.keywords,
      source: e.source,
      provenance: e.provenance ? { ...e.provenance } : undefined,
    }))
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
    if (options.skipOnHashConflict && existing && existing.hash !== s.hash) {
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
  await withCatalogLock(abs, async () => {
    let existed = true;
    try {
      await lstat(abs);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      existed = false;
    }
    await writeCatalogFile(abs, catalog, existed);
  });
}

/** Serialize catalog read-modify-write operations and merge against the latest on-disk value. */
export async function updateCatalog(
  filePath: string,
  update: (current: Catalog, exists: boolean) => Catalog | Promise<Catalog>,
): Promise<{ previousCatalog: Catalog; catalog: Catalog; existed: boolean }> {
  const abs = resolveAbsolutePath(filePath);
  return withCatalogLock(abs, async () => {
    let existed = true;
    try {
      await lstat(abs);
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
      existed = false;
    }
    const current = existed ? await readCatalog(abs) : createEmptyCatalog();
    const catalog = await update(current, existed);
    if (catalog !== current) await writeCatalogFile(abs, catalog, existed);
    return { previousCatalog: current, catalog, existed };
  });
}

async function withCatalogLock<T>(filePath: string, work: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const lockPath = `${filePath}.lock`;
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      throw new SkillHubError({
        code: "E_CONFLICT",
        message: `另一个 catalog 写入正在运行: ${filePath}`,
        details: { path: filePath, lockPath },
      });
    }
    throw error;
  }
  try {
    return await work();
  } finally {
    await handle.close();
    await unlink(lockPath);
  }
}

async function writeCatalogFile(
  abs: string,
  catalog: Catalog,
  preserveExistingMode = true,
): Promise<void> {
  const body = `${JSON.stringify(catalog, null, 2)}\n`;
  const temporary = `${abs}.${randomUUID()}.tmp`;
  let mode = 0o600;
  if (preserveExistingMode) {
    try {
      mode = (await lstat(abs)).mode & 0o777;
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
  }
  try {
    await writeFile(temporary, body, { encoding: "utf8", mode, flag: "wx" });
    await rename(temporary, abs);
  } finally {
    await rm(temporary, { force: true });
  }
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
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

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stableValue(item));
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableValue(record[key])]),
  );
}
