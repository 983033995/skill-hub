import type { Conflict, ConflictVariant, SkillMeta } from "./types.js";
import type { SkillScope } from "@skill-hub/shared";

const SCOPE_RANK: Record<SkillScope, number> = {
  user: 1,
  workspace: 2,
  project: 3,
};

/** 旧 catalog 未标 scope 时按 user 处理。 */
export function effectiveSkillScope(skill: SkillMeta): SkillScope {
  return skill.provenance?.scope ?? "user";
}

/**
 * 为同名冲突选择一个可解释、可复现的代表项。
 * 更具体的 scope 优先；同 scope 再按 sourceRef/path 与 hash 排序，避免依赖扫描顺序。
 */
export function selectPreferredSkill(skills: SkillMeta[]): SkillMeta | undefined {
  return [...skills].sort((a, b) => {
    const scopeDelta = SCOPE_RANK[effectiveSkillScope(b)] - SCOPE_RANK[effectiveSkillScope(a)];
    if (scopeDelta !== 0) return scopeDelta;

    const aStatus =
      a.provenance?.status === "active" ? 2 : a.provenance?.status === "draft" ? 1 : 0;
    const bStatus =
      b.provenance?.status === "active" ? 2 : b.provenance?.status === "draft" ? 1 : 0;
    if (bStatus !== aStatus) return bStatus - aStatus;

    const aRef = a.provenance?.sourceRef ?? a.source ?? a.path;
    const bRef = b.provenance?.sourceRef ?? b.source ?? b.path;
    return aRef.localeCompare(bRef) || a.hash.localeCompare(b.hash);
  })[0];
}

function toVariant(skill: SkillMeta): ConflictVariant {
  return {
    path: skill.path,
    hash: skill.hash,
    agentId: skill.agentsPresent?.[0],
    source: skill.source,
    provenance: skill.provenance ? { ...skill.provenance } : { scope: "user" },
  };
}

/**
 * 同名不同 hash → 冲突；同名同 hash → 合并 agentsPresent（不报冲突）。
 */
export function detectConflicts(skills: SkillMeta[]): Conflict[] {
  const byName = new Map<string, SkillMeta[]>();
  for (const s of skills) {
    const list = byName.get(s.name) ?? [];
    list.push(s);
    byName.set(s.name, list);
  }

  const conflicts: Conflict[] = [];
  for (const [name, list] of byName) {
    const uniqueHashes = new Set(list.map((s) => s.hash));
    if (uniqueHashes.size <= 1) continue;

    const variantsMap = new Map<string, Conflict["variants"][number]>();
    for (const s of list) {
      const key = `${s.hash}::${s.path}`;
      if (variantsMap.has(key)) continue;
      variantsMap.set(key, toVariant(s));
    }
    const winner = selectPreferredSkill(list);
    const winnerScope = winner ? effectiveSkillScope(winner) : "user";
    conflicts.push({
      name,
      variants: [...variantsMap.values()],
      winner: winner ? toVariant(winner) : undefined,
      winnerReason: winner
        ? `scope 优先级为 project > workspace > user；当前代表项为 ${winnerScope}，同 scope 时按 sourceRef/path 与 hash 确定性排序`
        : undefined,
    });
  }

  conflicts.sort((a, b) => a.name.localeCompare(b.name));
  return conflicts;
}

/**
 * 将多端扫描结果按 name 合并：同 hash 合并 agentsPresent；不同 hash 仍全部保留在数组中。
 */
export function mergeSkillMetas(skills: SkillMeta[]): SkillMeta[] {
  const byNameHash = new Map<string, SkillMeta>();

  for (const s of skills) {
    const key = `${s.name}::${s.hash}`;
    const existing = byNameHash.get(key);
    if (!existing) {
      byNameHash.set(key, {
        ...s,
        agentsPresent: s.agentsPresent ? [...s.agentsPresent] : undefined,
      });
      continue;
    }
    const agents = new Set([...(existing.agentsPresent ?? []), ...(s.agentsPresent ?? [])]);
    existing.agentsPresent = agents.size > 0 ? [...agents].sort() : undefined;
    if (s.mtimeMs > existing.mtimeMs) {
      existing.mtimeMs = s.mtimeMs;
    }
  }

  return [...byNameHash.values()].sort((a, b) => a.name.localeCompare(b.name));
}
