import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { hashSkillTree } from "@skill-hub/core";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("compiled CLI returns partial checks with exit 3 and never writes Hub or Agent state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-managed-check-cli-"));
  try {
    const home = path.join(root, "hub");
    const source = path.join(root, "source");
    const agent = path.join(root, "agent");
    await mkdir(home);
    await mkdir(agent);
    await writeFile(path.join(agent, "sentinel"), "untouched agent");
    await writeFile(
      path.join(home, "config.yaml"),
      `version: 1\ncanonical_dir: ${home}/skills\nindex_dir: ${home}/index\nbackup_dir: ${home}/backups\nagents:\n  - id: synthetic\n    skills_dir: ${agent}\n    enabled: true\n`,
    );
    for (const name of ["alpha", "beta"]) {
      await mkdir(path.join(source, name), { recursive: true });
      await writeFile(
        path.join(source, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: Synthetic fixture\n---\nbody\n`,
      );
    }
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
    const preview = await cli("install", source);
    expect(preview.code).toBe(0);
    expect(preview.data).toMatchObject({ dryRun: true, indexUpdated: false });
    expect(preview.data.next).not.toContain("Hub 已更新");
    expect((await cli("install", source, "--apply", "--yes")).code).toBe(0);
    await writeFile(path.join(source, "alpha", "new.txt"), "upstream");
    await writeFile(path.join(home, "skills", "alpha", "local.txt"), "user edit");
    await rm(path.join(source, "beta"), { recursive: true });
    // A read-only source check needs the validated lock, not a writable/healthy catalog.
    await writeFile(path.join(home, "catalog.json"), "broken catalog sentinel");
    const before = await Promise.all([home, agent].map(hashSkillTree));

    const result = await cli("check-updates");
    expect(result.code).toBe(3);
    expect(result.data).toMatchObject({ dryRun: true, complete: false, indexUpdated: false });
    expect(result.data.items).toMatchObject([
      { name: "alpha", localStatus: "modified", updateAvailable: true },
      { name: "beta", upstreamStatus: "unknown", updateAvailable: null },
    ]);
    expect(result.data.next).toContain("未写入");
    expect(await cli("check-updates", "alpha", "--apply", "--yes")).toMatchObject({
      code: 3,
      data: { code: "E_CONFIG" },
    });
    expect(await Promise.all([home, agent].map(hashSkillTree))).toEqual(before);
    for (const flag of ["--force", "--ref", "--from", "--unknown"]) {
      expect(await cli("check-updates", flag, "value")).toMatchObject({
        code: 3,
        data: { code: "E_CONFIG" },
      });
    }
    expect(await cli("check-updates", "--skill")).toMatchObject({
      code: 3,
      data: { code: "E_CONFIG" },
    });

    await symlink(path.join(root, "absent"), path.join(home, "skills", "broken"));
    const list = await cli("list");
    expect(list.code).toBe(3);
    expect(list.data.complete).toBe(false);
    expect(list.data.items.map((item: { name: string }) => item.name)).toEqual(["alpha", "beta"]);
    expect(list.data.issues[0]).toMatchObject({ phase: "scan", code: "E_PATH" });
    expect(await readFile(path.join(home, "catalog.json"), "utf8")).toBe("broken catalog sentinel");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
