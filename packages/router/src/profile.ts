/**
 * Profile 过滤：按 name glob / keywords 收窄路由候选池。
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SkillMeta } from "@skill-hub/core";
import { SkillHubError, expandUserPath, resolveAbsolutePath } from "@skill-hub/shared";

export interface ProfileDef {
  name: string;
  description?: string;
  include_name_globs: string[];
  keywords: string[];
}

/** 简易 glob：`*` 匹配任意（skill name 无路径分隔符） */
export function matchNameGlob(name: string, pattern: string): boolean {
  const n = name.toLowerCase();
  const p = pattern.toLowerCase();
  const reBody = p
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${reBody}$`).test(n);
}

export function skillMatchesProfile(skill: SkillMeta, profile: ProfileDef): boolean {
  const globs = profile.include_name_globs ?? [];
  if (globs.length > 0) {
    for (const g of globs) {
      if (matchNameGlob(skill.name, g)) return true;
    }
  }

  const kws = (profile.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  if (kws.length === 0) {
    return globs.length === 0;
  }

  const hay =
    `${skill.name} ${skill.description} ${(skill.keywords ?? []).join(" ")}`.toLowerCase();
  return kws.some((k) => hay.includes(k));
}

/**
 * 过滤候选。
 * - 优先 include_name_globs，否则 keywords
 * - 无命中且 fallbackAll=true（默认）→ 回退全量
 */
export function filterByProfile(
  skills: SkillMeta[],
  profile: ProfileDef,
  options: { fallbackAll?: boolean } = {},
): { skills: SkillMeta[]; matched: number; fallback: boolean } {
  const fallbackAll = options.fallbackAll !== false;
  const filtered = skills.filter((s) => skillMatchesProfile(s, profile));
  if (filtered.length > 0) {
    return { skills: filtered, matched: filtered.length, fallback: false };
  }
  if (fallbackAll) {
    return { skills, matched: 0, fallback: true };
  }
  return { skills: [], matched: 0, fallback: false };
}

/** 解析与 configs/profiles/*.yaml 同结构的极简 YAML。 */
export function parseProfileYaml(raw: string): ProfileDef {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  let name = "";
  let description: string | undefined;
  let section: "include_name_globs" | "keywords" | null = null;
  const include_name_globs: string[] = [];
  const keywords: string[] = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (section && listItem) {
      const v = listItem[1]!.trim().replace(/^["']|["']$/g, "");
      if (section === "include_name_globs") include_name_globs.push(v);
      else keywords.push(v);
      continue;
    }

    const kv = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (kv && !line.startsWith(" ") && !line.startsWith("\t")) {
      const key = kv[1]!;
      const val = kv[2]!.trim().replace(/^["']|["']$/g, "");
      section = null;
      if (key === "name") name = val;
      else if (key === "description") description = val || undefined;
      else if (key === "include_name_globs") section = "include_name_globs";
      else if (key === "keywords") section = "keywords";
    }
  }

  if (!name) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "profile 缺少 name 字段",
    });
  }

  return { name, description, include_name_globs, keywords };
}

function defaultProfileSearchDirs(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    process.env.SKILL_HUB_PROFILES_DIR
      ? expandUserPath(process.env.SKILL_HUB_PROFILES_DIR)
      : "",
    path.join(process.cwd(), "configs", "profiles"),
    path.resolve(here, "../../../configs/profiles"), // packages/router/src → repo
    path.resolve(here, "../../../../configs/profiles"), // packages/router/dist → repo
  ].filter(Boolean);
}

export async function loadProfile(
  profileName: string,
  profilesDir?: string,
): Promise<ProfileDef> {
  const fileName = `${profileName}.yaml`;
  const dirs = profilesDir
    ? [resolveAbsolutePath(profilesDir)]
    : defaultProfileSearchDirs();

  let lastErr: unknown;
  for (const dir of dirs) {
    const file = path.join(dir, fileName);
    try {
      const raw = await readFile(file, "utf8");
      return parseProfileYaml(raw);
    } catch (err) {
      lastErr = err;
    }
  }

  throw new SkillHubError({
    code: "E_CONFIG",
    message: `未找到 profile: ${profileName}（搜索 configs/profiles/${fileName}）`,
    details: { profileName, candidates: dirs },
    cause: lastErr,
  });
}
