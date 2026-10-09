#!/usr/bin/env node
import process from "node:process";
import console from "node:console";
/** Read-only full catalog acceptance against the built stdio MCP server. No bodies in reports. */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(repo, "apps/mcp-server/package.json"));
const { Client } = await import(require.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StdioClientTransport } = await import(
  require.resolve("@modelcontextprotocol/sdk/client/stdio.js")
);
const client = new Client({ name: "hub-full-read-acceptance", version: "1" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(repo, "apps/mcp-server/dist/index.js")],
  env: { ...process.env },
  stderr: "pipe",
});
const report = {
  at: new Date().toISOString(),
  tools: [],
  catalogCount: 0,
  skills: [],
  errors: [],
  boundaries:
    "All catalog SKILL.md and directory listings via real stdio MCP; no Skill scripts executed, no body text persisted.",
};
const call = async (name, args) => {
  const response = await client.callTool({ name, arguments: args });
  const data = JSON.parse(response.content.find((x) => x.type === "text").text);
  if (response.isError) throw new Error(`${data.code}: ${data.message}`);
  return data;
};
try {
  await client.connect(transport);
  report.tools = (await client.listTools()).tools.map((t) => t.name);
  const all = [];
  let offset = 0;
  while (true) {
    const page = await call("skill_list", { offset, limit: 25 });
    report.catalogCount = page.total;
    all.push(...page.skills);
    if (page.nextOffset === null) break;
    if (page.nextOffset <= offset) throw new Error("Catalog pagination did not advance");
    offset = page.nextOffset;
  }
  if (new Set(all.map((s) => s.name)).size !== report.catalogCount)
    throw new Error("Catalog pagination lost or duplicated skills");
  for (const skill of all) {
    const result = {
      name: skill.name,
      pages: 0,
      chars: 0,
      hashMatch: false,
      rootEntries: 0,
      blockedEntries: [],
    };
    try {
      let body = "";
      let expectedHash;
      let offset = 0;
      while (true) {
        const page = await call("skill_fetch", { name: skill.name, offset, max_chars: 4096 });
        if (expectedHash && page.hash !== expectedHash)
          throw new Error("Skill changed during pagination");
        expectedHash = page.hash;
        body += page.body;
        result.pages++;
        if (page.nextOffset === null) break;
        if (page.nextOffset <= offset) throw new Error("Body pagination did not advance");
        offset = page.nextOffset;
      }
      const disk = await readFile(path.join(skill.path, "SKILL.md"), "utf8");
      result.chars = body.length;
      result.hash = "sha256:" + createHash("sha256").update(body).digest("hex");
      result.hashMatch = body === disk && result.hash === expectedHash;
      if (!result.hashMatch) throw new Error("MCP body differs from disk");
      offset = 0;
      while (true) {
        const page = await call("skill_files", { name: skill.name, offset, limit: 25 });
        result.rootEntries += page.files.length;
        result.blockedEntries.push(...page.files.filter((entry) => entry.type === "blocked"));
        if (page.nextOffset === null) break;
        offset = page.nextOffset;
      }
    } catch (err) {
      result.error = err.message;
      report.errors.push({ name: skill.name, error: err.message });
    }
    report.skills.push(result);
  }
  for (const args of [
    { name: "__hub_missing_acceptance__" },
    ...(all[0]
      ? [
          { name: all[0].name, file: "../outside" },
          { name: all[0].name, offset: -1 },
        ]
      : []),
  ]) {
    const response = await client.callTool({ name: "skill_read", arguments: args });
    if (!response.isError)
      report.errors.push({ error: "Expected rejection was not returned", args });
  }
} catch (err) {
  report.errors.push({ error: err.message });
} finally {
  await client.close();
}
report.ok = report.errors.length === 0;
const output = path.resolve(
  process.argv[2] ?? path.join(repo, "outputs/runtime-full-acceptance.json"),
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      ok: report.ok,
      count: report.catalogCount,
      verified: report.skills.filter((s) => s.hashMatch).length,
      errors: report.errors,
      output,
    },
    null,
    2,
  ),
);
process.exitCode = report.ok ? 0 : 1;
