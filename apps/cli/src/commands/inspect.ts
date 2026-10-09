import { skillExplain, skillHistory, skillPaths } from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runExplain(options: {
  json: boolean;
  name: string;
  catalogPath?: string;
  configPath?: string;
  historyPath?: string;
}): Promise<number> {
  const result = await skillExplain(options);
  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `explain ${result.name}`,
    `  scope:      ${result.scope}`,
    `  source:     ${result.source ?? "unknown"}`,
    `  hash:       ${result.meta.hash}`,
    `  revision:   ${result.revision ?? "unknown"}`,
    `  status:     ${result.status ?? "unknown"}`,
    `  recorded:   ${result.meta.path}`,
    `  variants:   ${result.variants.length}`,
    `  winner:     ${result.winner?.path ?? result.meta.path}`,
    `  reason:     ${result.winnerReason ?? "无同名不同 hash 冲突"}`,
    `  overlay:    ${result.overlay.overlayOf ?? "none"}`,
    `  projections: ${result.paths.agents.filter((item) => item.status === "ok").length}/${result.paths.agents.length} healthy`,
    `  history:    ${result.history.length} events`,
  ]);
  if (result.conflict) {
    printLines([
      "  conflict variants:",
      ...result.conflict.variants.map((variant) =>
        `    - ${variant.path} ${variant.hash} ${variant.agentId ?? ""}`.trim(),
      ),
    ]);
  }
  return 0;
}

export async function runPath(options: {
  json: boolean;
  name: string;
  catalogPath?: string;
  configPath?: string;
}): Promise<number> {
  const result = await skillPaths(options);
  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `path ${result.name}`,
    `  canonical: ${result.canonicalPath} (${result.canonicalExists ? "exists" : "missing"})`,
    `  recorded:  ${result.recordedPath}`,
    `  source:    ${result.source.path ?? result.source.ref ?? "unknown"}`,
    "  agents:",
    ...result.agents.map(
      (agent) =>
        `    - ${agent.agentId}${agent.enabled ? "" : " (disabled)"}: ${agent.status} → ${agent.target}${agent.detail ? ` (${agent.detail})` : ""}`,
    ),
  ]);
  return 0;
}

export async function runHistory(options: {
  json: boolean;
  name?: string;
  historyPath?: string;
  limit?: number;
}): Promise<number> {
  if (options.limit !== undefined && (!Number.isFinite(options.limit) || options.limit < 1)) {
    throw new SkillHubError({ code: "E_CONFIG", message: "history --limit 必须是正整数" });
  }
  const result = await skillHistory(options);
  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `history${result.name ? ` ${result.name}` : ""}  events=${result.entries.length}`,
    `  file: ${result.path}`,
    ...result.entries.map((entry) => {
      const subject = entry.name ?? "hub";
      const target = entry.agentId ? ` agent=${entry.agentId}` : "";
      return `  - ${entry.at} ${entry.type}/${entry.action ?? "event"} ${subject}${target}${entry.hash ? ` hash=${entry.hash}` : ""}`;
    }),
  ]);
  return 0;
}
