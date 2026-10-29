import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { Client } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const { fetch } = globalThis;
const { AbortSignal } = globalThis;

async function toolJson(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true);
  assert.equal(result.content[0]?.type, "text");
  return JSON.parse(result.content[0].text);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--registry")) {
    throw new Error("Usage: pnpm check:npm [--registry <tested-acceptance.json>]");
  }
  let report;
  if (args.length) {
    report = JSON.parse(await readFile(path.resolve(args[1]), "utf8"));
    assert.equal(report.ok, true);
  } else {
    const packed = await exec(process.execPath, [path.join(repo, "scripts/pack-npm.mjs")], {
      cwd: repo,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    report = JSON.parse(packed.stdout);
  }
  const candidateRoot = path.dirname(report.tarball);
  const root = args.length
    ? await mkdtemp(path.join(repo, "outputs/npm-registry-"))
    : candidateRoot;
  let installSpec = report.tarball;
  if (args.length) {
    const url = new URL(
      `https://registry.npmjs.org/${encodeURIComponent(report.name)}/${report.version}`,
    );
    let response;
    for (let attempt = 0; attempt < 12; attempt++) {
      url.searchParams.set("release_check", `${Date.now()}-${attempt}`);
      response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (response.status !== 404 || attempt === 11) break;
      await delay(15_000);
    }
    if (!response.ok) throw new Error(`Registry metadata lookup failed: HTTP ${response.status}`);
    const metadata = await response.json();
    assert.equal(metadata.name, report.name);
    assert.equal(metadata.version, report.version);
    assert.equal(metadata.dist.integrity, report.integrity);
    await writeFile(
      path.join(root, "registry-metadata.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    const download = new URL(metadata.dist.tarball);
    assert.equal(download.origin, "https://registry.npmjs.org");
    const archiveResponse = await fetch(download, { signal: AbortSignal.timeout(30_000) });
    if (!archiveResponse.ok)
      throw new Error(`Registry tarball download failed: HTTP ${archiveResponse.status}`);
    const archive = new Uint8Array(await archiveResponse.arrayBuffer());
    assert.equal(
      `sha512-${createHash("sha512").update(archive).digest("base64")}`,
      report.integrity,
    );
    installSpec = path.join(root, path.basename(download.pathname));
    await writeFile(installSpec, archive);
    report = {
      ...report,
      published: true,
      registry: "https://registry.npmjs.org/",
      installSpec: `${report.name}@${report.version}`,
      registryTarball: download.href,
    };
    checks.push("live registry name/version/integrity match the exact tested tarball");
  }
  const contents = JSON.parse(await readFile(path.join(candidateRoot, "pack-report.json"), "utf8"));
  for (const file of contents.files) {
    assert.match(
      file.path,
      /^(?:package\.json|README\.md|LICENSE|NOTICE\.md|scripts\/opencode-hub\.mjs|configs\/[^.].*|apps\/(?:cli|mcp-server|web)\/dist\/.*\.js|apps\/web\/public\/.*|packages\/(?:core|router|shared|sync)\/dist\/.*\.js)$/,
    );
    assert.doesNotMatch(
      file.path,
      /(?:^|\/)(?:node_modules|src|tests|outputs|\.env)(?:\/|$)|\.test\.|\.map$|\.tsbuildinfo$/,
    );
  }
  const stageManifest = JSON.parse(
    await readFile(path.join(candidateRoot, "package/package.json"), "utf8"),
  );
  assert.equal(stageManifest.scripts, undefined);
  assert.notEqual(stageManifest.private, true);
  assert.deepEqual(Object.keys(stageManifest.dependencies), ["@modelcontextprotocol/sdk"]);
  assert.ok(!JSON.stringify(stageManifest).includes("workspace:"));
  checks.push("packed file allowlist, no install hooks or workspace registry dependencies");

  const trial = path.join(root, "install");
  const work = path.join(root, "empty-workdir");
  await mkdir(work);
  const userconfig = path.join(root, "empty.npmrc");
  await writeFile(userconfig, "");
  const env = {
    ...process.env,
    SKILL_HUB_HOME: path.join(root, "hub"),
    SKILL_HUB_CONFIG: "",
    SKILL_HUB_USAGE_LOG: "",
    SKILL_HUB_PROFILES_DIR: "",
    TYPESAFE_API_KEY: "",
  };
  for (const key of Object.keys(env)) {
    if (/^(?:npm_config_|npm_token$|node_auth_token$)/i.test(key)) delete env[key];
  }
  await exec(
    "npm",
    [
      "install",
      "--prefix",
      trial,
      installSpec,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--registry=https://registry.npmjs.org/",
      "--cache",
      path.join(root, "npm-cache"),
      "--userconfig",
      userconfig,
    ],
    {
      cwd: work,
      env,
      timeout: 180_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const installed = path.join(trial, "node_modules", report.name);
  const installedManifest = JSON.parse(
    await readFile(path.join(installed, "package.json"), "utf8"),
  );
  assert.equal(installedManifest.version, report.version);
  assert.deepEqual(Object.keys(installedManifest.bin), [
    "skill-hub",
    "skill-hub-mcp",
    "skill-hub-web",
    "skill-hub-opencode",
  ]);
  assert.deepEqual(installedManifest.bin, {
    "skill-hub": "apps/cli/dist/index.js",
    "skill-hub-mcp": "apps/mcp-server/dist/index.js",
    "skill-hub-web": "apps/web/dist/index.js",
    "skill-hub-opencode": "scripts/opencode-hub.mjs",
  });
  assert.ok(!contents.files.some((file) => file.path === "apps/mcp-server/dist/http.js"));
  assert.ok(!JSON.stringify(installedManifest).includes("skill-hub-mcp-http"));
  const bin = (name) => path.join(trial, "node_modules/.bin", name);
  const cli = async (...args) =>
    JSON.parse(
      (
        await exec(process.execPath, [bin("skill-hub"), ...args, "--json"], {
          cwd: work,
          env,
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024,
        })
      ).stdout,
    );
  assert.equal((await cli("version")).version, report.version);
  const npmExec = await exec(
    "npm",
    [
      "exec",
      "--offline",
      "--prefix",
      trial,
      "--userconfig",
      userconfig,
      "--cache",
      path.join(root, "npm-cache"),
      "--",
      "skill-hub",
      "version",
      "--json",
    ],
    {
      cwd: work,
      env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(JSON.parse(npmExec.stdout).version, report.version);
  await cli("init");
  const config = await readFile(path.join(env.SKILL_HUB_HOME, "config.yaml"), "utf8");
  for (const agent of ["workbuddy", "claude-code", "codex", "agents", "cursor"])
    assert.ok(config.includes(`id: ${agent}`));
  const source = path.join(root, "source", "npm-typescript-fixture");
  await mkdir(path.join(source, "references"), { recursive: true });
  const text =
    "---\nname: npm-typescript-fixture\ndescription: TypeScript coding npm transport fixture\n---\n" +
    "Synthetic body. ".repeat(700);
  await writeFile(path.join(source, "SKILL.md"), text);
  await writeFile(path.join(source, "references/proof.txt"), "npm attachment proof");
  await cli("install", source, "--apply", "--yes");
  const routed = await cli(
    "route",
    "TypeScript coding npm transport fixture",
    "--profile",
    "coding",
  );
  assert.equal(routed.results[0]?.name, "npm-typescript-fixture");
  assert.equal(routed.profile, "coding");
  assert.equal(
    (await cli("read", "npm-typescript-fixture", "--file", "references/proof.txt")).body,
    "npm attachment proof",
  );
  checks.push(
    "tarball installs in isolated prefix; CLI/npm exec/version/init/templates/profile/install/route/attachment",
  );

  const stdio = new Client({ name: "npm-stdio-acceptance", version: "1" });
  try {
    await stdio.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [bin("skill-hub-mcp")],
        env: {
          ...env,
          SKILL_HUB_MCP_MODE: "runtime",
          SKILL_HUB_MCP_NO_START: "",
          SKILL_HUB_MCP_FORCE_START: "",
        },
        stderr: "pipe",
      }),
    );
    assert.equal((await stdio.listTools()).tools.length, 3);
    const first = await toolJson(stdio, "skill_read", { name: "npm-typescript-fixture" });
    assert.equal(first.body.length, 8000);
    const next = await toolJson(stdio, "skill_read", {
      name: "npm-typescript-fixture",
      offset: first.nextOffset,
    });
    assert.equal(first.body + next.body, text);
    assert.equal(first.hash, `sha256:${createHash("sha256").update(text).digest("hex")}`);
  } finally {
    await stdio.close();
  }
  checks.push("installed stdio binary: real SDK handshake/list/paging/hash");

  const fakeNative = path.join(root, "fake-opencode.mjs");
  await writeFile(
    fakeNative,
    `#!/usr/bin/env node\nimport process from "node:process";\nconst config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT);\nconsole.log(JSON.stringify({ config, args: process.argv.slice(2) }));\n`,
  );
  await chmod(fakeNative, 0o755);
  const openCodeHome = path.join(root, "opencode-home");
  const openCodeXdg = path.join(root, "opencode-xdg");
  await mkdir(openCodeHome);
  await mkdir(openCodeXdg);
  const profileDir = path.join(root, "profiles");
  const configPath = path.join(root, "hub-config.yaml");
  const usageLog = path.join(root, "usage.jsonl");
  const opencode = JSON.parse(
    (
      await exec(
        process.execPath,
        [bin("skill-hub-opencode"), "--mcp-mode", "runtime", "debug", "agent", "build"],
        {
          cwd: work,
          env: {
            ...env,
            HOME: openCodeHome,
            XDG_CONFIG_HOME: openCodeXdg,
            OPENCODE_NATIVE_BIN: fakeNative,
            SKILL_HUB_HOME: path.join(root, "opencode-hub"),
            SKILL_HUB_CONFIG: configPath,
            SKILL_HUB_PROFILES_DIR: profileDir,
            SKILL_HUB_USAGE_LOG: usageLog,
            OPENAI_API_KEY: "acceptance-provider-secret",
          },
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        },
      )
    ).stdout,
  );
  const openCodeConfig = opencode.config;
  const openCodeMcp = openCodeConfig.mcp["skill-hub"];
  const installedMcp = path.join(installed, "apps/mcp-server/dist/index.js");
  assert.deepEqual(opencode.args, ["debug", "agent", "build"]);
  assert.equal(openCodeConfig.tools.skill, false);
  assert.equal(openCodeConfig.permission.skill, "deny");
  assert.deepEqual(openCodeConfig.provider, {});
  assert.deepEqual(openCodeMcp.command, [process.execPath, installedMcp]);
  assert.ok((await readFile(openCodeMcp.command[1], "utf8")).length > 0);
  assert.notEqual(openCodeMcp.command[1], path.join(repo, "apps/mcp-server/dist/index.js"));
  assert.deepEqual(openCodeMcp.environment, {
    SKILL_HUB_HOME: path.join(root, "opencode-hub"),
    SKILL_HUB_PROFILES_DIR: profileDir,
    SKILL_HUB_MCP_MODE: "runtime",
    SKILL_HUB_CONFIG: configPath,
    SKILL_HUB_USAGE_LOG: usageLog,
  });
  assert.ok(!JSON.stringify(openCodeConfig).includes("acceptance-provider-secret"));
  assert.ok(!JSON.stringify(openCodeConfig).includes(openCodeXdg));
  checks.push(
    "installed OpenCode bin: bundled MCP path and Hub/profile/usage settings verified with isolated fake native binary; no provider file or model call",
  );

  // Test the installed Web factory and actual shipped static assets without leaving a server running.
  const webResult = await exec(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    const { createWebServer } = await import(${JSON.stringify(path.join(installed, "apps/web/dist/index.js"))});
    const server = createWebServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const response = await fetch('http://127.0.0.1:' + server.address().port + '/');
    const body = await response.text();
    if (response.status !== 200 || !body.includes('<html')) throw new Error('Missing installed Web assets');
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  `,
    ],
    {
      cwd: work,
      env: { ...env, SKILL_HUB_WEB_NO_START: "1" },
      timeout: 15_000,
      maxBuffer: 1024 * 1024,
    },
  );
  assert.equal(webResult.stdout, "");
  checks.push("installed Web module serves shipped HTML assets");
  checks.push("package exposes CLI, stdio MCP, Web, and OpenCode bins; HTTP MCP is excluded");
  const acceptance = { ok: true, ...report, checks, personalHubTouched: false, paidModelCalls: 0 };
  await writeFile(path.join(root, "acceptance.json"), JSON.stringify(acceptance, null, 2) + "\n");
  console.log(JSON.stringify(acceptance, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
