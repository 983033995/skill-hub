import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(path.join(tmpdir(), "skill-hub-public-smoke-"));
const hub = path.join(root, "hub");
const source = path.join(root, "source", "smoke-skill");
const target = path.join(root, "agent", "skills");
const env = {
  ...process.env,
  SKILL_HUB_HOME: hub,
  SKILL_HUB_CONFIG: "",
  TYPESAFE_API_KEY: "",
};
const cli = async (...args) => {
  const result = await exec(
    process.execPath,
    [path.join(repo, "apps/cli/dist/index.js"), ...args, "--json"],
    { cwd: repo, env, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(result.stdout);
};
const checks = [];
try {
  await cli("init");
  assert.ok(
    (await readFile(path.join(hub, "config.yaml"), "utf8")).includes(path.join(hub, "skills")),
  );
  checks.push("init respects isolated state root");
  await mkdir(path.join(source, "references"), { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: smoke-skill\ndescription: Verify public sandbox sum and attachment reading\n---\nRead the reference through Hub.\n",
  );
  await writeFile(path.join(source, "references", "proof.txt"), "marker: fixture-v1\n");
  // Every sync target is synthetic. No command can inherit real agent mappings.
  await writeFile(
    path.join(hub, "config.yaml"),
    `version: 1\ncanonical_dir: ${hub}/skills\nindex_dir: ${hub}/index\nbackup_dir: ${hub}/backups\nagents:\n  - id: fixture\n    skills_dir: ${target}\n    enabled: true\nrouter:\n  engine: bm25\n  top_k: 5\nsync:\n  mode: symlink\n  conflict: report\n  require_backup: true\nprivacy:\n  telemetry: false\n`,
  );
  const preview = await cli("install", source);
  assert.equal(preview.dryRun, true);
  await assert.rejects(access(path.join(hub, "skills", "smoke-skill")));
  await cli("install", source, "--apply", "--yes");
  const routed = await cli("route", "public sandbox sum attachment", "--top-k", "3");
  assert.equal(routed.results[0]?.name, "smoke-skill");
  assert.equal(
    (await cli("read", "smoke-skill", "--file", "references/proof.txt")).body,
    "marker: fixture-v1\n",
  );
  assert.equal((await cli("audit", "smoke-skill")).failed_by_policy, false);
  checks.push("preview/install/index/route/attachment/audit");
  const backup = await cli("backup");
  await cli("sync", "--dry-run", "--agents", "fixture");
  await cli(
    "sync",
    "--apply",
    "--yes",
    "--allow-write",
    "--backup-dir",
    backup.backupDir,
    "--agents",
    "fixture",
  );
  assert.equal((await cli("verify")).ok, true);
  await writeFile(path.join(source, "references", "proof.txt"), "marker: fixture-v2\n");
  await cli("update", "smoke-skill", "--apply", "--yes");
  assert.equal(
    await readFile(path.join(target, "smoke-skill", "references", "proof.txt"), "utf8"),
    "marker: fixture-v2\n",
  );
  checks.push("backup/symlink/apply/verify/update visibility");
  const report = path.join(root, "mcp.json");
  await exec(process.execPath, [path.join(repo, "scripts/accept-runtime.mjs"), report], {
    cwd: repo,
    env,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const mcp = JSON.parse(await readFile(report, "utf8"));
  assert.equal(mcp.ok, true);
  assert.equal(mcp.catalogCount, 1);
  assert.ok(mcp.tools.includes("skill_audit"));
  checks.push("built stdio MCP pagination/hash/error guards");
  console.log(
    JSON.stringify(
      { ok: true, syntheticSkills: 1, checks, personalHubTouched: false, paidModelCalls: 0 },
      null,
      2,
    ),
  );
} finally {
  // This directory was created exclusively by this invocation, never supplied by users.
  await rm(root, { recursive: true, force: true });
}
