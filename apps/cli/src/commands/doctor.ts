import { access, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import {
  defaultHubConfig,
  loadHubConfig,
  resolveHubConfigPaths,
  scanSkills,
} from "@skill-hub/core";
import {
  SKILL_HUB_VERSION,
  expandUserPath,
  getDefaultHubHome,
  hubLayout,
} from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runDoctor(options: {
  json: boolean;
  configPath?: string;
}): Promise<number> {
  const hubHome = getDefaultHubHome();
  const layout = hubLayout(hubHome);
  let config;
  try {
    config = resolveHubConfigPaths(
      options.configPath
        ? await loadHubConfig(options.configPath)
        : await loadHubConfig().catch(() => defaultHubConfig()),
    );
  } catch {
    config = resolveHubConfigPaths(defaultHubConfig());
  }

  const agents = [];
  for (const a of config.agents) {
    const p = expandUserPath(a.skills_dir);
    let exists = false;
    let count = 0;
    try {
      await access(p, fsConstants.R_OK);
      exists = true;
      // 只统计一级子目录中有 SKILL.md 的数量（轻量）；完整 scan 留给 inventory
      try {
        const skills = await scanSkills(p, { agentId: a.id, maxDepth: 3 });
        count = skills.length;
      } catch {
        const entries = await readdir(p).catch(() => []);
        count = entries.length;
      }
    } catch {
      exists = false;
    }
    agents.push({
      id: a.id,
      path: p,
      enabled: a.enabled,
      exists,
      count,
    });
  }

  const issues: string[] = [];
  let canonicalExists = false;
  try {
    await access(layout.home, fsConstants.R_OK);
    canonicalExists = true;
  } catch {
    issues.push(`hub home 不存在（可运行 skill-hub init）: ${layout.home}`);
  }

  for (const a of agents) {
    if (a.enabled && !a.exists) {
      issues.push(`agent ${a.id} skills 目录不存在: ${a.path}`);
    }
  }

  const result = {
    ok: issues.length === 0,
    version: SKILL_HUB_VERSION,
    node: process.version,
    canonical: { path: layout.home, exists: canonicalExists },
    catalog: layout.catalog,
    agents,
    issues,
  };

  if (options.json) {
    printJson(result);
  } else {
    printLines([
      `skill-hub doctor  v${SKILL_HUB_VERSION}`,
      `node: ${process.version}`,
      `hub:  ${layout.home}  (${canonicalExists ? "exists" : "missing"})`,
      "",
      "agents:",
      ...agents.map(
        (a) =>
          `  - ${a.id.padEnd(12)} ${a.exists ? "OK" : "MISS"}  count≈${a.count}  ${a.path}`,
      ),
      "",
      issues.length === 0 ? "issues: (none)" : `issues:\n${issues.map((i) => `  - ${i}`).join("\n")}`,
    ]);
  }

  return result.ok ? 0 : 3;
}
