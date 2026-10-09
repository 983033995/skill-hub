/** 物化 Skill 全目录；冲突默认保留原件，替换前归档且失败恢复。 */
import { cp, lstat, mkdir, mkdtemp, rename, rm, realpath } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SkillHubError, normalizeSkillName, resolveAbsolutePath } from "@skill-hub/shared";
import { hashSkillTree } from "./tree.js";
import { parseSkillMd } from "./parse.js";
import type { SkillMeta } from "./types.js";

export interface MaterializeOptions {
  force?: boolean;
  dryRun?: boolean;
  backupDir?: string;
}
export interface MaterializeResult {
  canonicalDir: string;
  copied: string[];
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; error: string }>;
  backups: Array<{ name: string; path: string }>;
  skills: SkillMeta[];
}

export async function materializeToCanonical(
  skills: SkillMeta[],
  canonicalDir: string,
  options: MaterializeOptions = {},
): Promise<MaterializeResult> {
  const destRoot = resolveAbsolutePath(canonicalDir);
  const result: MaterializeResult = {
    canonicalDir: destRoot,
    copied: [],
    skipped: [],
    failed: [],
    backups: [],
    skills: [],
  };
  const seen = new Set<string>();
  for (const meta of skills) {
    const name = normalizeSkillName(meta.name);
    if (seen.has(name))
      throw new SkillHubError({ code: "E_CONFLICT", message: `重复物化名称: ${name}` });
    seen.add(name);
    const src = resolveAbsolutePath(meta.path);
    const dest = path.join(destRoot, name);
    let stage: string | undefined;
    let backup: string | undefined;
    try {
      assertSkillInsideCanonical(dest, destRoot);
      const sourceReal = await realpath(src);
      const existing = await lstat(dest).catch((err: NodeJS.ErrnoException) => {
        if (err.code === "ENOENT") return null;
        throw err;
      });
      if (existing?.isSymbolicLink())
        throw new Error(`canonical 目标是 symlink，拒绝穿透写入: ${dest}`);
      if (existing && (await realpath(dest)) === sourceReal) {
        result.skills.push({ ...meta, path: dest });
        result.skipped.push({ name, reason: "源已在 canonical" });
        continue;
      }
      const srcHash = await hashSkillTree(src);
      if (existing) {
        const same = existing.isDirectory() && (await hashSkillTree(dest)) === srcHash;
        if (same || !options.force) {
          if (same) result.skills.push({ ...meta, path: dest });
          result.skipped.push({
            name,
            reason: same
              ? "canonical 全目录内容相同"
              : "canonical 内容冲突：保留原件，需明确选择版本",
          });
          continue;
        }
      }
      if (options.dryRun) {
        result.copied.push(name);
        result.skills.push({ ...meta, path: dest });
        continue;
      }
      await mkdir(destRoot, { recursive: true });
      const canonicalReal = await realpath(destRoot);
      const rel = path.relative(sourceReal, canonicalReal);
      if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
        throw new Error("canonical 不得位于导入源内部");
      }
      stage = await mkdtemp(path.join(destRoot, ".ingest-"));
      const staged = path.join(stage, "skill");
      await cp(src, staged, {
        recursive: true,
        dereference: true,
        errorOnExist: true,
        force: false,
        filter: (entry) => path.basename(entry) !== ".git",
      });
      if ((await hashSkillTree(staged)) !== srcHash)
        throw new Error("复制期间源发生变化，请重新预览");
      let parsed;
      try {
        parsed = await parseSkillMd(path.join(staged, "SKILL.md"), {
          provenance: meta.provenance,
          source: meta.source,
        });
      } catch (err) {
        if (
          !(err instanceof SkillHubError) ||
          (err.cause as NodeJS.ErrnoException)?.code !== "ENOENT"
        )
          throw err;
        parsed = await parseSkillMd(path.join(staged, "skill.md"), {
          provenance: meta.provenance,
          source: meta.source,
        });
      }
      if (existing) {
        const backupRoot = options.backupDir ?? path.join(path.dirname(destRoot), "backups");
        backup = path.join(backupRoot, `ingest-${randomUUID()}`, name);
        await mkdir(path.dirname(backup), { recursive: true });
        await rename(dest, backup);
      } else {
        // 目标可能在复制期间出现；绝不覆盖。
        const appeared = await lstat(dest).catch((err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") return null;
          throw err;
        });
        if (appeared) throw new Error("目标在预览后出现，请重新执行");
      }
      try {
        await rename(staged, dest);
      } catch (err) {
        if (backup) await rename(backup, dest);
        backup = undefined;
        throw err;
      }
      result.skills.push({ ...parsed, path: dest });
      result.copied.push(name);
      if (backup) result.backups.push({ name, path: backup });
    } catch (err) {
      result.failed.push({ name, error: err instanceof Error ? err.message : String(err) });
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  }
  result.skills.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

/** 校验 path 落在 canonical 下，防止路径穿越 */
export function assertSkillInsideCanonical(skillPath: string, canonicalDir: string): void {
  const absSkill = resolveAbsolutePath(skillPath);
  const absCanon = resolveAbsolutePath(canonicalDir);
  const rel = path.relative(absCanon, absSkill);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SkillHubError({
      code: "E_PATH",
      message: `skill 路径不在 canonical 内: ${absSkill}`,
      details: { skillPath: absSkill, canonicalDir: absCanon },
    });
  }
}
