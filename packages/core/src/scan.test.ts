import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SkillHubError } from "@skill-hub/shared";
import { parseSkillMd } from "./parse.js";
import { scanSkills } from "./scan.js";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../tests/fixtures/skills",
);

describe("parseSkillMd / scanSkills", () => {
  it("parses sample-skill fixture", async () => {
    const meta = await parseSkillMd(path.join(fixtures, "sample-skill/SKILL.md"));
    expect(meta.name).toBe("sample-skill");
    expect(meta.description).toContain("Fixture skill");
    expect(meta.hash.startsWith("sha256:")).toBe(true);
    expect(meta.path.endsWith("sample-skill")).toBe(true);
  });

  it("scans fixture root and skips bad skill", async () => {
    const skills = await scanSkills(fixtures);
    const names = skills.map((s) => s.name);
    expect(names).toContain("sample-skill");
    expect(names).toContain("pdf-merge");
    expect(names).toContain("frontend-design");
    // bad-skill 无有效 name/description → 跳过
    expect(names).not.toContain("bad-skill");
    expect(skills.length).toBeGreaterThanOrEqual(3);
  });

  it("throws E_PARSE on empty description when parsing directly", async () => {
    await expect(parseSkillMd(path.join(fixtures, "bad-skill/SKILL.md"))).rejects.toBeInstanceOf(
      SkillHubError,
    );
  });
});
