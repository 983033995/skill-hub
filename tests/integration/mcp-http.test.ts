import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { request, type ClientRequest, type Server } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Client } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../../apps/mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSkillHubHttpServer,
  startSkillHubHttpServer,
  stopSkillHubHttpServer,
} from "../../apps/mcp-server/src/http.js";

const token = "synthetic-http-fixture-token-0123456789";
const auth = { Authorization: `Bearer ${token}` };
const rpcHeaders = {
  ...auth,
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};
let server: Server;
let base: string;
let home: string;
const clients: Client[] = [];

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "skill-hub-http-"));
  const skill = path.join(home, "skills", "http-fixture");
  await mkdir(path.join(skill, "references"), { recursive: true });
  await writeFile(
    path.join(skill, "SKILL.md"),
    "---\nname: http-fixture\ndescription: 视频剪辑与字幕制作 synthetic HTTP fixture\n---\n" +
      "正文内容 ".repeat(2000),
  );
  await writeFile(path.join(skill, "references", "guide.txt"), "synthetic attachment");
  await writeCatalog(
    path.join(home, "catalog.json"),
    buildCatalog(await scanSkills(path.join(home, "skills"))),
  );
  vi.stubEnv("SKILL_HUB_HOME", home);
  vi.stubEnv("SKILL_HUB_USAGE_LOG", "");
  // HTTP must remain runtime even when the stdio environment requests full mode.
  vi.stubEnv("SKILL_HUB_MCP_MODE", "full");
  server = await startSkillHubHttpServer({ token, port: 0 });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing listener");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await stopSkillHubHttpServer(server);
  vi.unstubAllEnvs();
});

async function connect(): Promise<Client> {
  const client = new Client({ name: "http-fixture-client", version: "1" });
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
      requestInit: { headers: auth },
    }),
  );
  return client;
}

async function callJson(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  expect(content[0]?.type).toBe("text");
  return { error: result.isError, data: JSON.parse(content[0]!.text) };
}

