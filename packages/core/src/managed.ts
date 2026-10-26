/**
 * 来源可追踪的 canonical Skill 安装与更新。
 *
 * 本模块只管理 canonical store 和 stateDir；绝不修改各 Agent 的 skills 目录。
 * 默认 dry-run，真实写入通过 staging + backup + 原子 rename 完成。
 */

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SkillHubError, normalizeSkillName, resolveAbsolutePath } from "@skill-hub/shared";
import { parseSkillMd } from "./parse.js";
import { scanSkills } from "./scan.js";
import { hashSkillTree, inspectSkillTree, type SkillTreeEntry } from "./tree.js";
import type { SkillMeta } from "./types.js";

const execFileAsync = promisify(execFile);

export const MANAGED_LOCK_FILENAME = "managed-lock.json";
const MANAGED_ROLLBACK_FILENAME = "managed-rollback.json";

type ManagedSourceType = "local" | "github";

export type ManagedAction =
  "install" | "update" | "list" | "check-updates" | "adopt" | "rollback" | "migrate-source";

/** Diagnostics for read-only observations; failures never imply an empty/unchanged source. */
export interface ManagedReadIssue {
  phase: "scan" | "local" | "upstream" | "lock" | "cleanup";
  code: string;
  message: string;
  name?: string;
  path?: string;
  hint?: string;
}

/** 单 Skill 的可复现来源。Git commit 只在 github 来源上有值。 */
export interface ManagedSourceLock {
  type: ManagedSourceType;
  /** 本地来源根目录（可以是用户显式配置的根 symlink）。 */
  path?: string;
  /** 仅允许规范化后的 https://github.com/owner/repo.git。 */
  url?: string;
  /** Git ref；未显式指定时为 HEAD。 */
  ref?: string;
  /** Git checkout 的实际 commit。 */
  commit?: string;
  /** 相对于 path 或仓库根的 skill 目录。单 skill 根为 `.`。 */
  subpath: string;
  /** 可选的逻辑基底 Skill 名；仅表示 provenance 关系，不执行合并。 */
  overlayOf?: string;
  /** SKILL.md、附件、空目录和执行位的完整树 hash。 */
  treeHash: string;
}

export interface ManagedLockFile {
  version: 1;
  skills: Record<string, ManagedSourceLock>;
}

export interface ManageSkillsOptions {
  action: ManagedAction;
  /** install/adopt/migrate-source 必需；本地路径、GitHub HTTPS URL 或 owner/repo。 */
  source?: string;
  /** 为空时选择来源扫描到的全部 skill。 */
  names?: string[];
  /** 仅 GitHub 来源可用；update 不允许改写已锁定的 ref。 */
  ref?: string;
  /** install/adopt 单个 fork 时记录逻辑基底；不做自动合并。 */
  overlayOf?: string;
  /** rollback 必需：本机 managed backups/<batch>/<skill> 中的精确备份目录。 */
  backupPath?: string;
  /** Required for update/migrate-source writes; obtained from a matching dry-run preview. */
  planToken?: string;
  canonicalDir: string;
  stateDir: string;
  /** 默认 true；dry-run 不写 hub、state 或 Agent 目录。 */
  dryRun?: boolean;
}

export interface ManagedFileChange {
  path: string;
  change: "added" | "removed" | "modified";
  before?: SkillTreeEntry;
  after?: SkillTreeEntry;
}

export interface ManageSkillItem {
  name: string;
  action:
    | "install"
    | "update"
    | "adopt"
    | "noop"
    | "list"
    | "check-updates"
    | "rollback"
    | "migrate-source";
  status:
    | "planned"
    | "applied"
    | "unchanged"
    | "present"
    | "missing"
    | "modified"
    | "unmanaged"
    | "blocked";
  source?: string;
  sourceTreeHash?: string;
  currentTreeHash?: string;
  backupPath?: string;
  message?: string;
  localStatus?: "clean" | "modified" | "missing" | "blocked" | "unmanaged";
  upstreamStatus?: "changed" | "unchanged" | "unknown";
  /** Compared with the installed source-lock baseline, independently of local edits. */
  updateAvailable?: boolean | null;
  /** Current observation blocks an update; false is not an apply authorization/plan. */
  applyBlocked?: boolean;
  lockedTreeHash?: string;
  currentRevision?: string | null;
  upstreamRevision?: string | null;
  checkedAt?: string;
  errors?: ManagedReadIssue[];
  changes?: ManagedFileChange[];
  /** Metadata-only source changes may have an empty file Diff. */
  sourceLockChanged?: boolean;
  previousSource?: ManagedSourceLock;
  nextSource?: ManagedSourceLock;
}

export interface ManageSkillsResult {
  action: ManagedAction;
  dryRun: boolean;
  canonicalDir: string;
  lockPath: string;
  items: ManageSkillItem[];
  skills: SkillMeta[];
  /** Present on list/check-updates. Local modifications are known states, not read errors. */
  complete?: boolean;
  issues?: ManagedReadIssue[];
  planToken?: string;
}

interface SourceSkill {
  name: string;
  skillPath: string;
  meta: SkillMeta;
  lock: ManagedSourceLock;
}

interface ExistingSkill {
  path: string;
  treeHash: string;
}

interface PlannedSkill {
  source: SourceSkill;
  destination: string;
  existing?: ExistingSkill;
  operation: "install" | "update" | "adopt" | "noop" | "migrate-source";
  previousLock?: ManagedSourceLock;
  changes?: ManagedFileChange[];
}

interface GitCheckout {
  root: string;
  url: string;
  ref: string;
  commit: string;
  cleanup: () => Promise<void>;
}

interface ParsedSourceInput {
  type: ManagedSourceType;
  path?: string;
  url?: string;
}

function isErrno(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pathError(message: string, details?: Record<string, unknown>): SkillHubError {
  return new SkillHubError({ code: "E_PATH", message, details });
}

function conflictError(message: string, details?: Record<string, unknown>): SkillHubError {
  return new SkillHubError({ code: "E_CONFLICT", message, details });
}

function configError(message: string, details?: Record<string, unknown>): SkillHubError {
  return new SkillHubError({ code: "E_CONFIG", message, details });
}

/** 输入路径不可依赖 `..` 穿越；调用方可用绝对路径或 `./relative`。 */
function assertNoPathTraversal(raw: string, label: string): void {
  if (typeof raw !== "string" || !raw.trim()) {
    throw pathError(`${label} 不能为空`);
  }
  if (raw.includes("\0")) {
    throw pathError(`${label} 不能包含 NUL`, { value: raw });
  }
  if (raw.replace(/\\/g, "/").split("/").includes("..")) {
    throw pathError(`${label} 不允许包含路径穿越`, { value: raw });
  }
}

function resolveManagedPath(raw: string, label: string): string {
  assertNoPathTraversal(raw, label);
  return resolveAbsolutePath(raw);
}

function assertSafeSkillName(raw: string): string {
  if (typeof raw !== "string" || !raw.trim() || raw.includes("\0")) {
    throw pathError("skill 名称无效", { name: raw });
  }
  if (raw.includes("/") || raw.includes("\\") || raw === "." || raw === "..") {
    throw pathError("skill 名称不能包含路径", { name: raw });
  }
  return normalizeSkillName(raw);
}

function normalizeRequestedNames(names: string[] | undefined): string[] | undefined {
  if (names === undefined) return undefined;
  if (!Array.isArray(names)) throw configError("names 必须是数组");
  const selected = names.map(assertSafeSkillName);
  if (new Set(selected).size !== selected.length) {
    throw configError("names 包含规范化后重复的 skill 名称", { names });
  }
  return selected;
}

function isInside(root: string, child: string): boolean {
  const relative = path.relative(root, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertInside(root: string, child: string, label: string): void {
  if (!isInside(root, child)) {
    throw pathError(`${label} 越出受管根目录`, { root, path: child });
  }
}

function safeChild(root: string, name: string, label: string): string {
  const child = path.resolve(root, name);
  assertInside(root, child, label);
  return child;
}

function assertSafeSubpath(value: string): void {
  if (typeof value !== "string" || !value || value.includes("\0")) {
    throw configError("来源 subpath 无效", { subpath: value });
  }
  if (value === ".") return;
  if (path.isAbsolute(value) || value.replace(/\\/g, "/").split("/").includes("..")) {
    throw pathError("来源 subpath 不允许路径穿越", { subpath: value });
  }
}

function pathFromSubpath(root: string, subpath: string): string {
  assertSafeSubpath(subpath);
  const child = path.resolve(root, subpath);
  assertInside(root, child, "来源 skill");
  return child;
}

function relativeSubpath(root: string, child: string): string {
  const relative = path.relative(root, child);
  if (relative === "") return ".";
  assertSafeSubpath(relative);
  return relative.split(path.sep).join("/");
}

function validateGitRef(ref: string): string {
  if (typeof ref !== "string" || !ref.trim()) {
    throw configError("Git ref 不能为空");
  }
  const value = ref.trim();
  if (
    value.startsWith("-") ||
    /[\s~^:?*[\\]/.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".") ||
    value.endsWith("/")
  ) {
    throw configError("Git ref 不安全或无效", { ref });
  }
  return value;
}

function normalizeGithubUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw pathError("Git 来源只允许无凭据的 GitHub HTTPS URL", { source: "<invalid GitHub URL>" });
  }
  const parts = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2) {
    throw pathError("GitHub URL 必须是 owner/repo", { source: "<invalid GitHub URL>" });
  }
  const [owner, repoWithSuffix] = parts;
  const repo = repoWithSuffix?.endsWith(".git") ? repoWithSuffix.slice(0, -4) : repoWithSuffix;
  if (!isGithubPart(owner) || !isGithubPart(repo)) {
    throw pathError("GitHub owner/repo 无效", { source: "<invalid GitHub URL>" });
  }
  return `https://github.com/${owner}/${repo}.git`;
}

