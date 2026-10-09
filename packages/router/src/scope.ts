import type { SkillMeta } from "@skill-hub/core";
import { type SkillScope } from "@skill-hub/shared";

export type ScopeFilter = SkillScope | SkillScope[];

/** 旧 catalog 未标 scope 时按 user 兼容处理。 */
export function effectiveScope(skill: SkillMeta): SkillScope {
  return skill.provenance?.scope ?? "user";
}

/** 显式 scope 过滤不回退到全量，避免 project 查询意外读到 user Skill。 */
export function filterByScope(
  skills: SkillMeta[],
  scope?: ScopeFilter,
): { skills: SkillMeta[]; matched: number } {
  if (!scope) return { skills, matched: skills.length };
  const wanted = new Set(Array.isArray(scope) ? scope : [scope]);
  const filtered = skills.filter((skill) => wanted.has(effectiveScope(skill)));
  return { skills: filtered, matched: filtered.length };
}
