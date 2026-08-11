import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  SkillHubError,
  createLogger,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { parseSkillMd } from "./parse.js";
import type { ScanOptions, SkillMeta } from "./types.js";

const log = createLogger({ name: "core.scan" });

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "coverage",
  ".pnpm-store",
]);

/**
 * 扫描 root 下含 SKILL.md 的 skill 目录。
 * 约定：每个 skill 为一层目录，内含 `SKILL.md`。
 */
export async function scanSkills(
  root: string,
  options: ScanOptions = {},
): Promise<SkillMeta[]> {
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

  await walk(absRoot, 0, maxDepth, skillFiles);

  for (const file of skillFiles) {
    try {
      const meta = await parseSkillMd(file, {
        source: options.source ?? absRoot,
        agentId: options.agentId,
        fallbackName: path.basename(path.dirname(file)),
      });
      found.push(meta);
    } catch (err) {
      // 单 skill 解析失败不中断整次扫描，记录后跳过
      const msg = err instanceof Error ? err.message : String(err);
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
): Promise<void> {
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
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
    if (!ent.isDirectory()) continue;
    if (SKIP_DIR_NAMES.has(ent.name)) continue;
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    await walk(path.join(dir, ent.name), depth + 1, maxDepth, out);
  }
}
