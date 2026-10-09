/**
 * Hub Skill 的渐进式只读运行时。
 *
 * catalog 中的 Skill 根是唯一信任边界：根目录本身可以是 symlink，但其内部
 * 文件或目录经 realpath 后必须仍在该根内。这样既支持 Agent 投影链接，也不会
 * 让附件读取越过某个 Skill 的目录。
 */

import { lstat, readdir, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { constants } from "node:fs";
import type { SkillMeta } from "@skill-hub/core";
import { sha256Content } from "@skill-hub/core";
import { SkillHubError, isPathInside } from "@skill-hub/shared";
import { loadHubSkills } from "./hub-service.js";
import { loadTaxonomy, tagSkill, type SkillTag } from "./taxonomy.js";

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_OFFSET = MAX_FILE_BYTES;
const DEFAULT_READ_MAX_CHARS = 20_000;
const MAX_READ_MAX_CHARS = 100_000;

export interface SkillListItem {
  name: string;
  description: string;
  path: string;
  provenance: SkillMeta["provenance"];
  tags: SkillTag[];
}

export interface SkillListResult {
  total: number;
  offset: number;
  nextOffset: number | null;
  skills: SkillListItem[];
}

export interface SkillFilesResult {
  name: string;
  path: string;
  offset: number;
  nextOffset: number | null;
  total: number;
  files: Array<{
    path: string;
    type: "file" | "directory" | "blocked";
    size?: number;
    reason?: string;
  }>;
}

export interface SkillReadResult {
  name: string;
  path: string;
  file: string;
  body: string;
  offset: number;
  nextOffset: number | null;
  totalChars: number;
  truncated: boolean;
  hash: string;
}

export async function skillList(
  options: {
    query?: string;
    tag?: string;
    offset?: number;
    limit?: number;
    catalogPath?: string;
    configPath?: string;
    taxonomyPath?: string;
  } = {},
): Promise<SkillListResult> {
  const offset = boundedInteger(options.offset, "offset", 0, MAX_OFFSET);
  const limit = boundedInteger(options.limit, "limit", DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, 1);
  const query = options.query?.trim().toLocaleLowerCase();
  const { skills } = await loadHubSkills({
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  const taxonomy = await loadTaxonomy({ path: options.taxonomyPath });
  const tagFilter = options.tag?.trim();
  const matching = skills
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .filter((skill) => {
      if (!query) return true;
      return `${skill.name}\n${skill.description}`.toLocaleLowerCase().includes(query);
    })
    .filter((skill) => {
      if (!tagFilter) return true;
      return tagSkill(skill, taxonomy).some((t) => t.id === tagFilter);
    });
  const page = matching.slice(offset, offset + limit).map((skill) => ({
    name: skill.name,
    description: skill.description,
    path: skill.path,
    provenance: skill.provenance,
    tags: tagSkill(skill, taxonomy),
  }));
  return {
    total: matching.length,
    offset,
    nextOffset: offset + page.length < matching.length ? offset + page.length : null,
    skills: page,
  };
}

export async function skillFiles(options: {
  name: string;
  path?: string;
  offset?: number;
  limit?: number;
  catalogPath?: string;
  configPath?: string;
}): Promise<SkillFilesResult> {
  const offset = boundedInteger(options.offset, "offset", 0, MAX_OFFSET);
  const limit = boundedInteger(options.limit, "limit", DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, 1);
  const skill = await loadRuntimeSkill(options.name, options.catalogPath, options.configPath);
  const requested = normalizeRelativePath(options.path ?? "", "path", true);
  const directory = await resolveInsideSkill(skill, requested, "目录");
  if (!(await stat(directory.realPath)).isDirectory()) {
    throw runtimePathError("path 必须指向目录", { path: requested || "." });
  }
  const entries = (await readdir(directory.realPath, { withFileTypes: true }))
    .filter((entry) => entry.name !== ".git")
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const page: SkillFilesResult["files"] = [];
  for (const entry of entries.slice(offset, offset + limit)) {
    const relative = requested ? path.posix.join(requested, entry.name) : entry.name;
    try {
      const resolved = await resolveInsideSkill(skill, relative, "文件");
      const info = await stat(resolved.realPath);
      if (!info.isFile() && !info.isDirectory())
        throw runtimePathError("非普通文件", { path: relative });
      page.push({
        path: relative,
        type: info.isDirectory() ? "directory" : "file",
        size: info.isFile() ? info.size : undefined,
      });
    } catch (err) {
      page.push({
        path: relative,
        type: "blocked",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    name: skill.meta.name,
    path: requested,
    offset,
    nextOffset: offset + page.length < entries.length ? offset + page.length : null,
    total: entries.length,
    files: page,
  };
}

export async function skillRead(options: {
  name: string;
  file?: string;
  offset?: number;
  maxChars?: number;
  catalogPath?: string;
  configPath?: string;
}): Promise<SkillReadResult> {
  const offset = boundedInteger(options.offset, "offset", 0, MAX_OFFSET);
  const maxChars = boundedInteger(
    options.maxChars,
    "maxChars",
    DEFAULT_READ_MAX_CHARS,
    MAX_READ_MAX_CHARS,
    1,
  );
  const skill = await loadRuntimeSkill(options.name, options.catalogPath, options.configPath);
  const file = normalizeRelativePath(options.file ?? "SKILL.md", "file", false);
  const target = await resolveInsideSkill(skill, file, "文件");
  if (!(await stat(target.realPath)).isFile()) {
    throw runtimePathError("只能读取普通文件", { file });
  }

  // O_NONBLOCK avoids hanging on a FIFO swapped in between resolution and open.
  const handle = await open(
    target.realPath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let bytes: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw runtimePathError("只能读取普通文件", { file });
    if (info.size > MAX_FILE_BYTES) throw runtimePathError("文件超过 10 MiB 读取上限", { file });
    // Bound memory even if a file grows after stat.
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, null);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    const after = await handle.stat();
    if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs)
      throw runtimePathError("读取期间文件发生变化，请重试", { file });
    bytes = buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
  const body = decodeText(bytes, file);
  if (offset > body.length)
    throw new SkillHubError({ code: "E_CONFIG", message: "offset 超过文件长度" });
  const page = body.slice(offset, offset + maxChars);
  const nextOffset = offset + page.length < body.length ? offset + page.length : null;
  return {
    name: skill.meta.name,
    path: skill.meta.path,
    file,
    body: page,
    offset,
    nextOffset,
    totalChars: body.length,
    truncated: nextOffset !== null,
    hash: sha256Content(bytes),
  };
}

interface RuntimeSkill {
  meta: SkillMeta;
  rootPath: string;
  rootRealPath: string;
}

async function loadRuntimeSkill(
  nameInput: string,
  catalogPath?: string,
  configPath?: string,
): Promise<RuntimeSkill> {
  const name = nameInput.trim();
  if (!name) throw new SkillHubError({ code: "E_CONFIG", message: "需要 skill name" });
  const { skills } = await loadHubSkills({ catalogPath, configPath });
  const meta = skills.find((skill) => skill.name === name);
  if (!meta) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `skill 不存在: ${name}`,
      details: { name },
    });
  }
  try {
    const rootStat = await stat(meta.path);
    if (!rootStat.isDirectory()) {
      throw runtimePathError("skill 根不是目录", { path: meta.path });
    }
    return { meta, rootPath: meta.path, rootRealPath: await realpath(meta.path) };
  } catch (err) {
    if (err instanceof SkillHubError) throw err;
    throw runtimePathError("skill 根不可访问", { path: meta.path }, err);
  }
}

async function resolveInsideSkill(
  skill: RuntimeSkill,
  relativePath: string,
  label: "文件" | "目录",
): Promise<{ realPath: string }> {
  const candidate = path.resolve(skill.rootPath, relativePath);
  let linkStat;
  try {
    linkStat = await lstat(candidate);
  } catch (err) {
    throw runtimePathError(`${label}不存在或不可访问`, { path: relativePath }, err);
  }
  try {
    const visited = new Set([skill.rootRealPath]);
    const segments = relativePath ? relativePath.split("/") : [];
    for (let i = 0; i < segments.length; i++) {
      const partial = await realpath(path.join(skill.rootPath, ...segments.slice(0, i + 1)));
      if (!isPathInside(partial, skill.rootRealPath))
        throw runtimePathError("链接越出 skill 根目录", { path: relativePath });
      if (path.relative(skill.rootRealPath, partial).split(path.sep).includes(".git"))
        throw runtimePathError("禁止读取 Git 内部文件", { path: relativePath });
      if ((await stat(partial)).isDirectory()) {
        if (visited.has(partial))
          throw runtimePathError("检测到目录链接环路", { path: relativePath });
        visited.add(partial);
      }
    }
    const resolved = await realpath(candidate);
    if (!isPathInside(resolved, skill.rootRealPath)) {
      throw runtimePathError(`${label}链接越出 skill 根目录`, {
        path: relativePath,
        root: skill.meta.path,
      });
    }
    // lstat 用于明确触发并验证符号链接；stat 随后只接受普通文件或目录。
    void linkStat;
    return { realPath: resolved };
  } catch (err) {
    if (err instanceof SkillHubError) throw err;
    throw runtimePathError(`${label}链接无效或存在环路`, { path: relativePath }, err);
  }
}

function normalizeRelativePath(value: string, label: string, allowEmpty: boolean): string {
  const raw = value.trim();
  if ((!raw || raw === ".") && allowEmpty) return "";
  if (!raw || raw.includes("\0") || path.isAbsolute(raw) || path.win32.isAbsolute(raw)) {
    throw runtimePathError(`${label} 必须是相对路径`, { path: value });
  }
  const unixPath = raw.replaceAll("\\", "/");
  const segments = unixPath.split("/");
  if (
    segments.some((segment) => segment === ".." || segment === ".git") ||
    segments.some((segment) => !segment)
  ) {
    throw runtimePathError(`${label} 不允许路径穿越`, { path: value });
  }
  const normalized = path.posix.normalize(unixPath);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw runtimePathError(`${label} 不允许路径穿越`, { path: value });
  }
  return normalized;
}

function decodeText(bytes: Buffer, file: string): string {
  // NUL 与非 UTF-8 序列均视为二进制，避免把附件当成正文注入上下文。
  if (bytes.includes(0)) throw runtimePathError("拒绝读取二进制文件", { file });
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    throw runtimePathError("拒绝读取非 UTF-8 文本", { file });
  }
  return text;
}

function boundedInteger(
  value: number | undefined,
  label: string,
  fallback: number,
  maximum: number,
  minimum = 0,
): number {
  const actual = value ?? fallback;
  if (!Number.isSafeInteger(actual) || actual < minimum || actual > maximum) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `${label} 必须是 ${minimum} 到 ${maximum} 的整数`,
      details: { [label]: value },
    });
  }
  return actual;
}

function runtimePathError(
  message: string,
  details: Record<string, unknown>,
  cause?: unknown,
): SkillHubError {
  return new SkillHubError({ code: "E_PATH", message, details, cause });
}
