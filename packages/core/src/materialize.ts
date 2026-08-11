/**
 * 将 skill 目录物化到 Canonical Store（~/.skill-hub/skills/<name>）。
 * 只写 hub 目录，不修改各 Agent skills。
 */

import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { SkillHubError, normalizeSkillName, resolveAbsolutePath } from "@skill-hub/shared";
import { sha256Content } from "./hash.js";
import { parseSkillMd } from "./parse.js";
import type { SkillMeta } from "./types.js";

export interface MaterializeOptions {
  /** 覆盖已存在且 hash 不同的目录（默认 false：跳过并记入 skipped） */
  force?: boolean;
}

export interface MaterializeResult {
  canonicalDir: string;
  copied: string[];
  skipped: Array<{ name: string; reason: string }>;
  failed: Array<{ name: string; error: string }>;
  skills: SkillMeta[];
}

async function readSkillHash(skillDir: string): Promise<string | null> {
  const skillMd = path.join(skillDir, "SKILL.md");
  try {
    const content = await readFile(skillMd, "utf8");
    return sha256Content(content);
  } catch {
    try {
      const content = await readFile(path.join(skillDir, "skill.md"), "utf8");
      return sha256Content(content);
    } catch {
      return null;
    }
  }
}

/**
 * 复制 selected skills 到 canonicalDir/<name>，并返回以 canonical 路径为准的 SkillMeta 列表。
 */
export async function materializeToCanonical(
  skills: SkillMeta[],
  canonicalDir: string,
  options: MaterializeOptions = {},
): Promise<MaterializeResult> {
  const destRoot = resolveAbsolutePath(canonicalDir);
  await mkdir(destRoot, { recursive: true });

  const copied: string[] = [];
  const skipped: MaterializeResult["skipped"] = [];
  const failed: MaterializeResult["failed"] = [];
  const out: SkillMeta[] = [];

  // 同名只保留一次（调用方应已 prefer 折叠）
  const byName = new Map<string, SkillMeta>();
  for (const s of skills) {
    const name = normalizeSkillName(s.name);
    if (!byName.has(name)) byName.set(name, { ...s, name });
  }

  for (const [name, meta] of byName) {
    const src = resolveAbsolutePath(meta.path);
    const dest = path.join(destRoot, name);

    if (path.resolve(src) === path.resolve(dest)) {
      try {
        const parsed = await parseSkillMd(path.join(dest, "SKILL.md"), {
          source: destRoot,
          fallbackName: name,
        });
        out.push(parsed);
        skipped.push({ name, reason: "源已在 canonical" });
      } catch (err) {
        failed.push({
          name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    try {
      await access(src);
    } catch (err) {
      failed.push({
        name,
        error: `源不存在: ${src}`,
      });
      void err;
      continue;
    }

    const srcHash = meta.hash || (await readSkillHash(src));
    let destExists = false;
    try {
      await access(dest);
      destExists = true;
    } catch {
      destExists = false;
    }

    if (destExists) {
      const destHash = await readSkillHash(dest);
      if (destHash && srcHash && destHash === srcHash) {
        try {
          const parsed = await parseSkillMd(path.join(dest, "SKILL.md"), {
            source: destRoot,
            fallbackName: name,
          });
          out.push(parsed);
          skipped.push({ name, reason: "canonical 已存在且 hash 相同" });
        } catch (err) {
          failed.push({
            name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        continue;
      }
      if (!options.force) {
        skipped.push({
          name,
          reason: `canonical 已存在且内容不同（用 --force 覆盖） destHash=${destHash ?? "?"} srcHash=${srcHash ?? "?"}`,
        });
        try {
          const parsed = await parseSkillMd(path.join(dest, "SKILL.md"), {
            source: destRoot,
            fallbackName: name,
          });
          out.push(parsed);
        } catch {
          // keep skipped only
        }
        continue;
      }
      await rm(dest, { recursive: true, force: true });
    }

    try {
      await mkdir(path.dirname(dest), { recursive: true });
      await cp(src, dest, {
        recursive: true,
        force: true,
        dereference: true,
        errorOnExist: false,
      });
      const parsed = await parseSkillMd(path.join(dest, "SKILL.md"), {
        source: destRoot,
        fallbackName: name,
      });
      out.push(parsed);
      copied.push(name);
    } catch (err) {
      failed.push({
        name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return { canonicalDir: destRoot, copied, skipped, failed, skills: out };
}

/** 校验 path 落在 canonical 下，防止路径穿越 */
export function assertSkillInsideCanonical(
  skillPath: string,
  canonicalDir: string,
): void {
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
