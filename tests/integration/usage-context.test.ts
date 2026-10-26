import { execFile } from "node:child_process";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import {
  buildCatalog,
  scanSkills,
  writeCatalog,
  readUsageReport,
  estimateContext,
  hashSkillTree,
} from "@skill-hub/core";
import {
  skillRead,
  skillFetch,
  skillSearch,
  skillContextCost,
  withUsageScope,
} from "@skill-hub/router";
import { Client } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";

const roots: string[] = [];
const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function workspace() {
  const home = await mkdtemp(path.join(tmpdir(), "hub-usage-context-"));
  roots.push(home);
  const skill = path.join(home, "skills", "alpha");
  await mkdir(skill, { recursive: true });
  const body =
    "---\nname: alpha\ndescription: Synthetic multilingual skill\n---\n私密正文🙂 private-body\n";
  await writeFile(path.join(skill, "SKILL.md"), body);
  await writeFile(path.join(skill, "private-attachment.md"), "private-attachment-body");
  const catalogPath = path.join(home, "catalog.json");
  await writeCatalog(catalogPath, buildCatalog(await scanSkills(path.join(home, "skills"))));
  await writeFile(
    path.join(home, "config.yaml"),
    `version: 1\ncanonical_dir: ${home}/skills\nindex_dir: ${home}/index\nbackup_dir: ${home}/backups\nagents: []\nrouter:\n  engine: bm25\n`,
  );
  vi.stubEnv("SKILL_HUB_HOME", home);
  vi.stubEnv("SKILL_HUB_CONFIG", "");
  vi.stubEnv("SKILL_HUB_USAGE_LOG", "");
  return { home, skill, body, catalogPath, file: path.join(home, "usage.jsonl") };
}

it("records only opt-in calls, separates phases/interfaces and does not leak text or double-count fetch", async () => {
  const ws = await workspace();
  const before = await hashSkillTree(ws.home);
  await skillRead({ name: "alpha" });
  expect(await hashSkillTree(ws.home)).toBe(before);
  expect((await readUsageReport({ file: ws.file })).exists).toBe(false);
  vi.stubEnv("SKILL_HUB_USAGE_LOG", ws.file);
  await withUsageScope("mcp", async () => {
    await skillSearch({ query: "private-query Synthetic multilingual" });
    await skillRead({ name: "alpha", maxChars: 8 });
    await skillRead({ name: "alpha", offset: 8, maxChars: 4 });
    await skillFetch({ name: "alpha" });
    await skillRead({ name: "alpha", file: "private-attachment.md" });
    await expect(skillRead({ name: "alpha", file: "../secret" })).rejects.toMatchObject({
      code: "E_PATH",
    });
  });
  const report = await readUsageReport({ file: ws.file });
  expect(report).toMatchObject({ complete: true, searchCalls: 1, readCalls: 5, errors: 1 });
  expect(report.skills[0]).toMatchObject({
    origin: "mcp",
    initialBodyReads: 2,
    continuationBodyReads: 1,
    attachmentReads: 1,
    appearances: 1,
    errors: 1,
  });
  const log = await readFile(ws.file, "utf8");
  for (const privateText of [
    ws.home,
    "private-query",
    "Synthetic multilingual",
    "私密正文",
    "private-body",
    "private-attachment",
  ])
    expect(log).not.toContain(privateText);
  const cost = await skillContextCost({ contextWindow: 1000, maxChars: 8 });
  expect(cost).toMatchObject({
    complete: true,
    actualModelTokens: null,
    items: [
      { fullBody: estimateContext(ws.body), initialPage: estimateContext(ws.body.slice(0, 8)) },
    ],
  });
  expect(await readFile(ws.file, "utf8")).toBe(log);
});

it("keeps reads successful on log failure and reports partial static costs without hiding healthy metadata", async () => {
  const ws = await workspace();
  vi.stubEnv("SKILL_HUB_USAGE_LOG", "invalid-relative.jsonl");
  const warning = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect((await skillRead({ name: "alpha" })).body).toBe(ws.body);
  expect(warning).toHaveBeenCalledWith(expect.stringContaining("E_USAGE_WRITE"));
  expect(JSON.stringify(warning.mock.calls)).not.toContain(ws.home);
  await rm(path.join(ws.skill, "SKILL.md"));
  const cost = await skillContextCost();
  expect(cost).toMatchObject({
    complete: false,
    items: [{ name: "alpha", fullBody: null, initialPage: null, errorCode: "E_PATH" }],
  });
  for (const input of [{ maxChars: 0 }, { contextWindow: 0 }, { maxChars: NaN }])
    await expect(skillContextCost(input)).rejects.toMatchObject({ code: "E_CONFIG" });
});

