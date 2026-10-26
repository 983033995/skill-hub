import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import { promisify } from "node:util";
import { Client } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";
import { StreamableHTTPClientTransport } from "../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
const { fetch } = globalThis;

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
    const { stdout } = await exec(
      "npm",
      [
        "view",
        `${report.name}@${report.version}`,
        "--json",
        "--registry=https://registry.npmjs.org/",
      ],
      {
        cwd: root,
        timeout: 30_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const metadata = JSON.parse(stdout);
    assert.equal(metadata.name, report.name);
    assert.equal(metadata.version, report.version);
    assert.equal(metadata.dist.integrity, report.integrity);
    await writeFile(
      path.join(root, "registry-metadata.json"),
      JSON.stringify(metadata, null, 2) + "\n",
    );
    installSpec = `${report.name}@${report.version}`;
    report = { ...report, published: true, registry: "https://registry.npmjs.org/", installSpec };
    checks.push("live registry name/version/integrity match the exact tested tarball");
  }
  const contents = JSON.parse(await readFile(path.join(candidateRoot, "pack-report.json"), "utf8"));
  for (const file of contents.files) {
    assert.match(
      file.path,
      /^(?:package\.json|README\.md|LICENSE|NOTICE\.md|configs\/[^.].*|apps\/(?:cli|mcp-server|web)\/dist\/.*\.js|apps\/web\/public\/.*|packages\/(?:core|router|shared|sync)\/dist\/.*\.js)$/,
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

  const token = randomBytes(32).toString("hex");
  const httpEnv = {
    ...env,
    SKILL_HUB_HTTP_TOKEN: token,
    SKILL_HUB_HTTP_HOST: "127.0.0.1",
    SKILL_HUB_HTTP_PORT: "0",
  };
  delete httpEnv.SKILL_HUB_HTTP_ALLOWED_HOSTS;
  delete httpEnv.SKILL_HUB_HTTP_ALLOWED_ORIGINS;
  const child = spawn(process.execPath, [bin("skill-hub-mcp-http")], {
    cwd: work,
    env: httpEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  const http = new Client({ name: "npm-http-acceptance", version: "1" });
  try {
    let diagnostics = "";
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Installed HTTP startup timed out")), 5000);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Installed HTTP exited before listening"));
      });
      child.stderr.on("data", (chunk) => {
        diagnostics += chunk;
        const match = diagnostics.match(/listening on 127\.0\.0\.1:(\d+)\/mcp/);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${match[1]}/mcp`);
        }
      });
    });
    await http.connect(
      new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    assert.equal((await http.listTools()).tools.length, 3);
    assert.equal(
      (
        await toolJson(http, "skill_read", {
          name: "npm-typescript-fixture",
          file: "references/proof.txt",
        })
      ).body,
      "npm attachment proof",
    );
    assert.equal((await fetch(endpoint)).status, 401);
    assert.ok(!diagnostics.includes(token));
    checks.push(
      "installed HTTP symlink binary: authenticated real SDK calls, unauthorized rejection",
    );
  } finally {
    await http.close();
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    assert.deepEqual(await exited, [0, null]);
  }

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
  const acceptance = { ok: true, ...report, checks, personalHubTouched: false, paidModelCalls: 0 };
  await writeFile(path.join(root, "acceptance.json"), JSON.stringify(acceptance, null, 2) + "\n");
  console.log(JSON.stringify(acceptance, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
