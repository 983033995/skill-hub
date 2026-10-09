import { mkdtemp, mkdir, open, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { SkillHubError } from "@skill-hub/shared";
import { loadHubSkills, skillFetch } from "./hub-service.js";
import { skillFiles, skillList, skillRead } from "./runtime.js";

describe("Hub runtime progressive reads", () => {
  it("lists, paginates attachments, and resumes a UTF-8 body from a symlinked root", async () => {
    const fixture = await createRuntimeFixture();

    const listed = await skillList({
      query: "runtime",
      limit: 1,
      catalogPath: fixture.catalogPath,
    });
    expect(listed).toMatchObject({ total: 1, offset: 0, nextOffset: null });
    expect(listed.skills[0]).toMatchObject({
      name: "runtime-skill",
      description: "runtime pagination fixture",
      path: fixture.linkedSkill,
    });

    const files = await skillFiles({
      name: "runtime-skill",
      limit: 1,
      catalogPath: fixture.catalogPath,
    });
    expect(files.total).toBe(2);
    expect(files.files).toEqual([expect.objectContaining({ path: "SKILL.md", type: "file" })]);
    expect(files.nextOffset).toBe(1);
    const secondPage = await skillFiles({
      name: "runtime-skill",
      offset: 1,
      limit: 1,
      catalogPath: fixture.catalogPath,
    });
    expect(secondPage.files).toEqual([{ path: "references", type: "directory" }]);
    const attachments = await skillFiles({
      name: "runtime-skill",
      path: "references",
      catalogPath: fixture.catalogPath,
    });
    expect(attachments.files.map((entry) => entry.path)).toEqual([
      "references/a.md",
      "references/b.md",
    ]);

    const first = await skillRead({
      name: "runtime-skill",
      maxChars: 8,
      catalogPath: fixture.catalogPath,
    });
    expect(first).toMatchObject({ file: "SKILL.md", offset: 0, body: "---\nname" });
    expect(first.nextOffset).toBe(8);
    expect(first.truncated).toBe(true);
    expect(first.hash).toMatch(/^sha256:/);
    const next = await skillRead({
      name: "runtime-skill",
      offset: first.nextOffset ?? 0,
      maxChars: 9,
      catalogPath: fixture.catalogPath,
    });
    expect(`${first.body}${next.body}`).toBe("---\nname: runtime");
    expect(next.totalChars).toBe(first.totalChars);
    const unicode = "中文🙂正文".repeat(10000);
    await writeFile(path.join(fixture.realSkill, "references/unicode.md"), unicode);
    let assembled = "";
    let offset = 0;
    while (true) {
      const chunk = await skillRead({
        name: "runtime-skill",
        file: "references/unicode.md",
        offset,
        maxChars: 127,
        catalogPath: fixture.catalogPath,
      });
      assembled += chunk.body;
      if (chunk.nextOffset === null) break;
      offset = chunk.nextOffset;
    }
    expect(assembled).toBe(unicode);

    const fetched = await skillFetch({
      name: "runtime-skill",
      offset: 4,
      maxChars: 4,
      catalogPath: fixture.catalogPath,
    });
    expect(fetched).toMatchObject({
      name: "runtime-skill",
      skillMdPath: path.join(fixture.linkedSkill, "SKILL.md"),
      body: "name",
      offset: 4,
      nextOffset: 8,
    });
  });

  it("rejects traversal, escaping links, symlink cycles, binary files, and invalid pagination", async () => {
    const fixture = await createRuntimeFixture();
    await writeFile(path.join(fixture.root, "secret.md"), "secret", "utf8");
    await symlink(
      path.join(fixture.realSkill, "references", "a.md"),
      path.join(fixture.realSkill, "inside-link.md"),
    );
    await symlink(
      path.join(fixture.root, "secret.md"),
      path.join(fixture.realSkill, "outside-link.md"),
    );
    await symlink(fixture.realSkill, path.join(fixture.realSkill, "loop"));
    await writeFile(path.join(fixture.realSkill, "binary.bin"), Buffer.from([0x00, 0x01]));

    await expect(
      skillRead({ name: "runtime-skill", file: "../secret.md", catalogPath: fixture.catalogPath }),
    ).rejects.toMatchObject<Partial<SkillHubError>>({ code: "E_PATH" });
    await expect(
      skillRead({ name: "runtime-skill", file: fixture.root, catalogPath: fixture.catalogPath }),
    ).rejects.toMatchObject<Partial<SkillHubError>>({ code: "E_PATH" });
    await expect(
      skillRead({
        name: "runtime-skill",
        file: "outside-link.md",
        catalogPath: fixture.catalogPath,
      }),
    ).rejects.toMatchObject<Partial<SkillHubError>>({ code: "E_PATH" });
    await expect(
      skillRead({ name: "runtime-skill", file: "binary.bin", catalogPath: fixture.catalogPath }),
    ).rejects.toMatchObject<Partial<SkillHubError>>({ code: "E_PATH" });
    const listing = await skillFiles({ name: "runtime-skill", catalogPath: fixture.catalogPath });
    expect(listing.files.find((entry) => entry.path === "loop")?.type).toBe("blocked");
    expect(listing.files.find((entry) => entry.path === "outside-link.md")?.type).toBe("blocked");
    expect(
      (
        await skillRead({
          name: "runtime-skill",
          file: "inside-link.md",
          catalogPath: fixture.catalogPath,
        })
      ).body,
    ).toBe("a");
    await expect(
      skillFiles({ name: "runtime-skill", path: "loop", catalogPath: fixture.catalogPath }),
    ).rejects.toMatchObject<Partial<SkillHubError>>({ code: "E_PATH" });
    await expect(skillList({ limit: 101, catalogPath: fixture.catalogPath })).rejects.toMatchObject<
      Partial<SkillHubError>
    >({ code: "E_CONFIG" });
  });

  it("rejects oversized files, non UTF-8 content and out-of-range offsets", async () => {
    const fixture = await createRuntimeFixture();
    const large = await open(path.join(fixture.realSkill, "large.txt"), "w");
    await large.truncate(10 * 1024 * 1024 + 1);
    await large.close();
    await writeFile(path.join(fixture.realSkill, "invalid.txt"), Buffer.from([0xff]));
    await mkdir(path.join(fixture.realSkill, ".git"));
    await writeFile(path.join(fixture.realSkill, ".git/config"), "git-private");
    await symlink(
      path.join(fixture.realSkill, ".git/config"),
      path.join(fixture.realSkill, "git-alias"),
    );
    for (const file of ["large.txt", "invalid.txt", ".git/config", "git-alias"]) {
      await expect(
        skillRead({ name: "runtime-skill", file, catalogPath: fixture.catalogPath }),
      ).rejects.toMatchObject({ code: "E_PATH" });
    }
    for (const offset of [-1, NaN, 0.5, 999999]) {
      await expect(
        skillRead({ name: "runtime-skill", offset, catalogPath: fixture.catalogPath }),
      ).rejects.toMatchObject({ code: "E_CONFIG" });
    }
  });

  it("does not treat a malformed existing catalog as an absent catalog", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-runtime-bad-catalog-"));
    const catalogPath = path.join(root, "catalog.json");
    await writeFile(catalogPath, "{not json", "utf8");
    await expect(loadHubSkills({ catalogPath })).rejects.toMatchObject<Partial<SkillHubError>>({
      code: "E_PARSE",
    });
  });

  it("falls back to canonical scanning only when the catalog is missing", async () => {
    const fixture = await createRuntimeFixture();
    const missingCatalog = path.join(fixture.root, "missing-catalog.json");
    const loaded = await loadHubSkills({
      catalogPath: missingCatalog,
      skillsDir: path.dirname(fixture.linkedSkill),
    });
    expect(loaded.skills.map((skill) => skill.name)).toEqual(["runtime-skill"]);
  });
});

async function createRuntimeFixture(): Promise<{
  root: string;
  realSkill: string;
  linkedSkill: string;
  catalogPath: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-hub-runtime-"));
  const realSkill = path.join(root, "real", "runtime-skill");
  const linkedSkill = path.join(root, "projected", "runtime-skill");
  await mkdir(path.join(realSkill, "references"), { recursive: true });
  await mkdir(path.dirname(linkedSkill), { recursive: true });
  await writeFile(
    path.join(realSkill, "SKILL.md"),
    "---\nname: runtime-skill\ndescription: runtime pagination fixture\n---\n\nbody text\n",
    "utf8",
  );
  await writeFile(path.join(realSkill, "references", "a.md"), "a", "utf8");
  await writeFile(path.join(realSkill, "references", "b.md"), "b", "utf8");
  await symlink(realSkill, linkedSkill);
  const meta = (await scanSkills(path.join(root, "projected")))[0]!;
  const catalogPath = path.join(root, "catalog.json");
  await writeCatalog(catalogPath, buildCatalog([meta]));
  return { root, realSkill, linkedSkill, catalogPath };
}
