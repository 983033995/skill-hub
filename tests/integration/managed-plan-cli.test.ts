import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { hashSkillTree } from "@skill-hub/core";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("compiled update requires the preview token plus explicit authorization and rejects stale plans", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-update-plan-cli-"));
  try {
    const home = path.join(root, "hub");
    const source = path.join(root, "source");
    await mkdir(home);
    await mkdir(source);
    await writeFile(
      path.join(home, "config.yaml"),
      `version: 1\ncanonical_dir: ${home}/skills\nindex_dir: ${home}/index\nbackup_dir: ${home}/backups\nagents:\n  - id: synthetic\n    skills_dir: ${root}/agent\n    enabled: true\n`,
    );
    await writeFile(
      path.join(source, "SKILL.md"),
      "---\nname: alpha\ndescription: Synthetic alpha\n---\nbody\n",
    );
    await writeFile(path.join(source, "guide.txt"), "version one");
    const env = {
      ...process.env,
      SKILL_HUB_HOME: home,
      SKILL_HUB_CONFIG: "",
      TYPESAFE_API_KEY: "",
    };
    const cli = async (...args: string[]) => {
      try {
        const result = await exec(
          process.execPath,
          [path.join(repo, "apps/cli/dist/index.js"), ...args, "--json"],
          { cwd: repo, env, timeout: 30_000 },
        );
        return { code: 0, data: JSON.parse(result.stdout) };
      } catch (caught) {
        const error = caught as { code: number; stdout: string };
        return { code: error.code, data: JSON.parse(error.stdout) };
      }
    };
    expect((await cli("install", source, "--apply", "--yes")).code).toBe(0);
    await writeFile(path.join(source, "guide.txt"), "version two");
    const preview = await cli("update", "alpha");
    expect(preview.data).toMatchObject({ dryRun: true, indexUpdated: false });
    expect(preview.data.items[0].changes).toMatchObject([
      { path: "guide.txt", change: "modified" },
    ]);
    expect(preview.data.planToken).toMatch(/^sha256:[0-9a-f]{64}$/);
    const before = await hashSkillTree(home);
    expect(await cli("update", "alpha", "--apply", "--yes")).toMatchObject({
      code: 3,
      data: { code: "E_CONFIG" },
    });
    expect(
      await cli("update", "alpha", "--plan-token", preview.data.planToken, "--apply"),
    ).toMatchObject({ code: 3, data: { code: "E_CONFIG" } });
    expect(await cli("update", "alpha", "--plan-token")).toMatchObject({
      code: 3,
      data: { code: "E_CONFIG" },
    });
    expect(await hashSkillTree(home)).toBe(before);

    await writeFile(path.join(source, "guide.txt"), "version three");
    expect(
      await cli("update", "alpha", "--plan-token", preview.data.planToken, "--apply", "--yes"),
    ).toMatchObject({ code: 2, data: { code: "E_CONFLICT" } });
    expect(await hashSkillTree(home)).toBe(before);
    const fresh = await cli("update", "alpha");
    expect(fresh.data.planToken).not.toBe(preview.data.planToken);
    const text = await exec(
      process.execPath,
      [path.join(repo, "apps/cli/dist/index.js"), "update", "alpha"],
      { cwd: repo, env, timeout: 30_000 },
    );
    expect(text.stdout).toContain(`更新确认指纹: ${fresh.data.planToken}`);
    expect(text.stdout).toContain("modified guide.txt");

    const applied = await cli(
      "update",
      "alpha",
      "--plan-token",
      fresh.data.planToken,
      "--apply",
      "--yes",
    );
    expect(applied).toMatchObject({
      code: 0,
      data: { dryRun: false, planToken: fresh.data.planToken, indexUpdated: true },
    });
    expect(await readFile(path.join(home, "skills", "alpha", "guide.txt"), "utf8")).toBe(
      "version three",
    );
    const lock = JSON.parse(await readFile(path.join(home, "managed-lock.json"), "utf8"));
    expect(lock.skills.alpha.treeHash).toBe(
      await hashSkillTree(path.join(home, "skills", "alpha")),
    );
    const backup = applied.data.items[0].backupPath;
    expect((await cli("rollback", "alpha", "--from", backup, "--apply", "--yes")).code).toBe(0);
    expect(await readFile(path.join(home, "skills", "alpha", "guide.txt"), "utf8")).toBe(
      "version one",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
