import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { scanSkills } from "./scan.js";
import { hashSkillTree } from "./tree.js";

export interface TakeoverRoot {
  id: string;
  path: string;
  ownership: "canonical" | "agent" | "source" | "external";
}

/** 只读接管报告：保留每份来源，不以名称排序结果替用户解决冲突。 */
export async function inspectTakeover(roots: TakeoverRoot[], canonicalDir: string) {
  const issues: Array<{ path: string; message: string }> = [];
  const entries: Array<{
    name: string;
    path: string;
    rootId: string;
    ownership: TakeoverRoot["ownership"];
    treeHash: string | null;
    linkedToHub: boolean;
    managedLocation: boolean;
  }> = [];
  const rootReports: Array<TakeoverRoot & { exists: boolean; count: number }> = [];
  const realCanonical = await realpath(canonicalDir).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return path.resolve(canonicalDir);
    throw err;
  });
  for (const root of roots) {
    const exists = await lstat(root.path).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      issues.push({ path: root.path, message: String(err) });
      return null;
    });
    if (!exists) {
      rootReports.push({ ...root, exists: false, count: 0 });
      continue;
    }
    try {
      const skills = await scanSkills(root.path, {
        maxDepth: 10,
        onIssue: (issue) => issues.push(issue),
      });
      rootReports.push({ ...root, exists: true, count: skills.length });
      for (const skill of skills) {
        let treeHash: string | null = null;
        try {
          treeHash = await hashSkillTree(skill.path);
        } catch (err) {
          issues.push({ path: skill.path, message: String(err) });
        }
        const real = await realpath(skill.path);
        const rel = path.relative(realCanonical, real);
        const managedLocation =
          !!rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
        entries.push({
          name: skill.name,
          path: skill.path,
          rootId: root.id,
          ownership: root.ownership,
          treeHash,
          linkedToHub: root.ownership === "agent" && managedLocation,
          managedLocation,
        });
      }
    } catch (err) {
      issues.push({ path: root.path, message: String(err) });
    }
  }
  const groups = new Map<string, typeof entries>();
  for (const entry of entries.filter((e) => e.ownership !== "external")) {
    groups.set(entry.name, [...(groups.get(entry.name) ?? []), entry]);
  }
  const skills = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, variants]) => {
      const canonical = variants.find((v) => v.ownership === "canonical");
      const hashes = new Set(variants.map((v) => v.treeHash));
      const action = hashes.has(null)
        ? "blocked"
        : hashes.size > 1
          ? "conflict"
          : canonical
            ? "ready"
            : "import";
      return { name, action, canonical: canonical?.path ?? null, variants };
    });
  return {
    dryRun: true as const,
    generatedAt: new Date().toISOString(),
    roots: rootReports,
    summary: {
      uniqueSkills: skills.length,
      entries: entries.length,
      linkedToHub: entries.filter((e) => e.linkedToHub).length,
      ready: skills.filter((s) => s.action === "ready").length,
      import: skills.filter((s) => s.action === "import").length,
      conflicts: skills.filter((s) => s.action === "conflict").length,
      blocked: skills.filter((s) => s.action === "blocked").length,
      external: entries.filter((e) => e.ownership === "external").length,
      issues: issues.length,
    },
    skills,
    external: entries.filter((e) => e.ownership === "external"),
    issues,
    note: "仅盘点配置来源与已知插件路径；external 由宿主插件管理器维护；没有修改 Skill、catalog 或 Agent 配置。",
  };
}