function isGithubPart(value: string | undefined): value is string {
  return Boolean(
    value && value !== "." && value !== ".." && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value),
  );
}

function normalizeGithubShorthand(raw: string): string | null {
  const parts = raw.split("/");
  if (parts.length !== 2 || !isGithubPart(parts[0]) || !isGithubPart(parts[1])) return null;
  return `https://github.com/${parts[0]}/${parts[1]}.git`;
}

function parseSourceInput(raw: string): ParsedSourceInput {
  if (typeof raw !== "string" || !raw.trim()) {
    throw configError("install/adopt 需要 source");
  }
  const source = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source)) {
    const url = normalizeGithubUrl(source);
    if (!url) throw pathError("Git 来源 URL 无效", { source });
    return { type: "github", url };
  }
  const shorthand = normalizeGithubShorthand(source);
  if (shorthand) return { type: "github", url: shorthand };
  if (/^(git@|ssh:|github\.com\/)/i.test(source)) {
    throw pathError("Git 来源只允许 GitHub HTTPS 或 owner/repo", { source });
  }
  return { type: "local", path: resolveManagedPath(source, "source") };
}

async function rootForRead(raw: string, label: string): Promise<{ path: string; exists: boolean }> {
  const absolute = resolveManagedPath(raw, label);
  try {
    const info = await stat(absolute);
    if (!info.isDirectory()) throw pathError(`${label} 不是目录`, { path: absolute });
    // 根本身可以是用户显式配置的 symlink，后续 child 以 realpath 为边界。
    return { path: await realpath(absolute), exists: true };
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { path: absolute, exists: false };
    throw error;
  }
}

async function ensureRoot(raw: string, label: string): Promise<string> {
  const absolute = resolveManagedPath(raw, label);
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  const info = await stat(absolute);
  if (!info.isDirectory()) throw pathError(`${label} 不是目录`, { path: absolute });
  return realpath(absolute);
}

async function ensureDirectDirectory(dir: string, label: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw pathError(`${label} 不能是 symlink 或普通文件`, { path: dir });
  }
}

async function directoryExists(pathname: string): Promise<boolean> {
  try {
    const info = await lstat(pathname);
    return info.isDirectory() && !info.isSymbolicLink();
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
}

async function inspectCanonicalSkill(
  canonicalRoot: string,
  name: string,
): Promise<ExistingSkill | undefined> {
  const destination = safeChild(canonicalRoot, assertSafeSkillName(name), "canonical skill");
  let info;
  try {
    info = await lstat(destination);
  } catch (error) {
    if (isErrno(error, "ENOENT")) return undefined;
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw pathError("canonical Skill 不能是 symlink", { name, path: destination });
  }
  if (!info.isDirectory()) {
    throw pathError("canonical Skill 不是目录", { name, path: destination });
  }
  return { path: destination, treeHash: await hashSkillTree(destination) };
}

async function findSkillFile(skillDir: string): Promise<string> {
  for (const filename of ["SKILL.md", "skill.md"]) {
    const candidate = path.join(skillDir, filename);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (!isErrno(error, "ENOENT")) throw error;
    }
  }
  throw new SkillHubError({
    code: "E_NOT_FOUND",
    message: `来源目录缺少 SKILL.md: ${skillDir}`,
    details: { path: skillDir },
  });
}

async function parseSourceSkill(
  skillPath: string,
  sourceLock: Omit<ManagedSourceLock, "subpath" | "treeHash"> & { subpath: string },
): Promise<SourceSkill> {
  const allowedRoot = sourceLock.type === "local" ? sourceLock.path : undefined;
  if (allowedRoot)
    assertInside(await realpath(allowedRoot), await realpath(skillPath), "来源 skill");
  const treeHash = await hashSkillTree(skillPath);
  const skillFile = await findSkillFile(skillPath);
  const meta = await parseSkillMd(skillFile, {
    source: sourceLock.url ?? sourceLock.path,
    fallbackName: path.basename(skillPath),
  });
  return {
    name: assertSafeSkillName(meta.name),
    skillPath,
    meta,
    lock: { ...sourceLock, treeHash },
  };
}

function selectNames<T extends { name: string }>(
  candidates: T[],
  requested: string[] | undefined,
  sourceLabel: string,
): T[] {
  const byName = new Map<string, T>();
  for (const candidate of candidates) {
    const name = assertSafeSkillName(candidate.name);
    if (byName.has(name)) {
      throw conflictError("来源包含同名 skill，不能静默选择", {
        name,
        source: sourceLabel,
      });
    }
    byName.set(name, candidate);
  }
  const selectedNames = requested ?? [...byName.keys()].sort((a, b) => a.localeCompare(b));
  const selected: T[] = [];
  for (const name of selectedNames) {
    const candidate = byName.get(name);
    if (!candidate) {
      throw new SkillHubError({
        code: "E_NOT_FOUND",
        message: `来源未扫描到指定 skill: ${name}`,
        details: { name, source: sourceLabel },
      });
    }
    selected.push(candidate);
  }
  if (selected.length === 0) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `来源未扫描到任何 skill: ${sourceLabel}`,
      details: { source: sourceLabel },
    });
  }
  return selected;
}

async function scanSourceRoot(
  root: string,
  sourceBase: Omit<ManagedSourceLock, "subpath" | "treeHash">,
  requested: string[] | undefined,
): Promise<SourceSkill[]> {
  const issues: Array<{ path: string; message: string }> = [];
  const scanned = await scanSkills(root, {
    maxDepth: 10,
    onIssue: (issue) => issues.push(issue),
  });
  if (issues.length > 0) {
    throw pathError("来源扫描不完整，拒绝安装部分 skill", {
      source: sourceBase.url ?? sourceBase.path,
      issues,
    });
  }
  const selected = selectNames(scanned, requested, sourceBase.url ?? sourceBase.path ?? root);
  const resolved: SourceSkill[] = [];
  for (const candidate of selected) {
    const subpath = relativeSubpath(root, candidate.path);
    const skillPath = pathFromSubpath(root, subpath);
    assertInside(await realpath(root), await realpath(skillPath), "来源 skill");
    const source = await parseSourceSkill(skillPath, { ...sourceBase, subpath });
    if (source.name !== candidate.name) {
      throw conflictError("来源扫描结果在读取时发生变化", {
        expected: candidate.name,
        actual: source.name,
        path: skillPath,
      });
    }
    resolved.push(source);
  }
  return resolved.sort((a, b) => a.name.localeCompare(b.name));
}

async function runGit(args: string[], cwd?: string): Promise<string> {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  Object.assign(env, {
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  });
  try {
    const result = await execFileAsync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never", ...args],
      {
        cwd,
        encoding: "utf8",
        timeout: 120_000,
        maxBuffer: 1024 * 1024,
        env,
      },
    );
    return result.stdout.trim();
  } catch (error) {
    throw new SkillHubError({
      code: "E_PATH",
      message: "GitHub 来源获取失败",
      details: { command: "git", args },
      cause: error,
    });
  }
}

