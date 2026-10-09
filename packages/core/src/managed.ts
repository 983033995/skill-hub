/**
 * 来源可追踪的 canonical Skill 安装与更新。
 *
 * 本模块只管理 canonical store 和 stateDir；绝不修改各 Agent 的 skills 目录。
 * 默认 dry-run，真实写入通过 staging + backup + 原子 rename 完成。
 */

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
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
import { hashSkillTree } from "./tree.js";
import type { SkillMeta } from "./types.js";

const execFileAsync = promisify(execFile);

export const MANAGED_LOCK_FILENAME = "managed-lock.json";

type ManagedSourceType = "local" | "github";

export type ManagedAction = "install" | "update" | "list" | "adopt";

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
  /** SKILL.md、附件、空目录和执行位的完整树 hash。 */
  treeHash: string;
}

export interface ManagedLockFile {
  version: 1;
  skills: Record<string, ManagedSourceLock>;
}

export interface ManageSkillsOptions {
  action: ManagedAction;
  /** install/adopt 必需；本地路径、GitHub HTTPS URL 或 owner/repo。 */
  source?: string;
  /** 为空时选择来源扫描到的全部 skill。 */
  names?: string[];
  /** 仅 GitHub 来源可用；update 不允许改写已锁定的 ref。 */
  ref?: string;
  canonicalDir: string;
  stateDir: string;
  /** 默认 true；dry-run 不写 hub、state 或 Agent 目录。 */
  dryRun?: boolean;
}

export interface ManageSkillItem {
  name: string;
  action: "install" | "update" | "adopt" | "noop" | "list";
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
}

