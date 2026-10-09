import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

  it("follows directory symlinks, skips broken/file links, and avoids cycles", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-scan-links-"));
    const canonical = path.join(root, "canonical", "linked-skill");
    const realDir = path.join(root, "real-dir");
    await mkdir(canonical, { recursive: true });
    await writeFile(
      path.join(canonical, "SKILL.md"),
      "---\nname: linked-skill\ndescription: A linked fixture skill\n---\n",
    );
    await mkdir(realDir, { recursive: true });
    await writeFile(
      path.join(realDir, "SKILL.md"),
      "---\nname: real-skill\ndescription: A real fixture skill\n---\n",
    );

    await symlink(canonical, path.join(root, "linked-skill"));
    await symlink(path.join(root, "missing"), path.join(root, "broken-link"));
    await symlink(path.join(root, "plain.txt"), path.join(root, "file-link"));
    await writeFile(path.join(root, "plain.txt"), "not a skill directory\n");
    await symlink(root, path.join(root, "cycle"));

    const skills = await scanSkills(root);
    expect(skills.map((skill) => skill.name)).toEqual(["linked-skill", "real-skill"]);
  });
});