async function checkoutGithub(url: string, requestedRef: string | undefined): Promise<GitCheckout> {
  const ref = validateGitRef(requestedRef ?? "HEAD");
  const root = await mkdtemp(path.join(tmpdir(), "skill-hub-git-"));
  const cleanup = async () => {
    await rm(root, { recursive: true, force: true });
  };
  try {
    await runGit(["clone", "--no-checkout", "--no-tags", "--depth=1", url, root]);
    if (ref === "HEAD") {
      await runGit(["-C", root, "checkout", "--detach", "HEAD"]);
    } else {
      await runGit(["-C", root, "fetch", "--no-tags", "--depth=1", "origin", ref]);
      await runGit(["-C", root, "checkout", "--detach", "FETCH_HEAD"]);
    }
    const commit = await runGit(["-C", root, "rev-parse", "--verify", "HEAD^{commit}"]);
    if (!/^[0-9a-f]{40,64}$/i.test(commit)) {
      throw configError("Git 未返回有效 commit", { url, commit });
    }
    return { root, url, ref, commit, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function attachOverlayOf(skills: SourceSkill[], overlayOf: string | undefined): void {
  if (overlayOf === undefined) return;
  if (skills.length !== 1) {
    throw configError("--overlay-of 一次只接受一个 Skill；请使用 --skill 精确选择", {
      count: skills.length,
    });
  }
  const skill = skills[0]!;
  if (skill.name === overlayOf) {
    throw configError("overlayOf 不能指向 Skill 自身", { name: skill.name });
  }
  skill.lock = { ...skill.lock, overlayOf };
}

async function sourcesForInstall(
  source: string,
  ref: string | undefined,
  requested: string[] | undefined,
  overlayOf?: string,
): Promise<{ skills: SourceSkill[]; cleanup: () => Promise<void> }> {
  if (overlayOf !== undefined) {
    if (!overlayOf.trim() || assertSafeSkillName(overlayOf) !== overlayOf) {
      throw configError("overlayOf 必须是规范化的 Skill 名称", { overlayOf });
    }
  }
  const parsed = parseSourceInput(source);
  if (parsed.type === "local") {
    if (ref !== undefined) throw configError("本地来源不能使用 Git ref");
    const sourceRoot = await rootForRead(parsed.path!, "source");
    if (!sourceRoot.exists) throw pathError("本地来源不存在", { path: sourceRoot.path });
    const skills = await scanSourceRoot(
      sourceRoot.path,
      { type: "local", path: sourceRoot.path },
      requested,
    );
    attachOverlayOf(skills, overlayOf);
    return {
      skills,
      cleanup: async () => undefined,
    };
  }
  const checkout = await checkoutGithub(parsed.url!, ref);
  try {
    const skills = await scanSourceRoot(
      checkout.root,
      {
        type: "github",
        url: checkout.url,
        ref: checkout.ref,
        commit: checkout.commit,
      },
      requested,
    );
    attachOverlayOf(skills, overlayOf);
    return {
      skills,
      cleanup: checkout.cleanup,
    };
  } catch (error) {
    await checkout.cleanup();
    throw error;
  }
}

function validateManagedSourceLock(name: string, value: unknown): ManagedSourceLock {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw configError("managed lock skill 记录无效", { name });
  }
  const candidate = value as Partial<ManagedSourceLock>;
  const normalizedName = assertSafeSkillName(name);
  if (normalizedName !== name) {
    throw configError("managed lock skill 名称未规范化", { name });
  }
  if (candidate.type !== "local" && candidate.type !== "github") {
    throw configError("managed lock source type 无效", { name });
  }
  if (typeof candidate.subpath !== "string") {
    throw configError("managed lock 缺少 subpath", { name });
  }
  assertSafeSubpath(candidate.subpath);
  let overlayOf: string | undefined;
  if (candidate.overlayOf !== undefined) {
    if (typeof candidate.overlayOf !== "string") {
      throw configError("managed lock overlayOf 无效", { name });
    }
    overlayOf = assertSafeSkillName(candidate.overlayOf);
    if (overlayOf !== candidate.overlayOf || overlayOf === name) {
      throw configError("managed lock overlayOf 必须是不同的规范化 Skill 名称", {
        name,
        overlayOf: candidate.overlayOf,
      });
    }
  }
  if (
    typeof candidate.treeHash !== "string" ||
    !/^sha256:[0-9a-f]{64}$/i.test(candidate.treeHash)
  ) {
    throw configError("managed lock treeHash 无效", { name });
  }
  if (candidate.type === "local") {
    if (typeof candidate.path !== "string") {
      throw configError("本地 managed lock 缺少 path", { name });
    }
    assertNoPathTraversal(candidate.path, "managed lock path");
    if (
      candidate.url !== undefined ||
      candidate.commit !== undefined ||
      candidate.ref !== undefined
    ) {
      throw configError("本地 managed lock 不能包含 Git 字段", { name });
    }
    return {
      type: "local",
      path: resolveAbsolutePath(candidate.path),
      subpath: candidate.subpath,
      overlayOf,
      treeHash: candidate.treeHash,
    };
  }
  if (
    typeof candidate.url !== "string" ||
    typeof candidate.ref !== "string" ||
    typeof candidate.commit !== "string"
  ) {
    throw configError("GitHub managed lock 缺少 url/ref/commit", { name });
  }
  const url = normalizeGithubUrl(candidate.url);
  if (!url) throw configError("GitHub managed lock URL 无效", { name });
  return {
    type: "github",
    url,
    ref: validateGitRef(candidate.ref),
    commit: /^[0-9a-f]{40,64}$/i.test(candidate.commit)
      ? candidate.commit
      : (() => {
          throw configError("GitHub managed lock commit 无效", { name });
        })(),
    subpath: candidate.subpath,
    overlayOf,
    treeHash: candidate.treeHash,
  };
}

async function readManagedLock(stateRoot: string): Promise<ManagedLockFile> {
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  try {
    return await readManagedLockFile(lockPath, "managed lock");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { version: 1, skills: {} };
    throw error;
  }
}

async function readManagedLockFile(filePath: string, label: string): Promise<ManagedLockFile> {
  const info = await lstat(filePath);
  if (info.isSymbolicLink() || !info.isFile()) {
    throw configError(`${label} 不能是 symlink 或目录`, { path: filePath });
  }
  const raw = await readFile(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `${label} 不是有效 JSON`,
      details: { path: filePath },
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configError(`${label} 必须是对象`, { path: filePath });
  }
  const root = parsed as { version?: unknown; skills?: unknown };
  if (
    root.version !== 1 ||
    !root.skills ||
    typeof root.skills !== "object" ||
    Array.isArray(root.skills)
  ) {
    throw configError(`${label} schema 无效`, { path: filePath });
  }
  const skills: Record<string, ManagedSourceLock> = {};
  for (const [name, source] of Object.entries(root.skills as Record<string, unknown>)) {
    skills[name] = validateManagedSourceLock(name, source);
  }
  return { version: 1, skills };
}

async function unlinkIfPresent(file: string): Promise<void> {
  try {
    await unlink(file);
  } catch (error) {
    if (!isErrno(error, "ENOENT")) throw error;
  }
}

async function finishTransaction(root: string, committed: boolean): Promise<void> {
  try {
    await removeGeneratedDirectory(root, ".managed-txn-");
  } catch (error) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: committed ? "managed 已提交，但临时目录清理失败" : "managed 失败且临时目录清理失败",
      details: { transactionRoot: root },
      cause: error,
    });
  }
}

