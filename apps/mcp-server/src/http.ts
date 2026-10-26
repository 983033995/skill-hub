#!/usr/bin/env node
import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SkillHubError, SKILL_HUB_VERSION } from "@skill-hub/shared";
import { createSkillHubMcpServer } from "./server.js";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_CONCURRENT_REQUESTS = 16;
const REQUEST_TIMEOUT_MS = 30_000;

export interface HttpOptions {
  token: string;
  host?: string;
  port?: number;
  /** Exact Host authorities, including a non-default port. */
  allowedHosts?: string[];
  /** Exact Origin values. An absent Origin is allowed; default rejects all present Origins. */
  allowedOrigins?: string[];
}

function configError(message: string): never {
  throw new SkillHubError({ code: "E_CONFIG", message });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function reply(res: ServerResponse, status: number, message: string): void {
  if (res.destroyed || res.writableEnded) return;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ error: message }));
}

async function readBody(req: IncomingMessage, res: ServerResponse): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  const body = await new Promise<Buffer>((resolve, reject) => {
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      res.off("close", onClose);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => onError(new Error("Request closed"));
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        reply(res, 413, "Request body too large");
        onError(new Error("Request body too large"));
        req.resume();
        return;
      }
      chunks.push(chunk);
    };
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    res.once("close", onClose);
  });
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    reply(res, 400, "Invalid JSON");
    throw new Error("Invalid JSON");
  }
}

/** A single-tenant, stateless Streamable HTTP endpoint. No stdio or user-directory writes on import. */
export function createSkillHubHttpServer(options: HttpOptions): Server {
  if (
    typeof options.token !== "string" ||
    options.token.length < 32 ||
    !/^[A-Za-z0-9._~+/-]+=*$/.test(options.token)
  ) {
    configError("SKILL_HUB_HTTP_TOKEN 需要至少32字符的Bearer token");
  }
  const allowedHosts = options.allowedHosts?.map((value) => value.toLowerCase());
  if (
    allowedHosts &&
    (!allowedHosts.length ||
      allowedHosts.some((value) => {
        try {
          return (
            !/^(?:[a-z0-9][a-z0-9.-]*|\[[0-9a-f:]+\])(?::[0-9]+)?$/.test(value) ||
            new URL(`http://${value}`).host !== value
          );
        } catch {
          return true;
        }
      }))
  )
    configError("SKILL_HUB_HTTP_ALLOWED_HOSTS 必须是精确host[:port]列表");
  const allowedOrigins = options.allowedOrigins ?? [];
  if (
    allowedOrigins.some((value) => {
      try {
        const url = new URL(value);
        return !["https:", "http:"].includes(url.protocol) || url.origin !== value;
      } catch {
        return true;
      }
    })
  )
    configError("SKILL_HUB_HTTP_ALLOWED_ORIGINS 必须是精确HTTP(S) Origin列表");
  const expectedToken = digest(`Bearer ${options.token}`);
  let active = 0;
  const server = createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    // Never trust Forwarded/X-Forwarded-*; proxies must preserve a configured Host.
    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;
    const hosts = allowedHosts ?? [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
    if (
      !req.headers.host ||
      !hosts.includes(req.headers.host.toLowerCase()) ||
      (req.headers.origin !== undefined && !allowedOrigins.includes(req.headers.origin))
    ) {
      reply(res, 403, "Host or Origin not allowed");
      req.resume();
      return;
    }
    if (!timingSafeEqual(expectedToken, digest(req.headers.authorization ?? ""))) {
      res.setHeader("www-authenticate", 'Bearer realm="skill-hub"');
      reply(res, 401, "Unauthorized");
      req.resume();
      return;
    }
    // Exact paths only: no absolute-form target, query, encoded alias or Web REST fallback.
    if (req.url === "/healthz" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, name: "skill-hub-mcp-http", version: SKILL_HUB_VERSION }));
      return;
    }
    if (req.url !== "/mcp") {
      reply(res, 404, "Not found");
      req.resume();
      return;
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      reply(res, 405, "Stateless endpoint supports POST only");
      req.resume();
      return;
    }
    if (active >= MAX_CONCURRENT_REQUESTS) {
      res.setHeader("retry-after", "1");
      reply(res, 429, "Too many concurrent requests");
      req.resume();
      return;
    }
    if (
      req.headers["content-encoding"] !== undefined ||
      req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json"
    ) {
      reply(res, 415, "Expected uncompressed application/json");
      req.resume();
      return;
    }
    if (Number(req.headers["content-length"] ?? 0) > MAX_BODY_BYTES) {
      reply(res, 413, "Request body too large");
      req.resume();
      return;
    }
    active++;
    let mcp: Awaited<ReturnType<typeof createSkillHubMcpServer>> | undefined;
    let closed = false;
    const timeout = setTimeout(() => reply(res, 504, "Request timed out"), REQUEST_TIMEOUT_MS);
    res.once("close", () => {
      closed = true;
      active--;
      clearTimeout(timeout);
      // Closing a transport aborts protocol requests and releases its SSE response streams.
      if (mcp) void mcp.close().catch(() => console.error("[skill-hub-http] cleanup failed"));
    });
    void (async () => {
      const body = await readBody(req, res);
      if (closed) return;
      mcp = await createSkillHubMcpServer({ mode: "runtime", exposure: "remote" });
      if (closed) {
        await mcp.close();
        return;
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    })().catch(() => {
      // Do not expose filesystem paths, request bodies, auth headers or provider errors.
      if (!res.writableEnded && !res.destroyed) {
        console.error("[skill-hub-http] request failed");
        reply(res, 500, "Internal server error");
      }
    });
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = 5_000;
  return server;
}

function envList(name: string): string[] | undefined {
  const value = process.env[name];
  return value === undefined ? undefined : value.split(",").map((item) => item.trim());
}

export async function startSkillHubHttpServer(options: HttpOptions): Promise<Server> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8788;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) configError("HTTP端口无效");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !options.allowedHosts?.length) {
    configError("非loopback监听必须显式配置SKILL_HUB_HTTP_ALLOWED_HOSTS");
  }
  const server = createSkillHubHttpServer(options);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

/** Drain requests; force-close sockets after five seconds. No process exit in library use. */
export async function stopSkillHubHttpServer(server: Server): Promise<void> {
  if (!server.listening) return;
  const timeout = setTimeout(() => server.closeAllConnections(), 5_000);
  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const server = await startSkillHubHttpServer({
    token: process.env.SKILL_HUB_HTTP_TOKEN ?? "",
    host: process.env.SKILL_HUB_HTTP_HOST,
    port: Number(process.env.SKILL_HUB_HTTP_PORT ?? process.env.PORT ?? 8788),
    allowedHosts: envList("SKILL_HUB_HTTP_ALLOWED_HOSTS"),
    allowedOrigins: envList("SKILL_HUB_HTTP_ALLOWED_ORIGINS"),
  });
  const address = server.address();
  console.error(
    `[skill-hub-http] v${SKILL_HUB_VERSION} runtime listening on ${
      address && typeof address === "object" ? `${address.address}:${address.port}` : address
    }/mcp`,
  );
  const shutdown = () => {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    void stopSkillHubHttpServer(server).catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

function isHttpEntry(): boolean {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false; // A synthetic/nonexistent argv entry is a library import, not this CLI.
  }
}

if (isHttpEntry()) {
  main().catch((error) => {
    console.error(
      error instanceof SkillHubError ? error.message : "[skill-hub-http] startup failed",
    );
    process.exitCode = 1;
  });
}
