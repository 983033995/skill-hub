import path from "node:path";
import { resolveAbsolutePath, type HubConfig, type SkillSourceMapping } from "@skill-hub/shared";

/**
 * 已知用户级 Skill 来源，仅供盘点和显式选源导入；不加入 config.agents。
 * 显式 source 同 id 覆盖默认值（包括 enabled:false）；已有路径不重复扫描。
 */
export function agentSkillSources(
  config: Pick<HubConfig, "agents" | "sources">,
  env: NodeJS.ProcessEnv = process.env,
): SkillSourceMapping[] {
  const configHome = env.XDG_CONFIG_HOME?.trim() || "~/.config";
  const dshHome = env.DSH_HOME?.trim() || "~/.dsh";
  const presets = [
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

  const sources = [...(config.sources ?? [])];
  const ids = new Set([...config.agents, ...sources].map((item) => item.id));
  // 停用条目也占用路径，避免换一个内置 id 绕过用户的停用设置。
  const paths = new Set([
    ...config.agents.map((agent) => resolveAbsolutePath(agent.skills_dir)),
    ...sources.map((source) => resolveAbsolutePath(source.path)),
  ]);
  for (const [id, sourcePath] of presets) {
    const resolved = resolveAbsolutePath(sourcePath);
    if (ids.has(id) || paths.has(resolved)) continue;
    sources.push({ id, path: resolved, scope: "user", enabled: true, source_type: "local" });
    ids.add(id);
    paths.add(resolved);
  }
  return sources;
}