async function writeManagedLock(stateRoot: string, lock: ManagedLockFile): Promise<void> {
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  const temporary = safeChild(
    stateRoot,
    `.managed-lock-${randomBytes(8).toString("hex")}.tmp`,
    "managed lock 临时文件",
  );
  try {
    await writeFile(temporary, `${JSON.stringify(lock, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, lockPath);
  } finally {
    await unlinkIfPresent(temporary);
  }
}

async function withStateLock<T>(
  stateDir: string,
  work: (stateRoot: string) => Promise<T>,
): Promise<T> {
  const stateRoot = await ensureRoot(stateDir, "stateDir");
  const lockPath = safeChild(stateRoot, ".managed.lock", "managed 原子锁");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      throw conflictError("另一个 managed 操作正在运行", { lockPath });
    }
    throw error;
  }
  try {
    await handle.writeFile(`${process.pid}\n`);
    return await work(stateRoot);
  } finally {
    await handle.close();
    await unlinkIfPresent(lockPath);
  }
}

function sameSource(left: ManagedSourceLock, right: ManagedSourceLock): boolean {
  return (
    left.type === right.type &&
    left.path === right.path &&
    left.url === right.url &&
    left.ref === right.ref &&
    left.subpath === right.subpath &&
    left.overlayOf === right.overlayOf
  );
}

function sourceLabel(source: ManagedSourceLock): string {
  const base = source.url ?? source.path ?? "unknown";
  return source.subpath === "." ? base : `${base}/${source.subpath}`;
}

function provenanceFor(source: ManagedSourceLock): SkillMeta["provenance"] {
  return {
    scope: "user",
    sourceType: source.type === "github" ? "git" : "local",
    sourceRef: source.url ?? source.path,
    revision: source.commit,
    status: "active",
    overlayOf: source.overlayOf,
  };
}

function canonicalMeta(meta: SkillMeta, destination: string, source: ManagedSourceLock): SkillMeta {
  return {
    ...meta,
    path: destination,
    source: sourceLabel(source),
    provenance: provenanceFor(source),
  };
}

async function sourceForLockedSkill(
  name: string,
  lock: ManagedSourceLock,
  resolveCheckout: typeof checkoutGithub = checkoutGithub,
): Promise<{ source: SourceSkill; cleanup: () => Promise<void> }> {
  if (lock.type === "local") {
    const sourceRoot = await rootForRead(lock.path!, "managed lock path");
    if (!sourceRoot.exists) {
      throw pathError("managed lock 的本地来源不存在", { name, path: sourceRoot.path });
    }
    const skillPath = pathFromSubpath(sourceRoot.path, lock.subpath);
    const source = await parseSourceSkill(skillPath, {
      type: "local",
      path: sourceRoot.path,
      subpath: lock.subpath,
      overlayOf: lock.overlayOf,
    });
    if (source.name !== name) {
      throw conflictError("managed lock 来源 skill 名称已变化", {
        expected: name,
        actual: source.name,
        path: skillPath,
      });
    }
    return { source, cleanup: async () => undefined };
  }
  const checkout = await resolveCheckout(lock.url!, lock.ref);
  try {
    const skillPath = pathFromSubpath(checkout.root, lock.subpath);
    assertInside(await realpath(checkout.root), await realpath(skillPath), "Git 来源 skill");
    const source = await parseSourceSkill(skillPath, {
      type: "github",
      url: checkout.url,
      ref: checkout.ref,
      commit: checkout.commit,
      subpath: lock.subpath,
      overlayOf: lock.overlayOf,
    });
    if (source.name !== name) {
      throw conflictError("managed lock Git 来源 skill 名称已变化", {
        expected: name,
        actual: source.name,
        path: lock.subpath,
      });
    }
    return { source, cleanup: checkout.cleanup };
  } catch (error) {
    await checkout.cleanup();
    throw error;
  }
}

async function planInstall(
  sources: SourceSkill[],
  lock: ManagedLockFile,
  canonicalRoot: string,
): Promise<PlannedSkill[]> {
  const plan: PlannedSkill[] = [];
  for (const source of sources) {
    const destination = safeChild(canonicalRoot, source.name, "canonical skill");
    const existing = await inspectCanonicalSkill(canonicalRoot, source.name);
    const locked = lock.skills[source.name];
    if (!existing) {
      if (locked) {
        throw conflictError("managed lock 存在但 canonical Skill 缺失", { name: source.name });
      }
      plan.push({ source, destination, operation: "install" });
      continue;
    }
    if (!locked) {
      throw conflictError("canonical 已有同名 Skill，拒绝覆盖未知来源", {
        name: source.name,
        path: destination,
      });
    }
    if (existing.treeHash !== locked.treeHash) {
      throw conflictError("canonical Skill 存在未受管的本地修改", {
        name: source.name,
        expectedTreeHash: locked.treeHash,
        actualTreeHash: existing.treeHash,
      });
    }
    if (!sameSource(locked, source.lock)) {
      throw conflictError("同名 Skill 已绑定到另一来源", {
        name: source.name,
        existingSource: sourceLabel(locked),
        requestedSource: sourceLabel(source.lock),
      });
    }
    if (existing.treeHash !== source.lock.treeHash) {
      throw conflictError("来源已有新版本，请使用 update", { name: source.name });
    }
    plan.push({ source, destination, existing, operation: "noop" });
  }
  return plan;
}

async function planAdopt(
  sources: SourceSkill[],
  lock: ManagedLockFile,
  canonicalRoot: string,
): Promise<PlannedSkill[]> {
  const plan: PlannedSkill[] = [];
  for (const source of sources) {
    const destination = safeChild(canonicalRoot, source.name, "canonical skill");
    const existing = await inspectCanonicalSkill(canonicalRoot, source.name);
    const locked = lock.skills[source.name];
    if (!existing) {
      throw new SkillHubError({
        code: "E_NOT_FOUND",
        message: "adopt 需要已有 canonical Skill",
        details: { name: source.name, path: destination },
      });
    }
    if (locked) {
      if (
        sameSource(locked, source.lock) &&
        locked.treeHash === existing.treeHash &&
        existing.treeHash === source.lock.treeHash
      ) {
        plan.push({ source, destination, existing, operation: "noop" });
        continue;
      }
      throw conflictError("canonical Skill 已有不同或过期的来源绑定", { name: source.name });
    }
    if (existing.treeHash !== source.lock.treeHash) {
      throw conflictError("adopt 只允许全目录内容完全一致的来源", {
        name: source.name,
        canonicalTreeHash: existing.treeHash,
        sourceTreeHash: source.lock.treeHash,
      });
    }
    plan.push({ source, destination, existing, operation: "adopt" });
  }
  return plan;
}

function treeChanges(before: SkillTreeEntry[], after: SkillTreeEntry[]): ManagedFileChange[] {
  const previous = new Map(
    before.filter((entry) => entry.path).map((entry) => [entry.path, entry]),
  );
  const next = new Map(after.filter((entry) => entry.path).map((entry) => [entry.path, entry]));
  return [...new Set([...previous.keys(), ...next.keys()])].sort().flatMap((filePath) => {
    const a = previous.get(filePath);
    const b = next.get(filePath);
    if (a?.kind === b?.kind && a?.contentHash === b?.contentHash && a?.executable === b?.executable)
      return [];
    return [
      {
        path: filePath,
        change: !a ? "added" : !b ? "removed" : "modified",
        before: a,
        after: b,
      } satisfies ManagedFileChange,
    ];
  });
}

function sourceIdentity(source: ManagedSourceLock) {
  return {
    type: source.type,
    path: source.path ?? null,
    url: source.url ?? null,
    ref: source.ref ?? null,
    commit: source.commit ?? null,
    subpath: source.subpath,
    treeHash: source.treeHash,
    overlayOf: source.overlayOf ?? null,
  };
}

function lockIdentity(lock: ManagedLockFile): string {
  return JSON.stringify(
    Object.keys(lock.skills)
      .sort()
      .map((name) => [name, sourceIdentity(lock.skills[name]!)]),
  );
}

async function recheckManagedLock(stateRoot: string, expected: ManagedLockFile): Promise<void> {
  if (lockIdentity(await readManagedLock(stateRoot)) !== lockIdentity(expected)) {
    throw conflictError("来源锁在更新期间变化，拒绝覆盖；请重新预览", {});
  }
}

function updatePlanToken(
  plan: PlannedSkill[],
  currentLock: ManagedLockFile,
  canonicalRoot: string,
  stateRoot: string,
  action: "update" | "migrate-source" = "update",
): string {
  const payload = {
    contract: action === "update" ? "skill-hub-update-plan-v1" : "skill-hub-migrate-source-plan-v1",
    canonicalRoot,
    stateRoot,
    items: [...plan]
      .sort((a, b) => (a.source.name < b.source.name ? -1 : a.source.name > b.source.name ? 1 : 0))
      .map((entry) => ({
        name: entry.source.name,
        destination: entry.destination,
        operation: entry.operation,
        previousSource: sourceIdentity(currentLock.skills[entry.source.name]!),
        currentTreeHash: entry.existing!.treeHash,
        nextSource: sourceIdentity(entry.source.lock),
      })),
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(payload)).digest("hex")}`;
}

/** Rebind provenance only: neither local edits nor a newer upstream may become the baseline. */
async function planSourceMigration(
  options: ManageSkillsOptions,
  lock: ManagedLockFile,
  canonicalRoot: string,
  stateRoot: string,
): Promise<{ plan: PlannedSkill[]; cleanup: () => Promise<void> }> {
  const name = normalizeRequestedNames(options.names)![0]!;
  const previousLock = lock.skills[name];
  if (!previousLock) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `没有此 Skill 的 managed 来源锁: ${name}`,
    });
  }
  const existing = await inspectCanonicalSkill(canonicalRoot, name);
  if (!existing) throw pathError("来源迁移要求 canonical Skill 存在", { name });
  if (existing.treeHash !== previousLock.treeHash) {
    throw conflictError("检测到 canonical 本地修改，拒绝来源迁移", { name });
  }
  const resolved = await sourcesForInstall(
    options.source!,
    options.ref,
    [name],
    previousLock.overlayOf,
  );
  try {
    const source = resolved.skills[0]!;
    const sourcePath = await realpath(source.skillPath);
    if (
      isInside(canonicalRoot, sourcePath) ||
      isInside(stateRoot, sourcePath) ||
      isInside(sourcePath, canonicalRoot) ||
      isInside(sourcePath, stateRoot)
    ) {
      throw pathError("迁移来源必须独立于 canonical/state 目录", { name });
    }
    if (source.lock.treeHash !== previousLock.treeHash) {
      throw conflictError("新来源内容与已安装锁基线不同；来源迁移不执行内容升级", {
        name,
        expectedTreeHash: previousLock.treeHash,
        actualTreeHash: source.lock.treeHash,
      });
    }
    return {
      plan: [
        {
          source,
          destination: existing.path,
          existing,
          previousLock,
          changes: [],
          operation: sameManagedSourceLock(previousLock, source.lock) ? "noop" : "migrate-source",
        },
      ],
      cleanup: resolved.cleanup,
    };
  } catch (error) {
    await resolved.cleanup();
    throw error;
  }
}

