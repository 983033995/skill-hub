import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import { filterGlobalSyncSkills } from "./scope.js";

const meta = (name: string, scope?: "user" | "workspace" | "project"): SkillMeta => ({
  name,
  description: `${name} skill`,
  path: `/skills/${name}`,
  hash: `sha256:${name}`,
  mtimeMs: 1,
  provenance: scope ? { scope, sourceRef: `/source/${name}` } : undefined,
});

describe("global sync scope", () => {
  it("keeps legacy/user skills and excludes project/workspace skills", () => {
    const result = filterGlobalSyncSkills([
      meta("legacy"),
      meta("user", "user"),
      meta("workspace", "workspace"),
      meta("project", "project"),
    ]);
    expect(result.skills.map((skill) => skill.name)).toEqual(["legacy", "user"]);
    expect(result.excluded.map((item) => [item.name, item.scope])).toEqual([
      ["workspace", "workspace"],
      ["project", "project"],
    ]);
  });
});
