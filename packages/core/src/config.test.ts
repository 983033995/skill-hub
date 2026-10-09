import { describe, expect, it } from "vitest";
import { parseHubConfigYaml, sourceMappingToProvenance } from "./config.js";

describe("hub config skill sources", () => {
  it("parses independent user/workspace/project sources", () => {
    const config = parseHubConfigYaml(`
version: 1
canonical_dir: ~/.skill-hub/skills
index_dir: ~/.skill-hub/index
backup_dir: ~/.skill-hub/backups
sources:
  - id: project-claude
    path: /repo/.claude/skills
    scope: project
    enabled: true
    source_type: local
    source_ref: repo-main
    revision: abc123
    status: draft
    overlay_of: base-skill
  - id: workspace-skills
    path: /workspace/.agents/skills
    scope: workspace
    enabled: false
`);

    expect(config.sources).toHaveLength(2);
    expect(config.sources?.[0]).toMatchObject({
      id: "project-claude",
      scope: "project",
      source_type: "local",
      source_ref: "repo-main",
      revision: "abc123",
      status: "draft",
      overlay_of: "base-skill",
    });
    expect(config.sources?.[1]?.enabled).toBe(false);
  });

  it("maps source metadata without including arbitrary markdown", () => {
    const source = {
      id: "project",
      path: "/repo/.claude/skills",
      scope: "project" as const,
      enabled: true,
    };
    expect(sourceMappingToProvenance(source)).toEqual({
      scope: "project",
      sourceType: "local",
      sourceRef: "/repo/.claude/skills",
      revision: undefined,
      status: "active",
      overlayOf: undefined,
    });
  });
});
