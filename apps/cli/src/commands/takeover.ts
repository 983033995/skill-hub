import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import {
  inspectTakeover,
  loadHubConfig,
  resolveHubConfigPaths,
  type TakeoverRoot,
} from "@skill-hub/core";
import { printJson, printLines } from "../output.js";

export async function runTakeover(options: {
  json: boolean;
  configPath?: string;
  out?: string;
  includePlugins?: boolean;
}) {
  const config = resolveHubConfigPaths(await loadHubConfig(options.configPath));
  const roots: TakeoverRoot[] = [
    { id: "hub", path: config.canonical_dir, ownership: "canonical" },
    ...config.agents
      .filter((a) => a.enabled)
      .map((a) => ({ id: a.id, path: a.skills_dir, ownership: "agent" as const })),
    ...(config.sources ?? [])
      .filter((s) => s.enabled)
      .map((s) => ({ id: s.id, path: s.path, ownership: "source" as const })),
  ];
  if (options.includePlugins) {
    for (const relative of [
      ".codex/plugins/cache",
      ".claude/plugins/cache",
      ".codex/skills/.system",
    ]) {
      roots.push({ id: relative, path: path.join(homedir(), relative), ownership: "external" });
    }
  }
  const report = await inspectTakeover(roots, config.canonical_dir);
  if (options.out) {
    const output = path.resolve(options.out);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.json) printJson(report);
  else
    printLines([
      "takeover（只读接管预览）",
      JSON.stringify(report.summary, null, 2),
      report.note,
      ...report.skills
        .filter((s) => s.action === "conflict" || s.action === "blocked")
        .map((s) => `  ${s.action}: ${s.name}`),
      ...(options.out ? [`报告: ${path.resolve(options.out)}`] : []),
    ]);
  return report.summary.conflicts || report.summary.issues ? 2 : 0;
}