function checkUpdatePlanToken(expected: string | undefined, actual: string): void {
  if (expected !== undefined && expected !== actual) {
    throw conflictError("计划已变化，请重新预览并确认", {});
  }
}

async function planUpdate(
  names: string[] | undefined,
  lock: ManagedLockFile,
  canonicalRoot: string,
): Promise<{ plan: PlannedSkill[]; cleanup: () => Promise<void> }> {
  const selectedNames = names ?? Object.keys(lock.skills).sort((a, b) => a.localeCompare(b));
  if (selectedNames.length === 0) {
    throw new SkillHubError({ code: "E_NOT_FOUND", message: "没有可更新的 managed Skill" });
  }
  const cleanups: Array<() => Promise<void>> = [];
  try {
    const plan: PlannedSkill[] = [];
    for (const name of selectedNames) {
      const sourceLock = lock.skills[name];
      if (!sourceLock) {
        throw new SkillHubError({
          code: "E_NOT_FOUND",
          message: `没有此 Skill 的 managed 来源锁: ${name}`,
          details: { name },
        });
      }
      const existing = await inspectCanonicalSkill(canonicalRoot, name);
      if (!existing) {
        throw new SkillHubError({
          code: "E_NOT_FOUND",
          message: "managed lock 对应的 canonical Skill 不存在",
          details: { name },
        });
      }
      if (existing.treeHash !== sourceLock.treeHash) {
        throw conflictError("检测到 canonical Skill 全目录本地修改，拒绝 update", {
          name,
          expectedTreeHash: sourceLock.treeHash,
          actualTreeHash: existing.treeHash,
        });
      }
      const resolved = await sourceForLockedSkill(name, sourceLock);
      cleanups.push(resolved.cleanup);
      const [before, after] = await Promise.all([
        inspectSkillTree(existing.path),
        inspectSkillTree(resolved.source.skillPath),
      ]);
      if (
        before.treeHash !== existing.treeHash ||
        after.treeHash !== resolved.source.lock.treeHash
      ) {
        throw conflictError("Skill 内容在生成更新计划期间变化，请重新预览", { name });
      }
      plan.push({
        source: resolved.source,
        destination: safeChild(canonicalRoot, name, "canonical skill"),
        existing,
        operation: existing.treeHash === resolved.source.lock.treeHash ? "noop" : "update",
        previousLock: sourceLock,
        changes: treeChanges(before.entries, after.entries),
      });
    }
    return {
      plan,
      cleanup: async () => {
        await Promise.all(cleanups.map((cleanup) => cleanup()));
      },
    };
  } catch (error) {
    await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
    throw error;
  }
}

async function planRollback(
  name: string,
  backupPath: string,
  lock: ManagedLockFile,
  canonicalRoot: string,
  stateRoot: string,
): Promise<PlannedSkill> {
  const currentLock = lock.skills[name];
  if (!currentLock) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `没有此 Skill 的 managed 来源锁: ${name}`,
      details: { name },
    });
  }

  const existing = await inspectCanonicalSkill(canonicalRoot, name);
  if (!existing) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: "managed lock 对应的 canonical Skill 不存在",
      details: { name },
    });
  }
  if (existing.treeHash !== currentLock.treeHash) {
    throw conflictError("检测到 canonical Skill 全目录本地修改，拒绝 rollback", {
      name,
      expectedTreeHash: currentLock.treeHash,
      actualTreeHash: existing.treeHash,
    });
  }

  const backupsRoot = safeChild(stateRoot, "backups", "managed backups");
  let backupsInfo;
  try {
    backupsInfo = await lstat(backupsRoot);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      throw new SkillHubError({
        code: "E_NOT_FOUND",
        message: "managed backups 目录不存在",
        details: { path: backupsRoot },
      });
    }
    throw error;
  }
  if (backupsInfo.isSymbolicLink() || !backupsInfo.isDirectory()) {
    throw pathError("managed backups 不能是 symlink 或普通文件", { path: backupsRoot });
  }
  const backupsReal = await realpath(backupsRoot);
  const requestedBackup = resolveManagedPath(backupPath, "rollback backupPath");
  const relative = path.relative(backupsReal, requestedBackup);
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative) ||
    parts.length !== 2 ||
    parts[0] === ".." ||
    parts[0] === "" ||
    parts[1] !== name
  ) {
    throw pathError("rollback 仅接受 managed backups/<batch>/<skill> 中的精确 Skill 备份路径", {
      path: requestedBackup,
      name,
    });
  }
  const batchId = parts[0]!;
  if (!/^\d{17}-\d+-[0-9a-f]{12}$/.test(batchId)) {
    throw pathError("rollback 备份批次名称无效", { batchId });
  }
  const batchDir = safeChild(backupsReal, batchId, "managed rollback batch");
  const batchInfo = await lstat(batchDir);
  if (batchInfo.isSymbolicLink() || !batchInfo.isDirectory()) {
    throw pathError("managed rollback batch 不能是 symlink 或普通文件", { path: batchDir });
  }
  const batchReal = await realpath(batchDir);
  if (batchReal !== batchDir || path.dirname(batchReal) !== backupsReal) {
    throw pathError("managed rollback batch 必须是 backups 下的直接子目录", {
      path: batchDir,
    });
  }

  const selectedBackup = safeChild(batchReal, name, "managed rollback skill");
  const backupInfo = await lstat(selectedBackup);
  if (backupInfo.isSymbolicLink() || !backupInfo.isDirectory()) {
    throw pathError("managed rollback Skill 备份必须是普通目录", { path: selectedBackup });
  }
  const backupReal = await realpath(selectedBackup);
  if (backupReal !== selectedBackup || path.dirname(backupReal) !== batchReal) {
    throw pathError("managed rollback Skill 备份必须是批次内的直接子目录", {
      path: selectedBackup,
    });
  }

  const previousLock = (await readManagedRollbackLock(batchReal, batchId)).skills[name];
  if (!previousLock) {
    throw new SkillHubError({
      code: "E_NOT_FOUND",
      message: `回滚快照中没有 Skill: ${name}`,
      details: { name, path: batchReal },
    });
  }
  const backupHash = await hashSkillTree(backupReal);
  if (backupHash !== previousLock.treeHash) {
    throw new SkillHubError({
      code: "E_BACKUP",
      message: "回滚备份与其来源锁 treeHash 不一致",
      details: { name, expected: previousLock.treeHash, actual: backupHash },
    });
  }

  const skillFile = await findSkillFile(backupReal);
  const meta = await parseSkillMd(skillFile, {
    source: sourceLabel(previousLock),
    provenance: provenanceFor(previousLock),
    fallbackName: name,
  });
  if (meta.name !== name) {
    throw conflictError("回滚备份中的 Skill 名称与目标不一致", {
      expected: name,
      actual: meta.name,
      path: backupReal,
    });
  }

  return {
    source: { name, skillPath: backupReal, meta, lock: previousLock },
    destination: safeChild(canonicalRoot, name, "canonical skill"),
    existing,
    operation:
      existing.treeHash === previousLock.treeHash &&
      sameManagedSourceLock(currentLock, previousLock)
        ? "noop"
        : "update",
  };
}

function sameManagedSourceLock(left: ManagedSourceLock, right: ManagedSourceLock): boolean {
  return (
    left.type === right.type &&
    left.path === right.path &&
    left.url === right.url &&
    left.ref === right.ref &&
    left.commit === right.commit &&
    left.subpath === right.subpath &&
    left.overlayOf === right.overlayOf &&
    left.treeHash === right.treeHash
  );
}

async function copySkillTree(source: string, destination: string): Promise<void> {
  await cp(source, destination, {
    recursive: true,
    force: false,
    errorOnExist: true,
    // `hashSkillTree` 已在复制前拒绝越界/环路；canonical 不能保留指向来源的链接。
    dereference: true,
    filter: (entry) => path.basename(entry) !== ".git",
  });
}

