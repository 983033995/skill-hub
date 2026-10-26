import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { AbortSignal } = globalThis;

/** Publishing requires an explicit apply flag AND an official repository version-tag push. */
export function validateNpmRelease(manifest, env, publish) {
  assert.equal(manifest.name, "@zhangheteng/skill-hub", "Unexpected npm package");
  assert.match(
    manifest.version,
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Stable release version required",
  );
  if (!publish) return;
  assert.equal(env.GITHUB_ACTIONS, "true", "Publish only from GitHub Actions");
  assert.equal(env.GITHUB_REPOSITORY, "983033995/skill-hub", "Unexpected release repository");
  assert.equal(env.GITHUB_EVENT_NAME, "push", "Publish only on a tag push");
  assert.equal(env.GITHUB_REF, `refs/tags/v${manifest.version}`, "Tag must match package version");
  assert.ok(
    env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    "OIDC permission required",
  );
}

async function registryVersion(name, version) {
  // Bypass short-lived CDN negative caches immediately after a first publication.
  const url = new URL(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`);
  url.searchParams.set("release_check", String(Date.now()));
  const response = await globalThis.fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Registry lookup failed: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args[0] !== "--report" ||
    !args[1] ||
    (args.length !== 2 && !(args.length === 3 && args[2] === "--publish"))
  ) {
    throw new Error("Usage: node scripts/publish-npm.mjs --report <acceptance.json> [--publish]");
  }
  const publish = args[2] === "--publish";
  const manifest = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
  validateNpmRelease(manifest, process.env, publish);
  if (publish) {
    // A tag on an unmerged branch must not become a release even if a maintainer pushes it.
    await exec("git", ["merge-base", "--is-ancestor", "HEAD", "origin/main"], { cwd: repo });
  }
  const report = JSON.parse(await readFile(path.resolve(args[1]), "utf8"));
  assert.equal(report.ok, true, "Only an accepted tarball can be published");
  assert.equal(report.name, manifest.name);
  assert.equal(report.version, manifest.version);
  const tarball = path.resolve(report.tarball);
  assert.ok(
    tarball.startsWith(path.join(repo, "outputs") + path.sep),
    "Tarball must be a local build output",
  );
  assert.equal(
    `sha512-${createHash("sha512")
      .update(await readFile(tarball))
      .digest("base64")}`,
    report.integrity,
  );
  const existing = await registryVersion(report.name, report.version);
  if (existing)
    assert.equal(
      existing.dist.integrity,
      report.integrity,
      "Existing version has different bytes; bump the version",
    );
  if (!existing) {
    const command = [
      "publish",
      tarball,
      "--ignore-scripts",
      "--access=public",
      "--tag=latest",
      "--registry=https://registry.npmjs.org/",
    ];
    if (!publish) command.push("--dry-run");
    const result = await exec("npm", command, {
      cwd: repo,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    // npm prints public package metadata; never serialize the OIDC environment.
    console.log(result.stdout.trim());
  }
  const receipt = {
    name: report.name,
    version: report.version,
    integrity: report.integrity,
    sourceCommit: process.env.GITHUB_SHA ?? null,
    workflow: process.env.GITHUB_WORKFLOW ?? null,
    dryRun: !publish,
    alreadyPublished: Boolean(existing),
    published: publish,
    registryAcceptance: "Run check:npm --registry against the exact acceptance report",
  };
  await writeFile(
    path.join(repo, "outputs/npm-release-receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
  );
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
