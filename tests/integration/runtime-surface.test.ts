import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

describe("integration: runtime CLI/MCP surface", () => {
  it("lists, reads paged Skill text and browses safe attachment entries over MCP", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-runtime-surface-"));
    const home = path.join(root, "hub");
    const skills = path.join(home, "skills");
    const skill = path.join(skills, "surface-skill");
    await mkdir(path.join(skill, "references"), { recursive: true });
    await writeFile(
      path.join(skill, "SKILL.md"),
      "---\nname: surface-skill\ndescription: runtime surface fixture\n---\n\nlong body\n",
      "utf8",
    );
    await writeFile(path.join(skill, "references", "guide.md"), "guide text", "utf8");
    const metas = await scanSkills(skills);
    await writeCatalog(path.join(home, "catalog.json"), buildCatalog(metas));
    vi.stubEnv("SKILL_HUB_HOME", home);
    vi.stubEnv("SKILL_HUB_MCP_NO_START", "1");

    const { createSkillHubMcpServer } = await import("../../apps/mcp-server/src/index.js");
    const server = await createSkillHubMcpServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "runtime-surface-test", version: "1" });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(["skill_list", "skill_fetch", "skill_files", "skill_read"]),
      );
      expect(client.getInstructions()).toContain("that exact name");
      expect(client.getInstructions()).toContain("user's task content as the skill_search query");

      const listed = await callJson(client, "skill_list", { query: "surface", limit: 1 });
      expect(listed).toMatchObject({ total: 1, offset: 0, nextOffset: null });
      expect(listed.skills[0]).toMatchObject({ name: "surface-skill" });

      const files = await callJson(client, "skill_files", { name: "surface-skill" });
      expect(files.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "SKILL.md", type: "file" }),
          expect.objectContaining({ path: "references", type: "directory" }),
        ]),
      );

      const first = await callJson(client, "skill_read", {
        name: "surface-skill",
        max_chars: 8,
      });
      expect(first).toMatchObject({ body: "---\nname", offset: 0, nextOffset: 8 });
      const next = await callJson(client, "skill_fetch", {
        name: "surface-skill",
        offset: first.nextOffset,
        max_chars: 4,
      });
      expect(next).toMatchObject({ body: ": su", offset: 8, nextOffset: 12 });

      const attachment = await callJson(client, "skill_read", {
        name: "surface-skill",
        file: "references/guide.md",
      });
      expect(attachment).toMatchObject({ body: "guide text", file: "references/guide.md" });

      const invalid = await client.callTool({
        name: "skill_fetch",
        arguments: { name: "surface-skill", offset: "0" },
      });
      expect(invalid.isError).toBe(true);
      expect(JSON.parse(textContent(invalid))).toMatchObject({ code: "E_CONFIG" });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("runtime mode exposes only three tools and keeps safe paging/attachment access", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "skill-hub-minimal-runtime-"));
    const root = path.join(home, "skills", "runtime-proof");
    await mkdir(path.join(root, "references"), { recursive: true });
    await writeFile(
      path.join(root, "SKILL.md"),
      "---\nname: runtime-proof\ndescription: specialized runtime proof\n---\n" +
        "body ".repeat(2000),
    );
    await writeFile(path.join(root, "references", "proof.txt"), "fixture-proof");
    await writeCatalog(
      path.join(home, "catalog.json"),
      buildCatalog(await scanSkills(path.join(home, "skills"))),
    );
    vi.stubEnv("SKILL_HUB_HOME", home);
    vi.stubEnv("SKILL_HUB_MCP_NO_START", "1");
    const { createSkillHubMcpServer } = await import("../../apps/mcp-server/src/index.js");
    const server = await createSkillHubMcpServer({ mode: "runtime" });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "minimal-runtime-test", version: "1" });
    await server.connect(st);
    await client.connect(ct);
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        "skill_search",
        "skill_files",
        "skill_read",
      ]);
      expect(client.getInstructions()).toContain("skill_read");
      expect(client.getInstructions()).not.toContain("skill_fetch");
      expect(client.getInstructions()).toContain("This server does not disable native Skill discovery.");
      const found = await callJson(client, "skill_search", { query: "specialized runtime proof" });
      expect(found.results[0]).toMatchObject({ name: "runtime-proof", scope: "user" });
      expect(found.results[0]).not.toHaveProperty("path");
      expect(found).toHaveProperty("index_rebuild_recommended");
      const first = await callJson(client, "skill_read", { name: "runtime-proof" });
      expect(first.body).toHaveLength(8000);
      expect(first.nextOffset).toBe(8000);
      const next = await callJson(client, "skill_read", {
        name: "runtime-proof",
        offset: first.nextOffset,
        max_chars: 100,
      });
      expect(next.hash).toBe(first.hash);
      const files = await callJson(client, "skill_files", {
        name: "runtime-proof",
        path: "references",
      });
      expect(files.files[0].path).toBe("references/proof.txt");
      expect(
        (await callJson(client, "skill_read", { name: "runtime-proof", file: files.files[0].path }))
          .body,
      ).toBe("fixture-proof");
      for (const name of ["skill_fetch", "skill_list", "skill_audit", "skill_stats"]) {
        const rejected = await client.callTool({ name, arguments: { name: "runtime-proof" } });
        expect(rejected.isError).toBe(true);
        expect(JSON.parse(textContent(rejected)).code).toBe("E_CONFIG");
      }
      const outside = await client.callTool({
        name: "skill_read",
        arguments: { name: "runtime-proof", file: "../outside.txt" },
      });
      expect(outside.isError).toBe(true);
      expect(JSON.parse(textContent(outside)).code).toBe("E_PATH");
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects an invalid MCP mode rather than silently exposing all tools", async () => {
    vi.stubEnv("SKILL_HUB_MCP_NO_START", "1");
    vi.stubEnv("SKILL_HUB_MCP_MODE", "unknown");
    const { createSkillHubMcpServer } = await import("../../apps/mcp-server/src/index.js");
    await expect(createSkillHubMcpServer()).rejects.toMatchObject({ code: "E_CONFIG" });
  });
});

async function callJson(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).not.toBe(true);
  return JSON.parse(textContent(result)) as Record<string, unknown>;
}

function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  const content = result.content[0];
  if (!content || content.type !== "text" || content.text === undefined) {
    throw new Error("MCP tool did not return text content");
  }
  return content.text;
}
