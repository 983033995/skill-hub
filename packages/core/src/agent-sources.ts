import path from "node:path";
import { resolveAbsolutePath, type HubConfig, type SkillSourceMapping } from "@skill-hub/shared";

type AgentSkillSourceConfig = Pick<HubConfig, "agents" | "sources">;

function builtInSources(env: NodeJS.ProcessEnv) {
  const configHome = env.XDG_CONFIG_HOME?.trim() || "~/.config";
  const dshHome = env.DSH_HOME?.trim() || "~/.dsh";
  return [
    ["deepseek-harness", path.join(dshHome, "skills")],
    ["opencode", path.join(configHome, "opencode/skills")],
    ["gemini-cli", "~/.gemini/skills"],
    ["qoder", "~/.qoder/skills"],
    ["github-copilot", "~/.copilot/skills"],
    ["windsurf", "~/.codeium/windsurf/skills"],
    ["devin", path.join(configHome, "devin/skills")],
    ["cline", "~/.cline/skills"],
    ["roo-code", "~/.roo/skills"],
    ["kilo-code", "~/.kilo/skills"],
  ] as const;
}

/**
 * 已知用户级 Skill 来源，仅供盘点和显式选源导入；不加入 config.agents。
 * 显式 source 同 id 覆盖默认值（包括 enabled:false）；已有路径不重复扫描。
 */
export function agentSkillSources(
  config: AgentSkillSourceConfig,
  env: NodeJS.ProcessEnv = process.env,
): SkillSourceMapping[] {
  const sources = [...(config.sources ?? [])];
  const ids = new Set([...config.agents, ...sources].map((item) => item.id));
  // 停用条目也占用路径，避免换一个内置 id 绕过用户的停用设置。
  const paths = new Set([
    ...config.agents.map((agent) => resolveAbsolutePath(agent.skills_dir)),
    ...sources.map((source) => resolveAbsolutePath(source.path)),
  ]);
  for (const [id, sourcePath] of builtInSources(env)) {
    const resolved = resolveAbsolutePath(sourcePath);
    if (ids.has(id) || paths.has(resolved)) continue;
    sources.push({ id, path: resolved, scope: "user", enabled: true, source_type: "local" });
    ids.add(id);
    paths.add(resolved);
  }
  return sources;
}

/**
 * Resolve an explicitly selected source ID for ingest without adding the
 * matching Agent directory to inventory's source scan list.
 */
export function resolveExplicitAgentSkillSource(
  id: string,
  config: AgentSkillSourceConfig,
  env: NodeJS.ProcessEnv = process.env,
): SkillSourceMapping | undefined {
  const configured = config.sources?.find((source) => source.id === id);
  if (configured) return configured;

  const preset = builtInSources(env).find(([presetId]) => presetId === id);
  if (!preset) return undefined;

  const presetPath = resolveAbsolutePath(preset[1]);
  const agent =
    config.agents.find((candidate) => candidate.id === id) ??
    config.agents.find((candidate) => resolveAbsolutePath(candidate.skills_dir) === presetPath);
  return {
    id,
    path: agent?.skills_dir ?? presetPath,
    scope: "user",
    enabled: true,
    source_type: "local",
  };
}
