import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import { filterByScope } from "./scope.js";
import { routeWithProfile } from "./factory.js";

const skills: SkillMeta[] = [
  {
    name: "global-pdf",
    description: "merge pdf globally",
    path: "/user/global-pdf",
    hash: "sha256:user",
    mtimeMs: 1,
  },
  {
    name: "project-pdf",
    description: "merge project pdf",
    path: "/project/project-pdf",
    hash: "sha256:project",
    mtimeMs: 1,
    provenance: { scope: "project", sourceRef: "/repo/.claude/skills" },
  },
];

describe("skill scope routing", () => {
  it("treats legacy metadata as user and never falls back for explicit scope", () => {
    expect(filterByScope(skills, "user").skills.map((s) => s.name)).toEqual(["global-pdf"]);
    expect(filterByScope(skills, "project").skills.map((s) => s.name)).toEqual(["project-pdf"]);
    expect(filterByScope(skills, "workspace").skills).toEqual([]);
  });

  it("routes only within the requested scope", async () => {
    const result = await routeWithProfile({
      text: "merge pdf",
      scope: "project",
      skills,
    });
    expect(result.scope).toEqual(["project"]);
    expect(result.scopeMatched).toBe(1);
    expect(result.candidateCount).toBe(1);
    expect(result.results[0]?.name).toBe("project-pdf");
  });
});