describe("Streamable HTTP MCP", () => {
  it("initializes the real SDK client, searches Chinese tasks, pages text and reads attachments", async () => {
    const client = await connect();
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
      "skill_search",
      "skill_files",
      "skill_read",
    ]);
    expect(client.getInstructions()).toContain("skill_read");
    const search = await callJson(client, "skill_search", { query: "视频剪辑与字幕制作" });
    expect(search.error).not.toBe(true);
    expect(search.data.results[0].name).toBe("http-fixture");
    expect(JSON.stringify(search.data)).not.toContain(home);
    const first = await callJson(client, "skill_read", { name: "http-fixture" });
    expect(first.data.body).toHaveLength(8000);
    expect(first.data.nextOffset).toBe(8000);
    expect(first.data).not.toHaveProperty("path");
    const next = await callJson(client, "skill_read", {
      name: "http-fixture",
      offset: first.data.nextOffset,
    });
    expect(next.data.hash).toBe(first.data.hash);
    expect(next.data.nextOffset).toBe(null);
    const files = await callJson(client, "skill_files", {
      name: "http-fixture",
      path: "references",
    });
    expect(files.data.files[0].path).toBe("references/guide.txt");
    const attachment = await callJson(client, "skill_read", {
      name: "http-fixture",
      file: files.data.files[0].path,
    });
    expect(attachment.data.body).toBe("synthetic attachment");
    for (const name of ["skill_path", "skill_inventory", "skill_fetch", "skill_audit"]) {
      const result = await callJson(client, name, { name: "http-fixture" });
      expect(result.error).toBe(true);
      expect(result.data.code).toBe("E_CONFIG");
    }
    const outside = await callJson(client, "skill_read", {
      name: "http-fixture",
      file: "../outside",
    });
    expect(outside.error).toBe(true);
    expect(outside.data.code).toBe("E_PATH");
    expect(JSON.stringify(outside)).not.toContain(home);
  });

  it("returns SSE over POST without sessions; parallel clients reuse RPC IDs safely", async () => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: rpcHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "raw-client", version: "1" },
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("mcp-session-id")).toBe(null);
    expect(await response.text()).toContain('"protocolVersion"');
    const pair = await Promise.all([connect(), connect()]);
    const results = await Promise.all(
      pair.map((client) => callJson(client, "skill_read", { name: "http-fixture", max_chars: 10 })),
    );
    expect(results.map((result) => result.data.body)).toEqual(["---\nname: ", "---\nname: "]);
  });

  it("authenticates every request, rejects foreign Host/Origin and ignores proxy headers", async () => {
    for (const route of ["/mcp", "/healthz", "/api/skills"]) {
      for (const authorization of [undefined, "Bearer wrong", `Basic ${token}`]) {
        const response = await fetch(`${base}${route}`, {
          headers: authorization ? { Authorization: authorization } : {},
        });
        expect(response.status).toBe(401);
        expect(response.headers.get("www-authenticate")).toContain("Bearer");
        expect(await response.text()).not.toContain(token);
      }
    }
    for (const headers of [
      { ...auth, Host: "evil.example" },
      { ...auth, Origin: "https://evil.example" },
      { ...auth, Host: "evil.example", "X-Forwarded-Host": new URL(base).host },
    ]) {
      // Node fetch may replace a custom Host; raw HTTP verifies the actual wire header.
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(`${base}/healthz`, { headers }, (res) => {
          res.resume();
          resolve(res.statusCode!);
        });
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(403);
    }
    const health = await fetch(`${base}/healthz`, { headers: auth });
    expect(await health.json()).toMatchObject({ ok: true, name: "skill-hub-mcp-http" });
    expect(health.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects unsupported methods, malformed JSON, media types, protocol and oversize bodies", async () => {
    for (const method of ["GET", "DELETE", "PUT", "OPTIONS"]) {
      const response = await fetch(`${base}/mcp`, { method, headers: auth });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    for (const route of ["/api/skills", "/mcp?token=secret", "/mcp/"]) {
      expect((await fetch(`${base}${route}`, { headers: auth })).status).toBe(404);
    }
    expect(
      (await fetch(`${base}/mcp`, { method: "POST", headers: rpcHeaders, body: "{" })).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "text/plain" },
          body: "{}",
        })
      ).status,
    ).toBe(415);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { ...rpcHeaders, Accept: "application/json" },
          body,
        })
      ).status,
    ).toBe(406);
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: { ...rpcHeaders, "MCP-Protocol-Version": "not-supported" },
          body,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${base}/mcp`, {
          method: "POST",
          headers: rpcHeaders,
          body: "x".repeat(1024 * 1024 + 1),
        })
      ).status,
    ).toBe(413);
    // Chunked transfer has no Content-Length and must enforce the same limit.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(`${base}/mcp`, { method: "POST", headers: rpcHeaders }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on("error", reject);
      req.write("x".repeat(600_000));
      req.end("x".repeat(600_000));
    });
    expect(status).toBe(413);
  });

  it("bounds simultaneous requests and releases slots on disconnected uploads", async () => {
    const pending: ClientRequest[] = [];
    let seen = 0;
    let remaining = 16;
    let allReleased: () => void;
    const released = new Promise<void>((resolve) => {
      allReleased = resolve;
    });
    const received = new Promise<void>((resolve) => {
      server.on("request", (_req, res) => {
        if (++seen > 16) return;
        res.once("close", () => {
          if (--remaining === 0) allReleased();
        });
        if (seen === 16) resolve();
      });
    });
    try {
      for (let index = 0; index < 16; index++) {
        const req = request(`${base}/mcp`, {
          method: "POST",
          headers: { ...rpcHeaders, "Content-Length": "20" },
        });
        req.on("error", () => {}); // Intentional client abort below.
        req.write("{");
        pending.push(req);
      }
      await received;
      expect(
        (await fetch(`${base}/mcp`, { method: "POST", headers: rpcHeaders, body: "{}" })).status,
      ).toBe(429);
      pending.forEach((req) => req.destroy());
      await released;
      expect((await (await connect()).listTools()).tools).toHaveLength(3);
    } finally {
      pending.forEach((req) => req.destroy());
    }
  });

  it("validates startup settings before opening a listener", async () => {
    for (const invalid of ["", "short", "secret with spaces".repeat(3)]) {
      expect(() => createSkillHubHttpServer({ token: invalid })).toThrow(/TOKEN/);
    }
    for (const allowedHosts of [["*"], ["https://example.com"], ["example.com/path"], []]) {
      expect(() => createSkillHubHttpServer({ token, allowedHosts })).toThrow(/ALLOWED_HOSTS/);
    }
    expect(() => createSkillHubHttpServer({ token, allowedOrigins: ["null"] })).toThrow(
      /ALLOWED_ORIGINS/,
    );
    await expect(
      startSkillHubHttpServer({ token, host: "0.0.0.0", port: 0 }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
    await expect(startSkillHubHttpServer({ token, port: -1 })).rejects.toMatchObject({
      code: "E_CONFIG",
    });
  });

  it("accepts only explicitly configured proxy Host and Origin values", async () => {
    await stopSkillHubHttpServer(server);
    server = await startSkillHubHttpServer({
      token,
      port: 0,
      host: "0.0.0.0",
      allowedHosts: ["hub.example.test"],
      allowedOrigins: ["https://agent.example.test"],
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing listener");
    for (const [host, origin, expected] of [
      ["hub.example.test", "https://agent.example.test", 200],
      ["hub.example.test", "https://evil.example.test", 403],
      ["evil.example.test", "https://agent.example.test", 403],
    ] as const) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = request(
          `http://127.0.0.1:${address.port}/healthz`,
          {
            headers: { ...auth, Host: host, Origin: origin },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode!);
          },
        );
        req.on("error", reject);
        req.end();
      });
      expect(status).toBe(expected);
    }
  });

  it("expires a stalled upload at the response deadline and frees its slot", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let req: ClientRequest | undefined;
    try {
      const received = new Promise<void>((resolve) => server.once("request", () => resolve()));
      const status = new Promise<number>((resolve, reject) => {
        req = request(
          `${base}/mcp`,
          { method: "POST", headers: { ...rpcHeaders, "Content-Length": "20" } },
          (res) => {
            res.resume();
            resolve(res.statusCode!);
          },
        );
        req.on("error", reject);
        req.write("{");
      });
      await received;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await status).toBe(504);
    } finally {
      req?.destroy();
      vi.useRealTimers();
    }
    expect((await (await connect()).listTools()).tools).toHaveLength(3);
  });

  it("runs the built HTTP entry without stdio side effects and shuts down on SIGTERM", async () => {
    const env = {
      ...process.env,
      SKILL_HUB_HOME: home,
      SKILL_HUB_CONFIG: "",
      SKILL_HUB_USAGE_LOG: "",
      TYPESAFE_API_KEY: "",
      SKILL_HUB_HTTP_TOKEN: token,
      SKILL_HUB_HTTP_HOST: "127.0.0.1",
      SKILL_HUB_HTTP_PORT: "0",
    };
    delete env.SKILL_HUB_HTTP_ALLOWED_HOSTS;
    delete env.SKILL_HUB_HTTP_ALLOWED_ORIGINS;
    const child = spawn(process.execPath, ["apps/mcp-server/dist/http.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    const exited = once(child, "exit");
    try {
      const endpoint = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("HTTP startup timed out")), 4000);
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("HTTP exited before startup"));
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk;
          const match = stderr.match(/listening on 127\.0\.0\.1:(\d+)\/mcp/);
          if (match) {
            clearTimeout(timeout);
            resolve(`http://127.0.0.1:${match[1]}/mcp`);
          }
        });
      });
      const client = new Client({ name: "built-http-test", version: "1" });
      clients.push(client);
      await client.connect(
        new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: auth } }),
      );
      expect((await client.listTools()).tools).toHaveLength(3);
      child.kill("SIGTERM");
      expect(await exited).toEqual([0, null]);
      expect(stdout).toBe("");
      expect(stderr).not.toContain(token);
      expect(stderr).not.toContain("stdio transport");
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        await exited;
      }
    }
  });
});
