import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { hashSkillTree } from "@skill-hub/core";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

it("compiled migration validates explicit parameters, previews without writes and records reversible provenance", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-migrate-cli-"));
  try {
    const home = path.join(root, "hub");
    const source = path.join(root, "old");
    const next = path.join(root, "next");
    await mkdir(home);
    await mkdir(source);
    await writeFile(
      path.join(home, "config.yaml"),
      `version: 1\ncanonical_dir: ${home}/skills\nindex_dir: ${home}/index\nbackup_dir: ${home}/backups\nagents:\n  - id: synthetic\n    skills_dir: ${root}/agent\n    enabled: true\n`,
    );
    await writeFile(
      path.join(source, "SKILL.md"),
      "---\nname: alpha\ndescription: Synthetic migration\n---\nbody\n",
    );
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
    await rename(source, next);
    const before = await hashSkillTree(home);
    for (const args of [
      [],
      ["alpha"],
      ["alpha", "beta", "--source", next],
      ["alpha", "--source", next, "--ref"],
      ["alpha", "--source", next, "--force"],
      ["alpha", "--source", next, "--apply", "--yes"],
    ]) {
      expect(await cli("migrate-source", ...args)).toMatchObject({
        code: 3,
        data: { code: "E_CONFIG" },
      });
    }
    const preview = await cli("migrate-source", "alpha", "--source", next);
    expect(preview).toMatchObject({
      code: 0,
      data: {
        dryRun: true,
        indexUpdated: false,
        items: [{ action: "migrate-source", changes: [], sourceLockChanged: true }],
      },
    });
    expect(preview.data.next).toContain("--plan-token");
    expect(
      await cli(
        "migrate-source",
        "alpha",
        "--source",
        next,
        "--plan-token",
        preview.data.planToken,
        "--apply",
      ),
    ).toMatchObject({ code: 3, data: { code: "E_CONFIG" } });
    expect(await hashSkillTree(home)).toBe(before);
    const applied = await cli(
      "migrate-source",
      "alpha",
      "--source",
      next,
      "--plan-token",
      preview.data.planToken,
      "--apply",
      "--yes",
    );
    expect(applied).toMatchObject({
      code: 0,
      data: { indexUpdated: true, items: [{ status: "applied", backupPath: expect.any(String) }] },
    });
    const catalog = JSON.parse(await readFile(path.join(home, "catalog.json"), "utf8"));
    expect(catalog.skills.alpha.provenance.sourceRef).toBe(applied.data.items[0].nextSource.path);
    expect(await readFile(path.join(home, "history.jsonl"), "utf8")).toContain(
      '"action":"migrate-source"',
    );
    expect((await cli("check-updates", "alpha")).data.items[0].upstreamStatus).toBe("unchanged");
    expect(
      (
        await cli(
          "rollback",
          "alpha",
          "--from",
          applied.data.items[0].backupPath,
          "--apply",
          "--yes",
        )
      ).code,
    ).toBe(0);
    expect((await cli("check-updates", "alpha")).data.items[0].upstreamStatus).toBe("unknown");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
