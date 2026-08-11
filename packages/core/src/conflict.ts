import type { Conflict, SkillMeta } from "./types.js";

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
      variantsMap.set(key, {
        path: s.path,
        hash: s.hash,
        agentId: s.agentsPresent?.[0],
      });
    }
    conflicts.push({
      name,
      variants: [...variantsMap.values()],
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
    const agents = new Set([
      ...(existing.agentsPresent ?? []),
      ...(s.agentsPresent ?? []),
    ]);
    existing.agentsPresent = agents.size > 0 ? [...agents].sort() : undefined;
    if (s.mtimeMs > existing.mtimeMs) {
      existing.mtimeMs = s.mtimeMs;
    }
  }

  return [...byNameHash.values()].sort((a, b) => a.name.localeCompare(b.name));
}