export interface ManageSkillsResult {
  action: ManagedAction;
  dryRun: boolean;
  canonicalDir: string;
  lockPath: string;
  items: ManageSkillItem[];
  skills: SkillMeta[];
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
  operation: "install" | "update" | "adopt" | "noop";
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

async function sourcesForInstall(
  source: string,
  ref: string | undefined,
  requested: string[] | undefined,
): Promise<{ skills: SourceSkill[]; cleanup: () => Promise<void> }> {
  const parsed = parseSourceInput(source);
  if (parsed.type === "local") {
    if (ref !== undefined) throw configError("本地来源不能使用 Git ref");
    const sourceRoot = await rootForRead(parsed.path!, "source");
    if (!sourceRoot.exists) throw pathError("本地来源不存在", { path: sourceRoot.path });
    return {
      skills: await scanSourceRoot(
        sourceRoot.path,
        { type: "local", path: sourceRoot.path },
        requested,
      ),
      cleanup: async () => undefined,
    };
  }
  const checkout = await checkoutGithub(parsed.url!, ref);
  try {
    return {
      skills: await scanSourceRoot(
        checkout.root,
        {
          type: "github",
          url: checkout.url,
          ref: checkout.ref,
          commit: checkout.commit,
        },
        requested,
      ),
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
    treeHash: candidate.treeHash,
  };
}

async function readManagedLock(stateRoot: string): Promise<ManagedLockFile> {
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  let raw: string;
  try {
    const info = await lstat(lockPath);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw configError("managed lock 不能是 symlink 或目录", { path: lockPath });
    }
    raw = await readFile(lockPath, "utf8");
  } catch (error) {
    if (isErrno(error, "ENOENT")) return { version: 1, skills: {} };
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "managed lock 不是有效 JSON",
      details: { path: lockPath },
      cause: error,
    });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw configError("managed lock 必须是对象", { path: lockPath });
  }
  const root = parsed as { version?: unknown; skills?: unknown };
  if (
    root.version !== 1 ||
    !root.skills ||
    typeof root.skills !== "object" ||
    Array.isArray(root.skills)
  ) {
    throw configError("managed lock schema 无效", { path: lockPath });
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
    left.subpath === right.subpath
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
  const checkout = await checkoutGithub(lock.url!, lock.ref);
  try {
    const skillPath = pathFromSubpath(checkout.root, lock.subpath);
    assertInside(await realpath(checkout.root), await realpath(skillPath), "Git 来源 skill");
    const source = await parseSourceSkill(skillPath, {
      type: "github",
      url: checkout.url,
      ref: checkout.ref,
      commit: checkout.commit,
      subpath: lock.subpath,
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
      plan.push({
        source: resolved.source,
        destination: safeChild(canonicalRoot, name, "canonical skill"),
        existing,
        operation: existing.treeHash === resolved.source.lock.treeHash ? "noop" : "update",
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
): Promise<{ backupDir?: string; backupPaths: Map<string, string> }> {
  const updates = plan.filter((entry) => entry.operation === "update" && entry.existing);
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
  return { backupDir, backupPaths };
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
    backups = await backupExistingSkills(stateRoot, plan);
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
      action: entry.operation,
      status: dryRun ? "planned" : entry.operation === "noop" ? "unchanged" : "applied",
      source: sourceLabel(entry.source.lock),
      sourceTreeHash: entry.source.lock.treeHash,
      currentTreeHash: entry.existing?.treeHash,
      backupPath: backupPaths.get(entry.source.name),
    })),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function listManagedSkills(
  canonical: { path: string; exists: boolean },
  stateRoot: string,
  lock: ManagedLockFile,
  requested: string[] | undefined,
): Promise<ManageSkillsResult> {
  const lockPath = safeChild(stateRoot, MANAGED_LOCK_FILENAME, "managed lock");
  if (!canonical.exists) {
    if (requested?.length) {
      throw new SkillHubError({ code: "E_NOT_FOUND", message: "canonical 目录不存在" });
    }
    return {
      action: "list",
      dryRun: true,
      canonicalDir: canonical.path,
      lockPath,
      items: Object.keys(lock.skills)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({
          name,
          action: "list",
          status: "missing",
          source: sourceLabel(lock.skills[name]!),
        })),
      skills: [],
    };
  }
  const issues: Array<{ path: string; message: string }> = [];
  const scanned = await scanSkills(canonical.path, { onIssue: (issue) => issues.push(issue) });
  if (issues.length > 0) {
    throw pathError("canonical 扫描不完整", { path: canonical.path, issues });
  }
  const selected =
    !scanned.length && !requested?.length ? [] : selectNames(scanned, requested, canonical.path);
  const skills: SkillMeta[] = [];
  for (const meta of selected) {
    const actualPath = await realpath(meta.path);
    assertInside(canonical.path, actualPath, "canonical skill");
    const info = await lstat(meta.path);
    if (info.isSymbolicLink()) {
      throw pathError("canonical Skill 不能是 symlink", { name: meta.name, path: meta.path });
    }
    const managed = lock.skills[meta.name];
    skills.push(managed ? canonicalMeta(meta, actualPath, managed) : { ...meta, path: actualPath });
  }
  const present = new Set(skills.map((skill) => skill.name));
  const missing = Object.keys(lock.skills)
    .filter((name) => !present.has(name) && (!requested || requested.includes(name)))
    .sort((a, b) => a.localeCompare(b));
  const presentItems: ManageSkillItem[] = [];
  for (const skill of skills) {
    const source = lock.skills[skill.name];
    try {
      const currentTreeHash = await hashSkillTree(skill.path);
      presentItems.push({
        name: skill.name,
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
      presentItems.push({
        name: skill.name,
        action: "list",
        status: "blocked",
        message: asErrorMessage(error),
      });
    }
  }
  return {
    action: "list",
    dryRun: true,
    canonicalDir: canonical.path,
    lockPath,
    items: [
      ...presentItems,
      ...missing.map((name) => ({
        name,
        action: "list" as const,
        status: "missing" as const,
        source: sourceLabel(lock.skills[name]!),
      })),
    ].sort((a, b) => a.name.localeCompare(b.name)),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * 安装、更新、列出或显式 adopt canonical Skill。
 *
 * `install`/`adopt` 要求 source；`update` 只使用 state lock 中的来源，
 * 以避免调用方在同名 skill 上偷偷更换来源。
 */
export async function manageSkills(options: ManageSkillsOptions): Promise<ManageSkillsResult> {
  if (!["install", "update", "list", "adopt"].includes(options.action)) {
    throw configError("未知 managed action", { action: options.action });
  }
  const requested = normalizeRequestedNames(options.names);
  const dryRun = options.dryRun ?? true;
  const canonical = await rootForRead(options.canonicalDir, "canonicalDir");
  const state = await rootForRead(options.stateDir, "stateDir");

  if (options.action === "list") {
    const lock = await readManagedLock(state.path);
    return listManagedSkills(canonical, state.path, lock, requested);
  }
  if (options.action === "update" && (options.source !== undefined || options.ref !== undefined)) {
    throw configError("update 只能使用 managed lock 中的来源与 ref");
  }
  if ((options.action === "install" || options.action === "adopt") && !options.source) {
    throw configError(`${options.action} 需要 source`);
  }

  if (dryRun) {
    const lock = await readManagedLock(state.path);
    if (options.action === "update") {
      if (!canonical.exists) throw pathError("canonicalDir 不存在", { path: canonical.path });
      const update = await planUpdate(requested, lock, canonical.path);
      try {
        return resultFromPlan(
          "update",
          true,
          canonical.path,
          safeChild(state.path, MANAGED_LOCK_FILENAME, "managed lock"),
          update.plan,
        );
      } finally {
        await update.cleanup();
      }
    }
    const sources = await sourcesForInstall(options.source!, options.ref, requested);
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
    if (options.action === "update") {
      const update = await planUpdate(requested, lock, canonicalRoot);
      try {
        return await applyPlan("update", update.plan, lock, canonicalRoot, stateRoot, false);
      } finally {
        await update.cleanup();
      }
    }
    const sources = await sourcesForInstall(options.source!, options.ref, requested);
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
