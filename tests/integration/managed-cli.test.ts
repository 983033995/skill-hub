import { mkdtemp, mkdir, writeFile, readFile, readdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runManage } from "../../apps/cli/src/commands/manage.js";
import { runSync } from "../../apps/cli/src/commands/sync.js";
import { runIndex } from "../../apps/cli/src/commands/index-cmd.js";
import { parseArgs } from "../../apps/cli/src/args.js";
import { readCatalog, loadHubConfig, catalogToSkillMetas } from "@skill-hub/core";
import { createBackup, verifySync } from "@skill-hub/sync";
import { createBm25Router } from "@skill-hub/router";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("CLI install → catalog/index → backup → sync → update preserves source and Agent visibility", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-managed-cli-"));
  const home = path.join(root, "hub");
  const canonical = path.join(root, "custom-skills");
  const indexDir = path.join(root, "custom-index");
  const source = path.join(root, "source");
  const configPath = path.join(root, "config.yaml");
  const agent = path.join(root, "agent");
  vi.stubEnv("SKILL_HUB_HOME", home);
  vi.spyOn(console, "log").mockImplementation(() => {});
  await mkdir(source);
  await writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: alpha\ndescription: pdf merging tool\n---\nbody",
  );
  await writeFile(path.join(source, "script"), "old");
  await writeFile(
    configPath,
    `version: 1\ncanonical_dir: ${canonical}\nindex_dir: ${indexDir}\nbackup_dir: ${root}/backups\nagents:\n  - id: fixture\n    skills_dir: ${agent}\n    enabled: true\nsync:\n  mode: symlink\n  require_backup: true\n`,
  );
  const options = {
    action: "install" as const,
    source,
    json: true,
    configPath,
    apply: false,
    yes: false,
    dryRun: false,
  };
  expect(await runManage(options)).toBe(0);
  await expect(readdir(home)).rejects.toThrow();
  await expect(runManage({ ...options, apply: true })).rejects.toThrow("--apply --yes");
  expect(await runManage({ ...options, apply: true, yes: true })).toBe(0);
  const catalog = await readCatalog(path.join(home, "catalog.json"));
  expect(catalog.skills.alpha?.path).toBe(path.join(await realpath(canonical), "alpha"));
  const engine = createBm25Router();
  await engine.build(catalogToSkillMetas(catalog));
  expect(await readFile(path.join(indexDir, "bm25.json"), "utf8")).toContain("alpha");
  const config = await loadHubConfig(configPath);
  const backup = await createBackup(config, { includeCanonical: true });
  const syncOptions = {
    json: true,
    apply: true,
    dryRun: false,
    requireBackup: true,
    yes: true,
    allowWrite: true,
    backupDir: backup.backupDir,
    configPath,
    createOnly: true,
    replaceReal: false,
  };
  expect(await runSync(syncOptions)).toBe(0);
  expect((await verifySync(config, catalogToSkillMetas(catalog))).ok).toBe(true);
  await writeFile(path.join(source, "script"), "new");
  expect(
    await runManage({ ...options, action: "update", source: undefined, apply: true, yes: true }),
  ).toBe(0);
  expect(await readFile(path.join(agent, "alpha/script"), "utf8")).toBe("new");
  await runIndex({ json: true, rebuild: true, configPath });
  const rebuilt = await readCatalog(path.join(home, "catalog.json"));
  expect(rebuilt.skills.alpha?.provenance?.sourceRef).toBe(await realpath(source));
  // 坏配置/catalog 不能降级为默认真实 Agent 路径或空库。
  await writeFile(path.join(home, "catalog.json"), "bad-json");
  await expect(runSync(syncOptions)).rejects.toThrow();
  await expect(loadHubConfig(path.join(root, "missing-config"))).rejects.toThrow();
});
it("boolean flags do not consume command/source positionals", () => {
  const args = parseArgs(["--dry-run", "install", "owner/repo", "--skill", "alpha", "--yes"]);
  expect(args.command).toBe("install");
  expect(args.positionals).toEqual(["owner/repo"]);
  expect(args.flags["dry-run"]).toBe(true);
  expect(args.flags.skill).toBe("alpha");
  expect(parseArgs(["install", "--help"]).command).toBe("help");
});