function batchName(): string {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "")}-${process.pid}-${randomBytes(6).toString("hex")}`;
}

async function backupExistingSkills(
  stateRoot: string,
  plan: PlannedSkill[],
  currentLock: ManagedLockFile,
): Promise<{ backupDir?: string; backupPaths: Map<string, string> }> {
  const updates = plan.filter(
    (entry) =>
      (entry.operation === "update" || entry.operation === "migrate-source") && entry.existing,
  );
  if (updates.length === 0) return { backupPaths: new Map() };
  const backupBase = safeChild(stateRoot, "backups", "managed backups");
  await ensureDirectDirectory(backupBase, "managed backups");
  const backupDir = safeChild(backupBase, batchName(), "managed backup 批次");
  await mkdir(backupDir, { recursive: false, mode: 0o700 });
  const backupPaths = new Map<string, string>();
  for (const entry of updates) {
    const backupPath = safeChild(backupDir, entry.source.name, "managed backup skill");
    await copySkillTree(entry.existing!.path, backupPath);
    const backupHash = await hashSkillTree(backupPath);
    if (backupHash !== entry.existing!.treeHash) {
      throw new SkillHubError({
        code: "E_BACKUP",
        message: "Skill backup 树 hash 校验失败",
        details: {
          name: entry.source.name,
          expected: entry.existing!.treeHash,
          actual: backupHash,
        },
      });
    }
    backupPaths.set(entry.source.name, backupPath);
  }
  const rollbackSkills: Record<string, ManagedSourceLock> = {};
  for (const entry of updates) {
    const previousLock = currentLock.skills[entry.source.name];
    if (!previousLock || previousLock.treeHash !== entry.existing!.treeHash) {
      throw new SkillHubError({
        code: "E_CONFLICT",
        message: "managed lock 与待备份 Skill 不一致，拒绝建立回滚点",
        details: { name: entry.source.name },
      });
    }
    rollbackSkills[entry.source.name] = previousLock;
  }
  await writeManagedRollbackManifest(backupDir, rollbackSkills);
  return { backupDir, backupPaths };
}

async function writeManagedRollbackManifest(
  backupDir: string,
  skills: Record<string, ManagedSourceLock>,
): Promise<void> {
  const target = safeChild(backupDir, MANAGED_ROLLBACK_FILENAME, "managed rollback manifest");
  const temporary = safeChild(
    backupDir,
    `.managed-rollback-${randomBytes(8).toString("hex")}.tmp`,
    "managed rollback manifest 临时文件",
  );
  try {
    await writeFile(
      temporary,
      `${JSON.stringify({ version: 1, batchId: path.basename(backupDir), skills }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    await rename(temporary, target);
  } finally {
    await unlinkIfPresent(temporary);
  }
}

async function readManagedRollbackLock(
  batchDir: string,
  batchId: string,
): Promise<ManagedLockFile> {
  const manifestPath = safeChild(batchDir, MANAGED_ROLLBACK_FILENAME, "managed rollback manifest");
  let info;
  try {
    info = await lstat(manifestPath);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      throw new SkillHubError({
        code: "E_NOT_FOUND",
        message: "该旧备份没有受支持的来源锁快照，不能安全回滚",
        details: { path: manifestPath },
        cause: error,
      });
    }
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw configError("managed rollback manifest 不能是 symlink 或目录", {
      path: manifestPath,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: "managed rollback manifest 不是有效 JSON",
        details: { path: manifestPath },
        cause: error,
      });
    }
    throw error;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw configError("managed rollback manifest 必须是对象", { path: manifestPath });
  }
  const manifest = raw as { version?: unknown; batchId?: unknown; skills?: unknown };
  if (
    manifest.version !== 1 ||
    manifest.batchId !== batchId ||
    !manifest.skills ||
    typeof manifest.skills !== "object" ||
    Array.isArray(manifest.skills)
  ) {
    throw configError("managed rollback manifest schema 或批次无效", {
      path: manifestPath,
      expectedBatchId: batchId,
    });
  }
  const skills: Record<string, ManagedSourceLock> = {};
  for (const [name, source] of Object.entries(manifest.skills as Record<string, unknown>)) {
    skills[name] = validateManagedSourceLock(name, source);
  }
  return { version: 1, skills };
}

async function removeGeneratedDirectory(root: string | undefined, marker: string): Promise<void> {
  if (!root) return;
  if (!path.basename(root).startsWith(marker)) {
    throw new SkillHubError({
      code: "E_INTERNAL",
      message: "拒绝删除非受管临时目录",
      details: { root },
    });
  }
  await rm(root, { recursive: true, force: true });
}

async function stageChanges(
  canonicalRoot: string,
  plan: PlannedSkill[],
): Promise<{ transactionRoot?: string; staged: Map<string, string> }> {
  const changes = plan.filter(
    (entry) => entry.operation === "install" || entry.operation === "update",
  );
  for (const entry of changes) {
    const source = await realpath(entry.source.skillPath);
    if (isInside(source, canonicalRoot)) throw pathError("canonical 不得位于 Skill 来源内部");
  }
  if (changes.length === 0) return { staged: new Map() };
  const transactionRoot = await mkdtemp(path.join(canonicalRoot, ".managed-txn-"));
  const stagingRoot = safeChild(transactionRoot, "staging", "managed staging");
  await mkdir(stagingRoot, { recursive: false, mode: 0o700 });
  const staged = new Map<string, string>();
  try {
    for (const entry of changes) {
      const stagedPath = safeChild(stagingRoot, entry.source.name, "managed staged skill");
      await copySkillTree(entry.source.skillPath, stagedPath);
      const stagedHash = await hashSkillTree(stagedPath);
      if (stagedHash !== entry.source.lock.treeHash) {
        throw new SkillHubError({
          code: "E_SYNC",
          message: "staging 后的 Skill tree hash 不一致",
          details: {
            name: entry.source.name,
            expected: entry.source.lock.treeHash,
            actual: stagedHash,
          },
        });
      }
      staged.set(entry.source.name, stagedPath);
    }
    return { transactionRoot, staged };
  } catch (error) {
    await removeGeneratedDirectory(transactionRoot, ".managed-txn-");
    throw error;
  }
}

async function recheckPlanBeforeReplace(
  canonicalRoot: string,
  plan: PlannedSkill[],
): Promise<void> {
  for (const entry of plan) {
    if (entry.existing) {
      const current = await inspectCanonicalSkill(canonicalRoot, entry.source.name);
      if (!current || !entry.existing || current.treeHash !== entry.existing.treeHash) {
        throw conflictError("canonical Skill 在更新期间发生变化", { name: entry.source.name });
      }
      continue;
    }
    if (entry.operation === "install") {
      const current = await inspectCanonicalSkill(canonicalRoot, entry.source.name);
      if (current) {
        throw conflictError("canonical Skill 在安装期间已出现同名目录", {
          name: entry.source.name,
        });
      }
    }
  }
}

interface AppliedChange {
  entry: PlannedSkill;
  previousPath?: string;
}

async function rollbackChanges(transactionRoot: string, applied: AppliedChange[]): Promise<void> {
  const failedRoot = safeChild(transactionRoot, "failed", "managed failed staging");
  await mkdir(failedRoot, { recursive: true, mode: 0o700 });
  for (const [index, change] of [...applied].reverse().entries()) {
    const destination = change.entry.destination;
    if (await directoryExists(destination)) {
      const failedPath = safeChild(
        failedRoot,
        `${index}-${change.entry.source.name}`,
        "managed failed Skill",
      );
      await rename(destination, failedPath);
    }
    if (change.previousPath) {
      await rename(change.previousPath, destination);
    }
  }
}

async function applyPlan(
  action: ManagedAction,
  plan: PlannedSkill[],
  currentLock: ManagedLockFile,
  canonicalRoot: string,
  stateRoot: string,
  dryRun: boolean,
): Promise<ManageSkillsResult> {
  const nextLock: ManagedLockFile = { version: 1, skills: { ...currentLock.skills } };
  for (const entry of plan) nextLock.skills[entry.source.name] = entry.source.lock;
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  if (dryRun) {
    return resultFromPlan(action, true, canonicalRoot, lockPath, plan);
  }

  const { transactionRoot, staged } = await stageChanges(canonicalRoot, plan);
  const applied: AppliedChange[] = [];
  let committed = false;
  let preserveTransaction = false;
  let backups: { backupDir?: string; backupPaths: Map<string, string> } = {
    backupPaths: new Map(),
  };
  try {
    await recheckPlanBeforeReplace(canonicalRoot, plan);
    if (action === "update" || action === "migrate-source")
      await recheckManagedLock(stateRoot, currentLock);
    backups = await backupExistingSkills(stateRoot, plan, currentLock);
    const rollbackRoot = transactionRoot
      ? safeChild(transactionRoot, "rollback", "managed rollback staging")
      : undefined;
    if (rollbackRoot) await mkdir(rollbackRoot, { recursive: true, mode: 0o700 });

    for (const entry of plan) {
      if (entry.operation !== "install" && entry.operation !== "update") continue;
      await recheckPlanBeforeReplace(canonicalRoot, [entry]);
      const stagedPath = staged.get(entry.source.name);
      if (!stagedPath) {
        throw new SkillHubError({
          code: "E_INTERNAL",
          message: "缺少 staged Skill",
          details: { name: entry.source.name },
        });
      }
      if (entry.operation === "install") {
        await rename(stagedPath, entry.destination);
        applied.push({ entry });
        continue;
      }
      const previousPath = safeChild(rollbackRoot!, entry.source.name, "managed rollback Skill");
      await rename(entry.destination, previousPath);
      applied.push({ entry, previousPath });
      await rename(stagedPath, entry.destination);
    }
    if (action === "migrate-source") {
      await recheckPlanBeforeReplace(canonicalRoot, plan);
      for (const entry of plan) {
        if ((await hashSkillTree(entry.source.skillPath)) !== entry.source.lock.treeHash) {
          throw conflictError("新来源在迁移期间变化，请重新预览", { name: entry.source.name });
        }
      }
    }
    if (action === "update" || action === "migrate-source")
      await recheckManagedLock(stateRoot, currentLock);
    await writeManagedLock(stateRoot, nextLock);
    committed = true;
    const result = await resultFromPlan(
      action,
      false,
      canonicalRoot,
      lockPath,
      plan,
      backups.backupPaths,
    );
    return result;
  } catch (error) {
    if (!committed && transactionRoot && applied.length) {
      try {
        await rollbackChanges(transactionRoot, applied);
      } catch (rollbackError) {
        preserveTransaction = true;
        throw new SkillHubError({
          code: "E_SYNC",
          message: "managed 更新失败且恢复不完整，保留事务目录与备份",
          details: {
            transactionRoot,
            backupDir: backups.backupDir,
            originalError: asErrorMessage(error),
            rollbackError: asErrorMessage(rollbackError),
          },
        });
      }
    }
    throw error;
  } finally {
    if (transactionRoot && !preserveTransaction)
      await finishTransaction(transactionRoot, committed);
  }
}

