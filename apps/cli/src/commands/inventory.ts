import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  defaultHubConfig,
  detectConflicts,
  loadHubConfig,
  mergeSkillMetas,
  resolveHubConfigPaths,
  scanSkills,
  type SkillMeta,
} from "@skill-hub/core";
import { expandUserPath } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runInventory(options: {
  json: boolean;
  configPath?: string;
  agentFilter?: string[];
  outPath?: string;
}): Promise<number> {
  const config = resolveHubConfigPaths(
    options.configPath
      ? await loadHubConfig(options.configPath)
      : await loadHubConfig().catch(() => defaultHubConfig()),
  );

  let agents = config.agents.filter((a) => a.enabled);
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
  }[] = [];
  const all: SkillMeta[] = [];

  for (const a of agents) {
    const p = expandUserPath(a.skills_dir);
    try {
      const skills = await scanSkills(p, { agentId: a.id, source: p, maxDepth: 4 });
      all.push(...skills);
      agentReports.push({
        id: a.id,
        path: p,
        exists: true,
        count: skills.length,
        skills: skills.map((s) => s.name),
      });
    } catch {
      agentReports.push({
        id: a.id,
        path: p,
        exists: false,
        count: 0,
        skills: [],
      });
    }
  }

  const merged = mergeSkillMetas(all);
  const conflicts = detectConflicts(all);
  const unionNames = new Set(merged.map((s) => s.name));

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
    })),
    union_count: unionNames.size,
    total_scanned_entries: all.length,
    overlaps,
    only,
    conflicts: conflicts.map((c) => ({
      name: c.name,
      variants: c.variants,
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
        `- conflicts: ${result.conflicts.length}`,
        ``,
        `## Agents`,
        ...result.agents.map(
          (a) => `- **${a.id}**: ${a.count} @ \`${a.path}\` (${a.exists ? "ok" : "missing"})`,
        ),
        ``,
        `## Conflicts`,
        result.conflicts.length === 0
          ? `- (none)`
          : result.conflicts.map((c) => `- ${c.name} (${c.variants.length} variants)`).join("\n"),
        ``,
      ].join("\n");
      await writeFile(abs, md, "utf8");
    }
  }

  if (options.json) {
    printJson(result);
  } else {
    printLines([
      `inventory  union=${result.union_count}  entries=${result.total_scanned_entries}  conflicts=${result.conflicts.length}`,
      ...result.agents.map(
        (a) => `  ${a.id.padEnd(12)} ${String(a.count).padStart(4)}  ${a.path}`,
      ),
      options.outPath ? `written: ${options.outPath}` : "",
    ].filter(Boolean));
  }

  return 0;
}
