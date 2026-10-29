import { mkdtemp, mkdir, writeFile, symlink, cp, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hashSkillTree, inspectSkillTree } from "./tree.js";
import { parseSkillMd } from "./parse.js";
import { normalizeSkillName } from "@skill-hub/shared";

describe("Skill tree and real-world metadata", () => {
  it("preserves the pre-preview tree hash format when collecting a metadata manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hub-tree-golden-"));
    try {
      await mkdir(path.join(root, "empty"));
      await writeFile(path.join(root, "sample.txt"), "abc\n");
      await chmod(path.join(root, "sample.txt"), 0o644);
      const expected = "sha256:589fb854263dce8f80f1495a1d0ee1e266c5f461a8a8b65b406ea39f9a19b80e";
      expect(await hashSkillTree(root)).toBe(expected);
      const inspected = await inspectSkillTree(root);
      expect(inspected.treeHash).toBe(expected);
      expect(inspected.entries).toMatchObject([
        { path: "", kind: "directory" },
        { path: "empty", kind: "directory" },
        { path: "sample.txt", kind: "file", executable: 0 },
      ]);
      expect(JSON.stringify(inspected)).not.toContain("abc");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("hashes dereferenced copies equally, including attachments and executable mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hub-tree-"));
    const src = path.join(root, "src");
    await mkdir(src);
    await writeFile(path.join(src, "script"), "one");
    await symlink("script", path.join(src, "alias"));
    const dest = path.join(root, "copy");
    await cp(src, dest, { recursive: true, dereference: true });
    expect(await hashSkillTree(src)).toBe(await hashSkillTree(dest));
    await chmod(path.join(dest, "script"), 0o755);
    expect(await hashSkillTree(src)).not.toBe(await hashSkillTree(dest));
  });
  it("excludes root .git metadata from canonical tree fingerprints", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hub-tree-git-meta-"));
    try {
      await writeFile(path.join(root, "SKILL.md"), "skill");
      const original = await hashSkillTree(root);
      await mkdir(path.join(root, ".git", "objects"), { recursive: true });
      await writeFile(path.join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
      await writeFile(path.join(root, ".git", "objects", "fixture"), "one");
      expect(await hashSkillTree(root)).toBe(original);
      expect(
        (await inspectSkillTree(root)).entries.some((entry) => entry.path.startsWith(".git")),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects escaping links, cycles and dangerous skill names", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hub-tree-"));
    const src = path.join(root, "src");
    await mkdir(src);
    await writeFile(path.join(root, "secret"), "outside");
    await symlink("../secret", path.join(src, "link"));
    await expect(hashSkillTree(src)).rejects.toThrow("越界");
    const cycle = path.join(root, "cycle");
    await mkdir(cycle);
    await symlink(".", path.join(cycle, "loop"));
    await expect(hashSkillTree(cycle)).rejects.toThrow("环路");
    expect(() => normalizeSkillName("..")).toThrow();
    expect(() => normalizeSkillName(".")).toThrow();
  });
  it("parses multi-line description without nested metadata overriding the name", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hub-meta-"));
    const file = path.join(root, "SKILL.md");
    await writeFile(
      file,
      "---\nname: valid-name\ndescription:\n  React composition patterns.\n  Use when building components.\nmetadata:\n  name: not-the-skill\n---\nbody",
    );
    const meta = await parseSkillMd(file);
    expect(meta.name).toBe("valid-name");
    expect(meta.description).toContain("Use when building");
    await writeFile(
      file,
      "---\nname: valid-name\ndescription: >-\n  This is folded.\n  Another line.\n---\nbody",
    );
    expect((await parseSkillMd(file)).description).toBe("This is folded. Another line.");
  });
});
