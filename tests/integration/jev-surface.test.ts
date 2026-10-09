import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { Client } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { InMemoryTransport } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("integration: Jev decision surfaces", () => {
  it("keeps CLI, MCP and HTTP decisions consistent, including no-match and fallback", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-jev-surface-"));
    const skillDir = path.join(root, "skills", "pdf");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "---\nname: pdf\ndescription: Merge PDF documents\n---\nprivate body must not be sent\n",
    );
    await writeCatalog(
      path.join(root, "catalog.json"),
      buildCatalog(await scanSkills(path.join(root, "skills"))),
    );
    vi.stubEnv("SKILL_HUB_HOME", root);
    vi.stubEnv("SKILL_HUB_CONFIG", "");
    vi.stubEnv("SKILL_HUB_MCP_NO_START", "1");
    vi.stubEnv("SKILL_HUB_WEB_NO_START", "1");
    vi.stubEnv("SKILL_HUB_TAXONOMY", "");
    vi.stubEnv("TYPESAFE_API_KEY", "test-key");
    vi.stubEnv("TYPESAFE_API_URL", "https://api.typesafe.ai/v1/systemone");
    vi.stubEnv("TYPESAFE_MIN_CONFIDENCE", "0.65");

    const nativeFetch = globalThis.fetch;
    const externalCalls: string[] = [];
    let mode: "match" | "none" | "failure" = "match";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (String(url) !== "https://api.typesafe.ai/v1/systemone") return nativeFetch(url, init);
        externalCalls.push(String(init.body));
        if (mode === "failure") return new Response("unavailable", { status: 529 });
        const none = mode === "none";
        return new Response(
          JSON.stringify({
            model: "jev-fixture",
            answers: {
              route: {
                type: "choice",
                choice: none ? "__none_of_the_above__" : "s0",
                confidence: 0.6,
                probabilities: { s0: none ? 0.2 : 0.8, __none_of_the_above__: none ? 0.8 : 0.2 },
              },
            },
          }),
        );
      }),
    );

    const { createSkillHubMcpServer } = await import("../../apps/mcp-server/src/index.js");
    const { createWebServer } = await import("../../apps/web/src/index.js");
    const { runRoute } = await import("../../apps/cli/src/commands/route.js");
    const server = await createSkillHubMcpServer();
    const client = new Client({ name: "jev-surface-test", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const web = createWebServer();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      web.listen(0, "127.0.0.1");
      await once(web, "listening");
      const address = web.address();
      if (!address || typeof address === "string") throw new Error("HTTP test address unavailable");
      const url = `http://127.0.0.1:${address.port}/api/search?q=merge%20PDF&engine=external-typesafe`;

      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      await runRoute({
        json: true,
        query: "merge PDF",
        topK: 5,
        includeBody: false,
        engine: "external-typesafe",
      });
      const cli = JSON.parse(String(log.mock.calls[0]?.[0]));
      log.mockRestore();
      const called = await client.callTool({
        name: "skill_search",
        arguments: { query: "merge PDF", engine: "external-typesafe" },
      });
      if (!Array.isArray(called.content)) throw new Error("MCP content unavailable");
      const first = called.content[0];
      if (first?.type !== "text") throw new Error("MCP text unavailable");
      const mcp = JSON.parse(String(first.text));
      const http = await (await nativeFetch(url)).json();
      expect(called.isError).not.toBe(true);
      expect(cli.decision).toEqual(mcp.decision);
      expect(http.decision).toEqual(cli.decision);
      expect(cli.decision).toMatchObject({
        selected: "pdf",
        confidence: 0.6,
        selected_probability: 0.8,
        escalation_recommended: true,
      });
      expect(externalCalls).toHaveLength(3);
      for (const body of externalCalls) {
        expect(body).not.toContain(root);
        expect(body).not.toContain("private body");
      }

      mode = "none";
      const noMatch = await (await nativeFetch(url)).json();
      expect(noMatch.results).toEqual([]);
      expect(noMatch.decision).toMatchObject({ selected: null, escalation_recommended: true });
      mode = "failure";
      const fallback = await (await nativeFetch(url)).json();
      expect(fallback).toMatchObject({ engine: "bm25", degraded: true, decision: null });
      expect(fallback.results[0].name).toBe("pdf");
    } finally {
      await client.close();
      await server.close();
      if (web.listening)
        await new Promise<void>((resolve, reject) =>
          web.close((err) => (err ? reject(err) : resolve())),
        );
      await rm(root, { recursive: true, force: true });
    }
  });
});
