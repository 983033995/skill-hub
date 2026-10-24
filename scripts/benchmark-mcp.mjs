/** Offline protocol-size benchmark. Bytes are not model token counts or billed usage. */
import assert from "node:assert/strict";
import console from "node:console";
import process from "node:process";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, parseSkillMd, writeCatalog } from "../packages/core/dist/index.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "apps/mcp-server/package.json"));
const { Client } = await import(require.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(
  require.resolve("@modelcontextprotocol/sdk/client/stdio.js")
);
const root = await mkdtemp(path.join(tmpdir(), "skill-hub-mcp-size-"));
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");
const measurements = [];

try {
  const metas = [];
  for (let i = 0; i < 1000; i++) {
    const dir = path.join(root, "skills", `fixture-${i}`);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, "SKILL.md");
    await writeFile(
      file,
      `---\nname: fixture-${i}\ndescription: Synthetic arithmetic verification workflow ${i}\n---\nRead only what the current task requires.\n`,
    );
    metas.push(await parseSkillMd(file));
  }
  for (const count of [10, 100, 1000]) {
    const catalogPath = path.join(root, "catalog.json");
    await writeCatalog(catalogPath, buildCatalog(metas.slice(0, count)));
    for (const mode of ["full", "runtime"]) {
      const client = new Client({ name: "mcp-size-benchmark", version: "1" });
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [path.join(repo, "apps/mcp-server/dist/index.js")],
        env: {
          ...process.env,
          SKILL_HUB_HOME: root,
          SKILL_HUB_CONFIG: "",
          SKILL_HUB_MCP_MODE: mode,
          TYPESAFE_API_KEY: "",
          SKILL_HUB_MCP_NO_START: "",
          SKILL_HUB_MCP_FORCE_START: "",
        },
        stderr: "pipe",
      });
      try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools;
        const instructions = client.getInstructions() ?? "";
        const surface = { tools, instructions };
        const searched = await client.callTool({
          name: "skill_search",
          arguments: { query: "arithmetic verification" },
        });
        assert.notEqual(searched.isError, true);
        const response = JSON.parse(searched.content.find((c) => c.type === "text").text);
        assert.equal(response.results.length, mode === "runtime" ? 3 : 5);
        measurements.push({
          skillCount: count,
          mode,
          toolCount: tools.length,
          initialProtocolBytes: bytes(surface),
          searchResponseBytes: bytes(searched),
          initialContextTokens: null,
          totalInputTokens: null,
          cachedInputTokens: null,
          fixtureMetadataBytes: bytes(
            metas.slice(0, count).map(({ name, description }) => ({ name, description })),
          ),
        });
      } finally {
        await client.close();
      }
    }
  }
  for (const mode of ["full", "runtime"])
    assert.equal(
      new Set(measurements.filter((r) => r.mode === mode).map((r) => r.initialProtocolBytes)).size,
      1,
    );
  const full = measurements.find((r) => r.mode === "full");
  const runtime = measurements.find((r) => r.mode === "runtime");
  assert(runtime.initialProtocolBytes < full.initialProtocolBytes);
  const report = {
    generatedAt: new Date().toISOString(),
    ok: true,
    measurements,
    protocolByteReduction: 1 - runtime.initialProtocolBytes / full.initialProtocolBytes,
    notes:
      "Actual stdio initialize instructions/tools and response UTF-8 JSON bytes. Not tokenizer estimates, native-host context, billed tokens, or task-quality evidence. Missing token metrics remain null. Synthetic fixtures only; no model calls or user config writes.",
  };
  await mkdir(path.join(repo, "outputs"), { recursive: true });
  await writeFile(
    path.join(repo, "outputs/mcp-surface-benchmark.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  // Exclusively created synthetic temporary directory; never a user-provided path.
  await rm(root, { recursive: true, force: true });
}
