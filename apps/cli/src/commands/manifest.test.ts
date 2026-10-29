import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderAvailableSkillsManifest, runManifest } from "./manifest.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("manifest command", () => {
  it("renders only sorted metadata and escapes XML text", () => {
    const manifest = renderAvailableSkillsManifest([
      { name: "z-skill", description: "last" },
      { name: "a-skill", description: "A & <B>" },
    ]);

    expect(manifest.indexOf("<name>a-skill</name>")).toBeLessThan(
      manifest.indexOf("<name>z-skill</name>"),
    );
    expect(manifest).toContain("<description>A &amp; &lt;B&gt;</description>");
    expect(manifest).toContain("skill_search");
    expect(manifest).toContain("skill_read");
    expect(manifest).not.toContain("<location>");

    const invalidControl = renderAvailableSkillsManifest([
      { name: "control", description: `before${String.fromCharCode(1)}after` },
    ]);
    expect(invalidControl).toContain("<description>beforeafter</description>");
  });

  it("previews without writing and applies a complete paged manifest atomically", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-manifest-"));
    try {
      const home = path.join(root, "hub");
      const skillsRoot = path.join(home, "skills");
      for (let index = 0; index < 101; index += 1) {
        const name = `fixture-${String(index).padStart(3, "0")}`;
        const directory = path.join(skillsRoot, name);
        await mkdir(directory, { recursive: true });
        const description =
          index === 0 ? 'description: "A & <B>"' : `description: "Fixture ${index}"`;
        await writeFile(
          path.join(directory, "SKILL.md"),
          `---\nname: ${name}\n${description}\n---\nPRIVATE BODY MARKER\n`,
          "utf8",
        );
      }
      const catalog = buildCatalog(await scanSkills(skillsRoot));
      await writeCatalog(path.join(home, "catalog.json"), catalog);
      vi.stubEnv("SKILL_HUB_HOME", home);

      const outputPath = path.join(root, "output", "available-skills.xml");
      const jsonLog = vi.spyOn(console, "log").mockImplementation(() => {});
      await runManifest({ json: true, outputPath });
      expect(JSON.parse(String(jsonLog.mock.calls.at(-1)?.[0]))).toMatchObject({
        skillCount: 101,
        outputPath,
        dryRun: true,
      });
      await expect(access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });

      const forcedDryRun = await runManifest({
        json: true,
        outputPath,
        apply: true,
        dryRun: true,
        yes: true,
      });
      expect(forcedDryRun).toBe(0);
      await expect(access(outputPath)).rejects.toMatchObject({ code: "ENOENT" });

      await expect(runManifest({ json: true, outputPath, apply: true })).rejects.toMatchObject({
        code: "E_CONFIG",
      });
      await runManifest({ json: true, outputPath, apply: true, yes: true });
      await writeFile(outputPath, "old manifest\n", "utf8");
      await runManifest({ json: true, outputPath, apply: true, yes: true });

      const content = await readFile(outputPath, "utf8");
      expect(content.match(/<skill>/g)).toHaveLength(101);
      expect(content).toContain("<description>A &amp; &lt;B&gt;</description>");
      expect(content).not.toContain("PRIVATE BODY MARKER");
      expect(await readdir(path.dirname(outputPath))).toEqual([path.basename(outputPath)]);

      const linkPath = path.join(root, "manifest-link.xml");
      await symlink(outputPath, linkPath);
      await expect(
        runManifest({ json: true, outputPath: linkPath, apply: true, yes: true }),
      ).rejects.toMatchObject({
        code: "E_PATH",
      });
      expect(await readFile(outputPath, "utf8")).toBe(content);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("prints the content in JSON preview mode when no output path is selected", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-manifest-preview-"));
    try {
      const skillsRoot = path.join(root, "hub", "skills", "preview-skill");
      await mkdir(skillsRoot, { recursive: true });
      await writeFile(
        path.join(skillsRoot, "SKILL.md"),
        "---\nname: preview-skill\ndescription: Preview fixture\n---\nbody\n",
        "utf8",
      );
      await writeCatalog(
        path.join(root, "hub", "catalog.json"),
        buildCatalog(await scanSkills(path.dirname(skillsRoot))),
      );
      vi.stubEnv("SKILL_HUB_HOME", path.join(root, "hub"));
      const jsonLog = vi.spyOn(console, "log").mockImplementation(() => {});

      await runManifest({ json: true });

      expect(JSON.parse(String(jsonLog.mock.calls.at(-1)?.[0]))).toMatchObject({
        skillCount: 1,
        outputPath: null,
        dryRun: true,
        content: expect.stringContaining("<name>preview-skill</name>"),
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses catalog and used-config outputs through direct and parent-symlink paths", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-manifest-input-guard-"));
    try {
      const home = path.join(root, "hub");
      const skillDirectory = path.join(home, "skills", "guard-fixture");
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        path.join(skillDirectory, "SKILL.md"),
        "---\nname: guard-fixture\ndescription: Guard fixture\n---\nbody\n",
        "utf8",
      );
      const catalogPath = path.join(home, "catalog.json");
      await writeCatalog(catalogPath, buildCatalog(await scanSkills(path.join(home, "skills"))));
      const configPath = path.join(home, "config.yaml");
      const configText = `version: 1\ncanonical_dir: ${path.join(home, "skills")}\nindex_dir: ${path.join(home, "index")}\nbackup_dir: ${path.join(home, "backups")}\nagents: []\n`;
      await writeFile(configPath, configText, "utf8");
      const catalogText = await readFile(catalogPath, "utf8");
      const hubAlias = path.join(root, "hub-alias");
      await symlink(home, hubAlias, "dir");
      vi.stubEnv("SKILL_HUB_HOME", home);
      vi.stubEnv("SKILL_HUB_CONFIG", "");

      for (const outputPath of [
        catalogPath,
        path.join(hubAlias, "catalog.json"),
        configPath,
        path.join(hubAlias, "config.yaml"),
      ]) {
        await expect(
          runManifest({
            json: true,
            outputPath,
            apply: true,
            yes: true,
            catalogPath,
            configPath,
          }),
        ).rejects.toMatchObject({ code: "E_PATH" });
        expect(await readFile(catalogPath, "utf8")).toBe(catalogText);
        expect(await readFile(configPath, "utf8")).toBe(configText);
      }

      await expect(
        runManifest({ json: true, outputPath: configPath, apply: true, yes: true }),
      ).rejects.toMatchObject({ code: "E_PATH" });
      expect(await readFile(configPath, "utf8")).toBe(configText);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
