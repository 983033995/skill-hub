import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAbsolutePath } from "@skill-hub/shared";
import { agentSkillSources, resolveExplicitAgentSkillSource } from "./agent-sources.js";
import { defaultHubConfig } from "./config.js";

describe("built-in Agent Skill sources", () => {
  it("adds user sources without changing the existing sync targets or explicit sources", () => {
    const config = defaultHubConfig();
    const before = structuredClone(config);
    const sources = agentSkillSources(config, {});
    expect(sources.map((source) => source.id)).toEqual([
      "deepseek-harness",
      "opencode",
      "gemini-cli",
      "qoder",
      "github-copilot",
      "windsurf",
      "devin",
      "cline",
      "roo-code",
      "kilo-code",
    ]);
    expect(sources.every((source) => source.scope === "user" && source.enabled)).toBe(true);
    expect(sources.find((source) => source.id === "deepseek-harness")?.path).toBe(
      resolveAbsolutePath("~/.dsh/skills"),
    );
    expect(sources.find((source) => source.id === "kilo-code")?.path).toBe(
      resolveAbsolutePath("~/.kilo/skills"),
    );
    expect(config).toEqual(before);
  });

  it("honors DSH_HOME and XDG_CONFIG_HOME and treats blank overrides as unset", () => {
    const config = defaultHubConfig();
    const custom = agentSkillSources(config, {
      DSH_HOME: "/custom/dsh",
      XDG_CONFIG_HOME: "/custom/config",
    });
    expect(custom.find((source) => source.id === "deepseek-harness")?.path).toBe(
      "/custom/dsh/skills",
    );
    expect(custom.find((source) => source.id === "opencode")?.path).toBe(
      "/custom/config/opencode/skills",
    );
    expect(custom.find((source) => source.id === "devin")?.path).toBe(
      "/custom/config/devin/skills",
    );
    expect(agentSkillSources(config, { DSH_HOME: "  ", XDG_CONFIG_HOME: "" })).toEqual(
      agentSkillSources(config, {}),
    );
  });

  it("preserves same-id overrides and disabled sources instead of re-enabling defaults", () => {
    const config = defaultHubConfig();
    config.sources = [
      { id: "deepseek-harness", path: "/custom/skills", scope: "workspace", enabled: true },
      { id: "opencode", path: "/disabled/skills", scope: "user", enabled: false },
    ];
    const sources = agentSkillSources(config, {});
    expect(sources.filter((source) => source.id === "deepseek-harness")).toEqual([
      config.sources[0],
    ]);
    expect(sources.filter((source) => source.id === "opencode")).toEqual([config.sources[1]]);
  });

  it("does not duplicate paths already declared under another id, including disabled mappings", () => {
    const config = defaultHubConfig();
    config.agents.push({ id: "custom-dsh", skills_dir: "~/.dsh/skills", enabled: false });
    config.sources = [
      {
        id: "custom-opencode",
        path: resolveAbsolutePath("~/.config/opencode/skills"),
        scope: "user",
        enabled: false,
      },
    ];
    const sources = agentSkillSources(config, {});
    expect(sources.some((source) => source.id === "deepseek-harness")).toBe(false);
    expect(sources.some((source) => source.id === "opencode")).toBe(false);
    expect(new Set(sources.map((source) => path.resolve(source.path))).size).toBe(sources.length);
  });

  it("resolves an explicitly selected built-in ID through an existing same-ID Agent path", () => {
    const config = defaultHubConfig();
    config.agents.push({ id: "qoder", skills_dir: "/legacy/qoder-skills", enabled: true });

    expect(agentSkillSources(config, {}).some((source) => source.id === "qoder")).toBe(false);
    expect(resolveExplicitAgentSkillSource("qoder", config, {})).toMatchObject({
      id: "qoder",
      path: "/legacy/qoder-skills",
      scope: "user",
      enabled: true,
    });
  });

  it("resolves a built-in ID through an Agent that already owns the preset path", () => {
    const config = defaultHubConfig();
    config.agents.push({ id: "custom-qoder", skills_dir: "~/.qoder/skills", enabled: false });

    expect(agentSkillSources(config, {}).some((source) => source.id === "qoder")).toBe(false);
    expect(resolveExplicitAgentSkillSource("qoder", config, {})).toMatchObject({
      id: "qoder",
      path: "~/.qoder/skills",
    });
  });

  it("keeps explicit disabled source overrides and does not fall back to the preset", () => {
    const config = defaultHubConfig();
    const disabled = {
      id: "qoder",
      path: "/disabled/qoder-skills",
      scope: "user" as const,
      enabled: false,
    };
    config.sources = [disabled];

    expect(resolveExplicitAgentSkillSource("qoder", config, {})).toBe(disabled);
    expect(resolveExplicitAgentSkillSource("unknown", config, {})).toBeUndefined();
  });
});