async function resultFromPlan(
  action: ManagedAction,
  dryRun: boolean,
  canonicalRoot: string,
  lockPath: string,
  plan: PlannedSkill[],
  backupPaths: Map<string, string> = new Map(),
): Promise<ManageSkillsResult> {
  const skills: SkillMeta[] = [];
  for (const entry of plan) {
    if (dryRun) {
      skills.push(canonicalMeta(entry.source.meta, entry.destination, entry.source.lock));
      continue;
    }
    const file = await findSkillFile(entry.destination);
    const meta = await parseSkillMd(file, {
      source: sourceLabel(entry.source.lock),
      provenance: provenanceFor(entry.source.lock),
      fallbackName: entry.source.name,
    });
    skills.push(canonicalMeta(meta, entry.destination, entry.source.lock));
  }
  return {
    action,
    dryRun,
    canonicalDir: canonicalRoot,
    lockPath,
    items: plan.map((entry) => ({
      name: entry.source.name,
      action: action === "rollback" ? "rollback" : entry.operation,
      status: dryRun ? "planned" : entry.operation === "noop" ? "unchanged" : "applied",
      source: sourceLabel(entry.source.lock),
      sourceTreeHash: entry.source.lock.treeHash,
      currentTreeHash: entry.existing?.treeHash,
      backupPath: backupPaths.get(entry.source.name),
      ...(action === "migrate-source"
        ? { previousSource: entry.previousLock, nextSource: entry.source.lock }
        : {}),
      ...(entry.changes !== undefined
        ? {
            changes: entry.changes,
            currentRevision: entry.previousLock?.commit ?? null,
            upstreamRevision: entry.source.lock.commit ?? null,
            sourceLockChanged:
              JSON.stringify(sourceIdentity(entry.previousLock!)) !==
              JSON.stringify(sourceIdentity(entry.source.lock)),
          }
        : {}),
    })),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function readIssue(
  error: unknown,
  phase: ManagedReadIssue["phase"],
  name?: string,
  filePath?: string,
): ManagedReadIssue {
  return {
    phase,
    code: error instanceof SkillHubError ? error.code : "E_PATH",
    message: asErrorMessage(error),
    ...(name ? { name } : {}),
    ...(filePath ? { path: filePath } : {}),
  };
}

async function checkManagedUpdates(
  canonical: { path: string; exists: boolean },
  stateRoot: string,
  lock: ManagedLockFile,
  requested: string[] | undefined,
): Promise<ManageSkillsResult> {
  const items: ManageSkillItem[] = [];
  const issues: ManagedReadIssue[] = [];
  // One immutable checkout per repository/ref within this invocation, including failed attempts.
  // No persistent cache and no writes to Hub state are required.
  const checkouts = new Map<string, Promise<GitCheckout>>();
  const resolveCheckout: typeof checkoutGithub = async (url, ref) => {
    const key = JSON.stringify([url, ref ?? "HEAD"]);
    let pending = checkouts.get(key);
    if (!pending) {
      pending = checkoutGithub(url, ref);
      checkouts.set(key, pending);
    }
    const checkout = await pending;
    return { ...checkout, cleanup: async () => undefined };
  };
  const names = requested ?? Object.keys(lock.skills).sort((a, b) => a.localeCompare(b));
  try {
    for (const name of names) {
      const source = lock.skills[name];
      const item: ManageSkillItem = {
        name,
        action: "check-updates",
        status: "blocked",
        localStatus: "blocked",
        upstreamStatus: "unknown",
        updateAvailable: null,
        errors: [],
      };
      if (!source) {
        item.status = "unmanaged";
        item.localStatus = "unmanaged";
        item.errors!.push(
          readIssue(
            new SkillHubError({
              code: "E_NOT_FOUND",
              message: "没有此 Skill 的 managed 来源锁",
            }),
            "lock",
            name,
          ),
        );
      } else {
        item.source = sourceLabel(source);
        item.lockedTreeHash = source.treeHash;
        item.currentRevision = source.commit ?? null;
        item.upstreamRevision = null;
        try {
          const current = canonical.exists
            ? await inspectCanonicalSkill(canonical.path, name)
            : undefined;
          if (!current) {
            item.status = "missing";
            item.localStatus = "missing";
            item.errors!.push(readIssue(pathError("canonical Skill 不存在", {}), "local", name));
          } else {
            item.currentTreeHash = current.treeHash;
            item.localStatus = current.treeHash === source.treeHash ? "clean" : "modified";
            item.status = item.localStatus === "clean" ? "present" : "modified";
          }
        } catch (error) {
          item.errors!.push(readIssue(error, "local", name));
        }
        // A local edit/missing target must not hide whether the recorded upstream changed.
        try {
          const resolved = await sourceForLockedSkill(name, source, resolveCheckout);
          try {
            item.sourceTreeHash = resolved.source.lock.treeHash;
            item.upstreamRevision = resolved.source.lock.commit ?? null;
            item.updateAvailable = source.treeHash !== resolved.source.lock.treeHash;
            item.upstreamStatus = item.updateAvailable ? "changed" : "unchanged";
          } finally {
            await resolved.cleanup();
          }
        } catch (error) {
          item.errors!.push({
            ...readIssue(error, "upstream", name, sourceLabel(source)),
            hint: "核对锁定来源路径/ref与访问错误；若来源已移动，显式使用 migrate-source <name> --source <新来源> 预览。新来源须与安装基线同内容；不要手改锁或自动猜上游。",
          });
        }
      }
      item.checkedAt = new Date().toISOString();
      item.applyBlocked = item.localStatus !== "clean" || item.upstreamStatus === "unknown";
      issues.push(...item.errors!);
      items.push(item);
    }
  } finally {
    for (const outcome of await Promise.allSettled(checkouts.values())) {
      if (outcome.status !== "fulfilled") continue; // Fetch error already belongs to each affected item.
      try {
        await outcome.value.cleanup();
      } catch (error) {
        issues.push(readIssue(error, "cleanup"));
      }
    }
  }
  return {
    action: "check-updates",
    dryRun: true,
    canonicalDir: canonical.path,
    lockPath: safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock"),
    items,
    skills: [],
    complete: issues.length === 0,
    issues,
  };
}

async function listManagedSkills(
  canonical: { path: string; exists: boolean },
  stateRoot: string,
  lock: ManagedLockFile,
  requested: string[] | undefined,
): Promise<ManageSkillsResult> {
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  const issues: ManagedReadIssue[] = [];
  if (!canonical.exists) {
    issues.push(
      readIssue(pathError("canonical 目录不存在", {}), "scan", undefined, canonical.path),
    );
    return {
      action: "list",
      dryRun: true,
      canonicalDir: canonical.path,
      lockPath,
      items: (requested ?? Object.keys(lock.skills))
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          action: "list",
          status: "missing",
          source: lock.skills[name] ? sourceLabel(lock.skills[name]!) : undefined,
        })),
      skills: [],
      complete: false,
      issues,
    };
  }
  let scanned: SkillMeta[] = [];
  try {
    scanned = await scanSkills(canonical.path, {
      onIssue: (issue) => issues.push({ ...issue, phase: "scan", code: "E_PATH" }),
    });
  } catch (error) {
    issues.push(readIssue(error, "scan", undefined, canonical.path));
  }
  const selected = requested ? scanned.filter((meta) => requested.includes(meta.name)) : scanned;
  const skills: SkillMeta[] = [];
  const presentItems: ManageSkillItem[] = [];
  for (const meta of selected) {
    const source = lock.skills[meta.name];
    try {
      const actualPath = await realpath(meta.path);
      assertInside(canonical.path, actualPath, "canonical skill");
      if ((await lstat(meta.path)).isSymbolicLink()) {
        throw pathError("canonical Skill 不能是 symlink", { name: meta.name, path: meta.path });
      }
      const currentTreeHash = await hashSkillTree(actualPath);
      skills.push(source ? canonicalMeta(meta, actualPath, source) : { ...meta, path: actualPath });
      presentItems.push({
        name: meta.name,
        action: "list",
        status: !source
          ? "unmanaged"
          : currentTreeHash === source.treeHash
            ? "present"
            : "modified",
        source: source ? sourceLabel(source) : undefined,
        currentTreeHash,
        sourceTreeHash: source?.treeHash,
      });
    } catch (error) {
      const issue = readIssue(error, "local", meta.name, meta.path);
      issues.push(issue);
      presentItems.push({
        name: meta.name,
        action: "list",
        status: "blocked",
        message: asErrorMessage(error),
        errors: [issue],
      });
    }
  }
  const observed = new Set(presentItems.map((item) => item.name));
  for (const name of requested ?? Object.keys(lock.skills)) {
    if (observed.has(name)) continue;
    const target = safeChild(canonical.path, name, "canonical skill");
    const relevant = issues.filter(
      (issue) =>
        issue.phase === "scan" &&
        issue.path !== undefined &&
        (issue.path === target ||
          issue.path.startsWith(target + path.sep) ||
          target.startsWith(issue.path + path.sep)),
    );
    const issue =
      relevant[0] ??
      readIssue(
        new SkillHubError({ code: "E_NOT_FOUND", message: "canonical Skill 未发现" }),
        "local",
        name,
        target,
      );
    if (!relevant.length) issues.push(issue);
    presentItems.push({
      name,
      action: "list",
      status: relevant.length ? "blocked" : "missing",
      source: lock.skills[name] ? sourceLabel(lock.skills[name]!) : undefined,
      message: issue.message,
      errors: relevant.length ? relevant : [issue],
    });
  }
  return {
    action: "list",
    dryRun: true,
    canonicalDir: canonical.path,
    lockPath,
    items: presentItems.sort((a, b) => a.name.localeCompare(b.name)),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
    complete: issues.length === 0,
    issues,
  };
}

