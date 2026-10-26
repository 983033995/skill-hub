import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, scanSkills, writeCatalog } from "../packages/core/dist/index.js";

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
  SKILL_HUB_USAGE_LOG: "",
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
  assert.ok(!preview.next.includes("Hub 已更新"));
  await assert.rejects(access(path.join(hub, "skills", "smoke-skill")));
  await cli("install", source, "--apply", "--yes");
  const checked = await cli("check-updates", "smoke-skill");
  assert.equal(checked.complete, true);
  assert.equal(checked.dryRun, true);
  assert.equal(checked.indexUpdated, false);
  assert.equal(checked.items[0].localStatus, "clean");
  assert.equal(checked.items[0].upstreamStatus, "unchanged");
  assert.equal(checked.items[0].updateAvailable, false);
  checks.push("managed source update checks are read-only and distinguish unchanged content");
  const manifestPath = path.join(root, "available-skills.xml");
  const manifestPreview = await cli("manifest", "--out", manifestPath);
  assert.equal(manifestPreview.dryRun, true);
  await assert.rejects(access(manifestPath));
  const forcedDryRun = await cli(
    "manifest",
    "--out",
    manifestPath,
    "--apply",
    "--yes",
    "--dry-run",
  );
  assert.equal(forcedDryRun.dryRun, true);
  await assert.rejects(access(manifestPath));
  const manifestApply = await cli("manifest", "--out", manifestPath, "--apply", "--yes");
  assert.equal(manifestApply.dryRun, false);
  const manifest = await readFile(manifestPath, "utf8");
  assert.match(manifest, /<name>smoke-skill<\/name>/);
  assert.match(
    manifest,
    /<description>Verify public sandbox sum and attachment reading<\/description>/,
  );
  assert.doesNotMatch(manifest, /Read the reference through Hub/);
  checks.push("manifest dry-run and explicit atomic export");
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
  const updatePlan = await cli("update", "smoke-skill");
  assert.match(updatePlan.planToken, /^sha256:[0-9a-f]{64}$/);
  assert.ok(updatePlan.items[0].changes.some((change) => change.path === "references/proof.txt"));
  const updated = await cli(
    "update",
    "smoke-skill",
    "--plan-token",
    updatePlan.planToken,
    "--apply",
    "--yes",
  );
  assert.equal(
    await readFile(path.join(target, "smoke-skill", "references", "proof.txt"), "utf8"),
    "marker: fixture-v2\n",
  );
  const firstBackup = updated.items.find((item) => item.name === "smoke-skill")?.backupPath;
  assert.ok(firstBackup);
  const rollbackPreview = await cli("rollback", "smoke-skill", "--from", firstBackup);
  assert.equal(rollbackPreview.dryRun, true);
  assert.equal(
    await readFile(path.join(target, "smoke-skill", "references", "proof.txt"), "utf8"),
    "marker: fixture-v2\n",
  );
  const rolledBack = await cli(
    "rollback",
    "smoke-skill",
    "--from",
    firstBackup,
    "--apply",
    "--yes",
  );
  assert.equal(rolledBack.dryRun, false);
  assert.equal(rolledBack.items[0]?.action, "rollback");
  assert.equal(
    await readFile(path.join(target, "smoke-skill", "references", "proof.txt"), "utf8"),
    "marker: fixture-v1\n",
  );
  const currentBackup = rolledBack.items[0]?.backupPath;
  assert.ok(currentBackup);
  await cli("rollback", "smoke-skill", "--from", currentBackup, "--apply", "--yes");
  assert.equal(
    await readFile(path.join(target, "smoke-skill", "references", "proof.txt"), "utf8"),
    "marker: fixture-v2\n",
  );
  assert.equal((await cli("verify")).ok, true);
  checks.push("backup/symlink/apply/verify/update and reversible managed rollback");
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

  const evalDataset = JSON.parse(
    await readFile(path.join(repo, "evals/router/recall.v1.json"), "utf8"),
  );
  const evalSkillsRoot = path.join(root, "eval", "skills");
  const evalNames = [...new Set(evalDataset.cases.flatMap((task) => task.expectedAnyOf))];
  for (const name of evalNames) {
    const directory = path.join(evalSkillsRoot, name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "SKILL.md"),
      `---\nname: ${name}\ndescription: Synthetic offline router evaluation fixture for ${name}\n---\nNo source instructions are included.\n`,
      "utf8",
    );
  }
  const evalCatalogPath = path.join(root, "eval", "catalog.json");
  await writeCatalog(evalCatalogPath, buildCatalog(await scanSkills(evalSkillsRoot)));
  const evalReportPath = path.join(root, "eval", "report.json");
  await exec(
    process.execPath,
    [path.join(repo, "scripts/eval-router.mjs"), evalCatalogPath, evalReportPath],
    { cwd: repo, env, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
  );
  const evaluation = JSON.parse(await readFile(evalReportPath, "utf8"));
  assert.equal(evaluation.mode, "offline-bm25-only");
  assert.equal(evaluation.skillCount, evalNames.length);
  assert.equal(evaluation.catalogPath, undefined);
  assert.equal(evaluation.variants.length, 3);
  for (const variant of evaluation.variants) {
    assert.ok(Number.isFinite(variant.metrics.queryLatencyMs.p50));
    assert.ok(Number.isFinite(variant.metrics.queryLatencyMs.p95));
    assert.ok(Number.isFinite(variant.metrics.indexBuildLatencyMs));
    assert.equal(variant.metrics.modelCalls, 0);
    assert.equal(variant.metrics.measuredCostUsd, null);
    assert.equal(variant.metrics.escalationRate, null);
  }
  checks.push("offline router evaluation with explicit synthetic catalog and latency/usage schema");
  await assert.rejects(
    exec(process.execPath, [path.join(repo, "scripts/eval-router-jev.mjs")], {
      cwd: repo,
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    }),
    (error) => error.code === 2 && error.stderr.includes("--confirm-paid-requests"),
  );
  await assert.rejects(
    exec(
      process.execPath,
      [
        path.join(repo, "scripts/eval-router-jev.mjs"),
        "--catalog",
        evalCatalogPath,
        "--model",
        "jev-latest",
        "--max-requests",
        "1",
        "--confirm-paid-requests",
        "--confirm-skill-metadata-upload",
      ],
      { cwd: repo, env, timeout: 30_000, maxBuffer: 1024 * 1024 },
    ),
    (error) => error.code === 2 && error.stderr.includes("TYPESAFE_API_KEY is not configured"),
  );
  await assert.rejects(
    exec(
      process.execPath,
      [
        path.join(repo, "scripts/eval-router-jev.mjs"),
        "--catalog",
        path.join(hub, "catalog.json"),
        "--model",
        "jev-latest",
        "--max-requests",
        "1",
        "--confirm-paid-requests",
        "--confirm-skill-metadata-upload",
      ],
      { cwd: repo, env, timeout: 30_000, maxBuffer: 1024 * 1024 },
    ),
    (error) =>
      error.code === 2 &&
      error.stderr.includes("E_EVAL_CATALOG_LABELS") &&
      !error.stderr.includes("TYPESAFE_API_KEY is not configured"),
  );
  checks.push("live Jev evaluation validates explicit catalog labels before key/network access");

  const forkSource = path.join(root, "source", "smoke-overlay");
  await mkdir(forkSource, { recursive: true });
  await writeFile(
    path.join(forkSource, "SKILL.md"),
    "---\nname: smoke-overlay\ndescription: Project fork of the smoke skill\n---\nOverlay instructions v1.\n",
    "utf8",
  );
  const forkPreview = await cli("install", forkSource, "--overlay-of", "smoke-skill");
  assert.equal(forkPreview.dryRun, true);
  assert.equal(forkPreview.skills[0]?.provenance?.overlayOf, "smoke-skill");
  await assert.rejects(access(path.join(hub, "skills", "smoke-overlay")));
  await assert.rejects(cli("install", forkSource, "--overlay-of", "missing-base"));
  const forked = await cli(
    "install",
    forkSource,
    "--overlay-of",
    "smoke-skill",
    "--apply",
    "--yes",
  );
  assert.equal(forked.skills[0]?.provenance?.overlayOf, "smoke-skill");
  const lock = JSON.parse(await readFile(path.join(hub, "managed-lock.json"), "utf8"));
  assert.equal(lock.skills["smoke-overlay"].overlayOf, "smoke-skill");
  const overlayHistory = (await readFile(path.join(hub, "history.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.ok(
    overlayHistory.some((event) => event.type === "overlay" && event.name === "smoke-overlay"),
  );
  await writeFile(
    path.join(forkSource, "SKILL.md"),
    "---\nname: smoke-overlay\ndescription: Project fork of the smoke skill\n---\nOverlay instructions v2.\n",
    "utf8",
  );
  const forkPlan = await cli("update", "smoke-overlay");
  const forkUpdate = await cli(
    "update",
    "smoke-overlay",
    "--plan-token",
    forkPlan.planToken,
    "--apply",
    "--yes",
  );
  assert.equal(forkUpdate.skills[0]?.provenance?.overlayOf, "smoke-skill");
  checks.push("fork install pins overlay provenance through update");
  console.log(
    JSON.stringify(
      { ok: true, syntheticSkills: 2, checks, personalHubTouched: false, paidModelCalls: 0 },
      null,
      2,
    ),
  );
} finally {
  // This directory was created exclusively by this invocation, never supplied by users.
  await rm(root, { recursive: true, force: true });
}