it("actual MCP and HTTP entrypoints keep Web browsing separate while runtime still has three tools", async () => {
  const ws = await workspace();
  vi.stubEnv("SKILL_HUB_USAGE_LOG", ws.file);
  vi.stubEnv("SKILL_HUB_MCP_NO_START", "1");
  vi.stubEnv("SKILL_HUB_WEB_NO_START", "1");
  const { createSkillHubMcpServer } = await import("../../apps/mcp-server/src/index.js");
  const { createWebServer } = await import("../../apps/web/src/index.js");
  const server = await createSkillHubMcpServer({ mode: "runtime" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "usage-test", version: "1" });
  const web = createWebServer();
  await server.connect(st);
  await client.connect(ct);
  await new Promise<void>((resolve) => web.listen(0, "127.0.0.1", resolve));
  try {
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "skill_search",
      "skill_files",
      "skill_read",
    ]);
    expect(
      (await client.callTool({ name: "skill_read", arguments: { name: "alpha" } })).isError,
    ).not.toBe(true);
    const address = web.address() as { port: number };
    expect((await fetch(`http://127.0.0.1:${address.port}/api/skills/alpha/read`)).ok).toBe(true);
    const report = await readUsageReport({ file: ws.file });
    expect(report.skills).toMatchObject([
      { origin: "mcp", initialBodyReads: 1 },
      { origin: "web", initialBodyReads: 1 },
    ]);
  } finally {
    await client.close();
    await server.close();
    await new Promise<void>((resolve, reject) => web.close((e) => (e ? reject(e) : resolve())));
  }
});

it("estimates full large text through existing guards, excludes attachments and flags catalog-free scans as incomplete", async () => {
  const ws = await workspace();
  vi.stubEnv("SKILL_HUB_USAGE_LOG", ws.file);
  const large = ws.body + "中文🙂abcd\n".repeat(20000);
  await writeFile(path.join(ws.skill, "SKILL.md"), large);
  const report = await skillContextCost({ maxChars: 8000 });
  expect(report).toMatchObject({
    complete: true,
    items: [
      { fullBody: estimateContext(large), initialPage: estimateContext(large.slice(0, 8000)) },
    ],
  });
  expect((await readUsageReport({ file: ws.file })).exists).toBe(false);
  await rm(ws.catalogPath);
  expect(await skillContextCost()).toMatchObject({
    complete: false,
    issues: [{ code: "E_INDEX" }],
  });
});

it("compiled CLI estimates and aggregates without recording inspections or inventing historical zero usage", async () => {
  const ws = await workspace();
  const env = {
    ...process.env,
    SKILL_HUB_HOME: ws.home,
    SKILL_HUB_USAGE_LOG: ws.file,
    TYPESAFE_API_KEY: "",
  };
  const cli = async (...args: string[]) => {
    try {
      const result = await exec(
        process.execPath,
        [path.join(repo, "apps/cli/dist/index.js"), ...args, "--json"],
        { env, cwd: repo, timeout: 30000 },
      );
      return { code: 0, data: JSON.parse(result.stdout) };
    } catch (error) {
      const result = error as { code: number; stdout: string };
      return { code: result.code, data: JSON.parse(result.stdout) };
    }
  };
  expect(await cli("usage")).toMatchObject({
    code: 0,
    data: { exists: false, recordedSince: null, recordingEnabled: true },
  });
  expect(await cli("read", "alpha", "--max-chars", "8")).toMatchObject({ code: 0 });
  const log = await readFile(ws.file, "utf8");
  expect(await cli("context-cost", "alpha", "--context-window", "128000")).toMatchObject({
    code: 0,
    data: { complete: true, contextWindow: 128000, actualModelTokens: null },
  });
  expect(await readFile(ws.file, "utf8")).toBe(log);
  expect(await cli("usage", "--days", "7", "--origin", "cli")).toMatchObject({
    code: 0,
    data: { readCalls: 1, skills: [{ origin: "cli", initialBodyReads: 1 }] },
  });
  for (const args of [
    ["usage", "--days", "0"],
    ["usage", "--days", "NaN"],
    ["usage", "--origin", "other"],
    ["context-cost", "--context-window", "0"],
    ["context-cost", "--apply"],
  ])
    expect((await cli(...args)).code).toBe(3);
  await appendFile(ws.file, "broken\n");
  expect(await cli("usage")).toMatchObject({ code: 3, data: { complete: false, readCalls: 1 } });
}, 15000);
