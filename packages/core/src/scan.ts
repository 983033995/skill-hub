import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { SkillHubError, createLogger, resolveAbsolutePath } from "@skill-hub/shared";
import { parseSkillMd } from "./parse.js";
import type { ScanOptions, SkillMeta } from "./types.js";

const log = createLogger({ name: "core.scan" });

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", "coverage", ".pnpm-store"]);

/**
 * 扫描 root 下含 SKILL.md 的 skill 目录。
 * 约定：每个 skill 为一层目录，内含 `SKILL.md`。
 */
export async function scanSkills(root: string, options: ScanOptions = {}): Promise<SkillMeta[]> {
  const absRoot = resolveAbsolutePath(root);
  let rootStat;
  try {
    rootStat = await stat(absRoot);
  } catch (err) {
    throw new SkillHubError({
      code: "E_PATH",
      message: `扫描根目录不存在: ${absRoot}`,
      details: { path: absRoot },
      cause: err,
    });
  }
  if (!rootStat.isDirectory()) {
    throw new SkillHubError({
      code: "E_PATH",
      message: `扫描根不是目录: ${absRoot}`,
      details: { path: absRoot },
    });
  }

  const maxDepth = options.maxDepth ?? 4;
  const found: SkillMeta[] = [];
  const skillFiles: string[] = [];

  await walk(absRoot, 0, maxDepth, skillFiles, new Set<string>(), options.onIssue);

  for (const file of skillFiles) {
    try {
      const meta = await parseSkillMd(file, {
        source: options.source ?? absRoot,
        agentId: options.agentId,
        provenance: options.provenance,
        fallbackName: path.basename(path.dirname(file)),
      });
      found.push(meta);
    } catch (err) {
      // 单 skill 解析失败不中断整次扫描，记录后跳过
      const msg = err instanceof Error ? err.message : String(err);
      options.onIssue?.({ path: file, message: msg });
      log.warn("跳过无法解析的 skill", { file, error: msg });
    }
  }

  found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}

async function walk(
  dir: string,
  depth: number,
  maxDepth: number,
  out: string[],
  visited: Set<string>,
  onIssue?: ScanOptions["onIssue"],
): Promise<void> {
  if (depth > maxDepth) { onIssue?.({ path: dir, message: "超过扫描深度上限" }); return; }

  // Agent 目录常用 symlink 指向 canonical store；按 realpath 去重，
  // 避免自引用/环路让扫描递归不止。
  try {
    const realDir = await realpath(dir);
    if (visited.has(realDir)) return;
    visited.add(realDir);
  } catch (err) {
    onIssue?.({ path: dir, message: String(err) });
    return;
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    onIssue?.({ path: dir, message: String(err) });
    return;
  }

  // 当前目录是否就是 skill 根
  const skillMd = entries.find(
    (e) => e.isFile() && (e.name === "SKILL.md" || e.name === "skill.md"),
  );
  if (skillMd) {
    out.push(path.join(dir, skillMd.name));
    // 不进入 skill 内部再找嵌套 SKILL.md（避免 scripts 里误命中）
    return;
  }

  for (const ent of entries) {
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    const child = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(child, depth + 1, maxDepth, out, visited, onIssue);
      continue;
    }
    if (!ent.isSymbolicLink()) continue;

    // Dirent 对 symlink 不报告 isDirectory()；显式 stat 跟随目标，
    // 仅把“指向目录”的 symlink 当作可扫描目录，坏链和文件 symlink 跳过。
    try {
      if ((await stat(child)).isDirectory()) {
        await walk(child, depth + 1, maxDepth, out, visited, onIssue);
      }
    } catch (err) {
      onIssue?.({ path: child, message: String(err) });
      // 坏链/无权限项不应阻断同级其它 Skill 的盘点。
    }
  }
}
