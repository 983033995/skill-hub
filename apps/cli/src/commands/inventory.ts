import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  detectConflicts,
  effectiveSkillScope,
  loadHubConfig,
  mergeSkillMetas,
  resolveHubConfigPaths,
  scanSkills,
  selectPreferredSkill,
  sourceMappingToProvenance,
  type SkillMeta,
} from "@skill-hub/core";
import { expandUserPath, type SkillScope, type SkillSourceMapping } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runInventory(options: {
  json: boolean;
  configPath?: string;
  agentFilter?: string[];
  sourceFilter?: string[];
  scopeFilter?: SkillScope[];
  outPath?: string;
}): Promise<number> {
  const config = resolveHubConfigPaths(
    options.configPath ? await loadHubConfig(options.configPath) : await loadHubConfig(),
  );

  const scopeFilter = options.scopeFilter?.length ? new Set(options.scopeFilter) : null;
  let agents = config.agents.filter((a) => a.enabled && (!scopeFilter || scopeFilter.has("user")));
  if (options.agentFilter?.length) {
    const set = new Set(options.agentFilter);
    agents = agents.filter((a) => set.has(a.id));
  }

  const agentReports: {
    id: string;
    path: string;
    exists: boolean;
    count: number;
    skills: string[];
    scope: SkillScope;
  }[] = [];
  const sourceReports: Array<{
    id: string;
    path: string;
    scope: SkillScope;
    source_type: SkillSourceMapping["source_type"];
    source_ref: string;
    revision?: string;
    status?: SkillSourceMapping["status"];
    overlay_of?: string;
    exists: boolean;
    count: number;
    skills: string[];
  }> = [];
  const all: SkillMeta[] = [];
  const sourcePresence = new Map<string, Set<string>>();

  for (const a of agents) {
    const p = expandUserPath(a.skills_dir);
    try {
      const skills = await scanSkills(p, {
        agentId: a.id,
        source: p,
        provenance: { scope: "user", sourceType: "local", sourceRef: p },
        maxDepth: 4,
      });
      all.push(...skills);
      agentReports.push({
        id: a.id,
        path: p,
        exists: true,
        count: skills.length,
        skills: skills.map((s) => s.name),
        scope: "user",
      });
    } catch {
      agentReports.push({
        id: a.id,
        path: p,
        exists: false,
        count: 0,
        skills: [],
        scope: "user",
      });
    }
  }

  let sources = (config.sources ?? []).filter((s) => s.enabled);
  if (options.sourceFilter?.length) {
    const wanted = new Set(options.sourceFilter);
    sources = sources.filter((s) => wanted.has(s.id));
  }
  if (scopeFilter) sources = sources.filter((s) => scopeFilter.has(s.scope));

  for (const source of sources) {
    const p = expandUserPath(source.path);
    const provenance = sourceMappingToProvenance(source, p);
    try {
      const skills = await scanSkills(p, {
        source: p,
        provenance,
        maxDepth: 5,
      });
      all.push(...skills);
      for (const skill of skills) {
        const set = sourcePresence.get(skill.name) ?? new Set<string>();
        set.add(source.id);
        sourcePresence.set(skill.name, set);
      }
      sourceReports.push({
        id: source.id,
        path: p,
        scope: source.scope,
        source_type: source.source_type ?? "local",
        source_ref: source.source_ref ?? p,
        revision: source.revision,
        status: source.status ?? "active",
        overlay_of: source.overlay_of,
        exists: true,
        count: skills.length,
        skills: skills.map((s) => s.name),
      });
    } catch {
      sourceReports.push({
        id: source.id,
        path: p,
        scope: source.scope,
        source_type: source.source_type ?? "local",
        source_ref: source.source_ref ?? p,
        revision: source.revision,
        status: source.status ?? "active",
        overlay_of: source.overlay_of,
        exists: false,
        count: 0,
        skills: [],
      });
    }
  }

  const merged = mergeSkillMetas(all);
  const conflicts = detectConflicts(all);
  const unionNames = new Set(merged.map((s) => s.name));
  const effective = new Map<string, SkillMeta>();
  const byName = new Map<string, SkillMeta[]>();
  for (const skill of all) {
    const list = byName.get(skill.name) ?? [];
    list.push(skill);
    byName.set(skill.name, list);
  }
  for (const [name, list] of byName) {
    const preferred = selectPreferredSkill(list);
    if (preferred) effective.set(name, preferred);
  }

  // 仅单端
  const presence = new Map<string, Set<string>>();
  for (const s of all) {
    const set = presence.get(s.name) ?? new Set<string>();
    for (const id of s.agentsPresent ?? []) set.add(id);
    // 若 scan 未标 agent，尝试从报告反推
    presence.set(s.name, set);
  }
  for (const rep of agentReports) {
    for (const name of rep.skills) {
      const set = presence.get(name) ?? new Set<string>();
      set.add(rep.id);
      presence.set(name, set);
    }
  }

  const only: Record<string, string[]> = {};
  for (const [name, agentsSet] of presence) {
    if (agentsSet.size === 1) {
      const id = [...agentsSet][0]!;
      only[id] = only[id] ?? [];
      only[id].push(name);
    }
  }
  for (const k of Object.keys(only)) {
    only[k]!.sort();
  }

  const onlySources: Record<string, string[]> = {};
  for (const [name, sourceIds] of sourcePresence) {
    if (sourceIds.size === 1) {
      const id = [...sourceIds][0]!;
      onlySources[id] = onlySources[id] ?? [];
      onlySources[id]!.push(name);
    }
  }
  for (const k of Object.keys(onlySources)) onlySources[k]!.sort();

  const scopeCounts: Record<SkillScope, number> = {
    user: 0,
    workspace: 0,
    project: 0,
  };
  for (const skill of effective.values()) {
    scopeCounts[effectiveSkillScope(skill)] += 1;
  }

  // 两两交集规模
  const overlaps: { a: string; b: string; count: number }[] = [];
  for (let i = 0; i < agentReports.length; i += 1) {
    for (let j = i + 1; j < agentReports.length; j += 1) {
      const A = new Set(agentReports[i]!.skills);
      const B = agentReports[j]!.skills;
      let c = 0;
      for (const n of B) if (A.has(n)) c += 1;
      overlaps.push({
        a: agentReports[i]!.id,
        b: agentReports[j]!.id,
        count: c,
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    agents: agentReports.map(({ id, path: p, exists, count }) => ({
      id,
      path: p,
      exists,
      count,
      scope: "user" as const,
    })),
    sources: sourceReports,
    scope_filter: options.scopeFilter ?? null,
    scope_counts: scopeCounts,
    union_count: unionNames.size,
    total_scanned_entries: all.length,
    overlaps,
    only,
    only_sources: onlySources,
    effective_skills: [...effective.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        name: s.name,
        path: s.path,
        hash: s.hash,
        scope: effectiveSkillScope(s),
        source: s.source ?? null,
        provenance: s.provenance ?? null,
      })),
    conflicts: conflicts.map((c) => ({
      name: c.name,
      variants: c.variants,
      winner: c.winner ?? null,
      winner_reason: c.winnerReason ?? null,
    })),
  };

  if (options.outPath) {
    const abs = path.resolve(options.outPath);
    await mkdir(path.dirname(abs), { recursive: true });
    if (abs.endsWith(".json")) {
      await writeFile(abs, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else {
      const md = [
        `# skill-hub inventory`,
        ``,
        `- generatedAt: ${result.generatedAt}`,
        `- union_count: ${result.union_count}`,
        `- sources: ${result.sources.length}`,
        `- conflicts: ${result.conflicts.length}`,
        ``,
        `## Agents`,
        ...result.agents.map(
          (a) =>
            `- **${a.id}** [user]: ${a.count} @ \`${a.path}\` (${a.exists ? "ok" : "missing"})`,
        ),
        ``,
        `## Skill Sources`,
        result.sources.length === 0
          ? `- (none configured)`
          : result.sources
              .map(
                (s) =>
                  `- **${s.id}** [${s.scope}]: ${s.count} @ \`${s.path}\` (${s.exists ? "ok" : "missing"})`,
              )
              .join("\n"),
        ``,
        `## Conflicts`,
        result.conflicts.length === 0
          ? `- (none)`
          : result.conflicts
              .map(
                (c) =>
                  `- ${c.name} (${c.variants.length} variants; winner=${c.winner?.path ?? "?"})\n  ${c.winner_reason ?? ""}`,
              )
              .join("\n"),
        ``,
      ].join("\n");
      await writeFile(abs, md, "utf8");
    }
  }

  if (options.json) {
    printJson(result);
  } else {
    printLines(
      [
        `inventory  union=${result.union_count}  entries=${result.total_scanned_entries}  conflicts=${result.conflicts.length}`,
        ...result.agents.map(
          (a) => `  ${a.id.padEnd(12)} ${String(a.count).padStart(4)}  ${a.path}`,
        ),
        ...result.sources.map(
          (s) =>
            `  source:${s.id.padEnd(8)} ${s.scope.padEnd(9)} ${String(s.count).padStart(4)}  ${s.path}`,
        ),
        options.outPath ? `written: ${options.outPath}` : "",
      ].filter(Boolean),
    );
  }

  return 0;
}
