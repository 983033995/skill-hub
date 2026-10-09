import type { SkillMeta } from "@skill-hub/core";
import type { SkillScope } from "@skill-hub/shared";

export interface SyncScopeExclusion {
  name: string;
  scope: SkillScope;
  source: string;
  reason: string;
}

/**
 * 全局 Agent 投影的默认输入：旧 catalog 按 user 兼容，明确标注的
 * workspace/project Skill 只保留在 source/catalog/显式 scope route。
 */
export function filterGlobalSyncSkills(skills: SkillMeta[]): {
  skills: SkillMeta[];
  excluded: SyncScopeExclusion[];
} {
  const eligible: SkillMeta[] = [];
  const excluded: SyncScopeExclusion[] = [];
  for (const skill of skills) {
    const scope = skill.provenance?.scope ?? "user";
    if (scope === "user") {
      eligible.push(skill);
      continue;
    }
    excluded.push({
      name: skill.name,
      scope,
      source: skill.provenance?.sourceRef ?? skill.source ?? skill.path,
      reason: "project/workspace Skill 不默认同步到全局 Agent",
    });
  }
  return { skills: eligible, excluded };
}