/**
 * 安装、更新、列出、回滚或显式 adopt canonical Skill。
 *
 * `install`/`adopt` 要求 source；`update` 只使用 state lock 中的来源，
 * 以避免调用方在同名 skill 上偷偷更换来源。
 */
export async function manageSkills(options: ManageSkillsOptions): Promise<ManageSkillsResult> {
  if (
    !["install", "update", "list", "check-updates", "adopt", "rollback", "migrate-source"].includes(
      options.action,
    )
  ) {
    throw configError("未知 managed action", { action: options.action });
  }
  const requested = normalizeRequestedNames(options.names);
  const dryRun = options.dryRun ?? true;
  if (
    options.planToken !== undefined &&
    (!["update", "migrate-source"].includes(options.action) ||
      !/^sha256:[0-9a-f]{64}$/.test(options.planToken))
  ) {
    throw configError("planToken 仅适用于 update/migrate-source，且必须是预览返回的 sha256 指纹");
  }
  if (
    ["update", "migrate-source"].includes(options.action) &&
    !dryRun &&
    options.planToken === undefined
  ) {
    throw configError(`${options.action} 写入需要预览的 planToken；先预览，再传 --plan-token`);
  }
  if (
    options.action === "check-updates" &&
    (!dryRun ||
      options.source !== undefined ||
      options.ref !== undefined ||
      options.backupPath !== undefined)
  ) {
    throw configError("check-updates 只读，且只能使用 managed lock 中的来源与 ref");
  }
  const canonical = await rootForRead(options.canonicalDir, "canonicalDir");
  const state = await rootForRead(options.stateDir, "stateDir");

  if (
    options.overlayOf !== undefined &&
    options.action !== "install" &&
    options.action !== "adopt"
  ) {
    throw configError("--overlay-of 仅适用于 install/adopt");
  }

  if (options.action === "list") {
    const lock = await readManagedLock(state.path);
    return listManagedSkills(canonical, state.path, lock, requested);
  }
  if (options.action === "check-updates") {
    const lock = await readManagedLock(state.path);
    return checkManagedUpdates(canonical, state.path, lock, requested);
  }
  if (options.action === "update" && (options.source !== undefined || options.ref !== undefined)) {
    throw configError("update 只能使用 managed lock 中的来源与 ref");
  }
  if (
    options.action === "migrate-source" &&
    (!options.source || requested?.length !== 1 || options.backupPath !== undefined)
  ) {
    throw configError("migrate-source 需要一个 managed Skill 名称和显式 source，不接受 backupPath");
  }
  if ((options.action === "install" || options.action === "adopt") && !options.source) {
    throw configError(`${options.action} 需要 source`);
  }
  if (options.action === "rollback") {
    if (options.source !== undefined || options.ref !== undefined) {
      throw configError("rollback 不接受 source 或 ref");
    }
    if (requested?.length !== 1) {
      throw configError("rollback 一次只接受一个 Skill name");
    }
    if (!options.backupPath) {
      throw configError("rollback 需要 --from <managed backup skill path>");
    }
  }

  if (dryRun) {
    const lock = await readManagedLock(state.path);
    if (options.action === "update" || options.action === "migrate-source") {
      if (!canonical.exists) throw pathError("canonicalDir 不存在", { path: canonical.path });
      const update =
        options.action === "update"
          ? await planUpdate(requested, lock, canonical.path)
          : await planSourceMigration(options, lock, canonical.path, state.path);
      try {
        const planToken = updatePlanToken(
          update.plan,
          lock,
          canonical.path,
          state.path,
          options.action,
        );
        checkUpdatePlanToken(options.planToken, planToken);
        return {
          ...(await resultFromPlan(
            options.action,
            true,
            canonical.path,
            safeChild(state.path, MANAGED_LOCK_FILENAME, "managed lock"),
            update.plan,
          )),
          planToken,
        };
      } finally {
        await update.cleanup();
      }
    }
    if (options.action === "rollback") {
      if (!canonical.exists) throw pathError("canonicalDir 不存在", { path: canonical.path });
      const plan = await planRollback(
        requested![0]!,
        options.backupPath!,
        lock,
        canonical.path,
        state.path,
      );
      return resultFromPlan(
        "rollback",
        true,
        canonical.path,
        safeChild(state.path, MANAGED_LOCK_FILENAME, "managed lock"),
        [plan],
      );
    }
    const sources = await sourcesForInstall(
      options.source!,
      options.ref,
      requested,
      options.overlayOf,
    );
    try {
      const plan =
        options.action === "install"
          ? await planInstall(sources.skills, lock, canonical.path)
          : await planAdopt(sources.skills, lock, canonical.path);
      return resultFromPlan(
        options.action,
        true,
        canonical.path,
        safeChild(state.path, MANAGED_LOCK_FILENAME, "managed lock"),
        plan,
      );
    } finally {
      await sources.cleanup();
    }
  }

  return withStateLock(options.stateDir, async (stateRoot) => {
    const canonicalRoot = await ensureRoot(options.canonicalDir, "canonicalDir");
    const lock = await readManagedLock(stateRoot);
    if (options.action === "update" || options.action === "migrate-source") {
      const update =
        options.action === "update"
          ? await planUpdate(requested, lock, canonicalRoot)
          : await planSourceMigration(options, lock, canonicalRoot, stateRoot);
      try {
        const planToken = updatePlanToken(
          update.plan,
          lock,
          canonicalRoot,
          stateRoot,
          options.action,
        );
        checkUpdatePlanToken(options.planToken, planToken);
        return {
          ...(await applyPlan(options.action, update.plan, lock, canonicalRoot, stateRoot, false)),
          planToken,
        };
      } finally {
        await update.cleanup();
      }
    }
    if (options.action === "rollback") {
      const plan = await planRollback(
        requested![0]!,
        options.backupPath!,
        lock,
        canonicalRoot,
        stateRoot,
      );
      return await applyPlan("rollback", [plan], lock, canonicalRoot, stateRoot, false);
    }
    const sources = await sourcesForInstall(
      options.source!,
      options.ref,
      requested,
      options.overlayOf,
    );
    try {
      const plan =
        options.action === "install"
          ? await planInstall(sources.skills, lock, canonicalRoot)
          : await planAdopt(sources.skills, lock, canonicalRoot);
      return await applyPlan(options.action, plan, lock, canonicalRoot, stateRoot, false);
    } finally {
      await sources.cleanup();
    }
  });
}
