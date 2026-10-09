#!/usr/bin/env node
/**
 * skill-hub Web 只读视图（Phase 7）。
 *
 * - HTTP API 对齐 MCP 只读契约：list/search/fetch/files/read/explain/history/stats/inventory
 * - 不提供任何写操作（无 sync/restore/install/update）
 * - 默认 bind 127.0.0.1，仅本机访问
 * - 同时托管 public/ 下的前端 SPA
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLlmStatus,
  skillAudit,
  skillExplain,
  skillFetch,
  skillFiles,
  skillHistory,
  skillInventorySummary,
  skillList,
  skillRead,
  skillSearch,
  skillStats,
  skillTagSummary,
} from "@skill-hub/router";
import { SKILL_HUB_VERSION, SkillHubError, type SkillScope } from "@skill-hub/shared";

const DEFAULT_PORT = 4173;
const DEFAULT_HOST = "127.0.0.1";
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function statusForError(err: unknown): number {
  if (err instanceof SkillHubError) {
    switch (err.code) {
      case "E_NOT_FOUND":
        return 404;
      case "E_CONFIG":
      case "E_PARSE":
        return 400;
      case "E_CONFLICT":
        return 409;
      default:
        return 500;
    }
  }
  return 500;
}

function errorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof SkillHubError) {
    return { ok: false, code: err.code, message: err.message, details: err.details ?? null };
  }
  return {
    ok: false,
    code: "E_INTERNAL",
    message: err instanceof Error ? err.message : String(err),
  };
}

function parseScopes(raw: string | null): SkillScope[] | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const allowed = new Set<SkillScope>(["user", "workspace", "project"]);
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const scope of values) {
    if (!allowed.has(scope as SkillScope)) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: `scope 无效: ${scope}（应为 user|workspace|project）`,
      });
    }
  }
  return values as SkillScope[];
}

function intParam(url: URL, key: string, bounds: { min: number; max: number }): number | undefined {
  const raw = url.searchParams.get(key);
  if (raw === null) return undefined;
  if (!/^-?\d+$/.test(raw)) {
    throw new SkillHubError({ code: "E_CONFIG", message: `${key} 必须是整数` });
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `${key} 越界（${bounds.min}-${bounds.max}）: ${raw}`,
    });
  }
  return value;
}

function stringParam(url: URL, key: string): string | undefined {
  const raw = url.searchParams.get(key);
  return raw === null || raw === "" ? undefined : raw;
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, code: "E_CONFIG", message: "Web 视图只读，仅支持 GET" });
    return;
  }
  const segments = url.pathname.split("/").filter(Boolean); // e.g. ["api","skills",":name","files"]
  const resource = segments[1];

  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, name: "skill-hub-web", version: SKILL_HUB_VERSION });
    return;
  }

  if (resource === "stats") {
    sendJson(res, 200, await skillStats());
    return;
  }

  if (resource === "tags") {
    sendJson(res, 200, await skillTagSummary());
    return;
  }

  // 可选增强层状态：未配置/配置错误/服务不可达都以 200 + state 字段返回，绝不抛错
  if (url.pathname === "/api/llm/status") {
    sendJson(res, 200, await getLlmStatus({ probe: url.searchParams.get("probe") === "1" }));
    return;
  }

  if (resource === "inventory") {
    sendJson(
      res,
      200,
      await skillInventorySummary({
        agent: stringParam(url, "agent"),
        scope: parseScopes(url.searchParams.get("scope")),
      }),
    );
    return;
  }

  if (resource === "search") {
    const query = stringParam(url, "q") ?? stringParam(url, "query");
    if (!query || !query.trim()) {
      throw new SkillHubError({ code: "E_CONFIG", message: "search 需要 q 参数" });
    }
    const result = await skillSearch({
      query,
      topK: intParam(url, "top_k", { min: 1, max: 100 }),
      profile: stringParam(url, "profile"),
      engine: stringParam(url, "engine"),
      scope: parseScopes(url.searchParams.get("scope")),
      tag: stringParam(url, "tag"),
    });
    sendJson(res, 200, {
      query: result.query,
      top_k: result.top_k,
      engine: result.engineId,
      degraded: result.degraded,
      degrade_reason: result.degradeReason ?? null,
      profile: result.profile,
      profile_matched: result.profileMatched,
      scope: result.scope,
      scope_matched: result.scopeMatched,
      candidate_count: result.candidateCount,
      index_fresh: result.indexFresh,
      index_rebuild_recommended: result.indexRebuildRecommended,
      index_source: result.indexSource,
      index_reason: result.indexReason,
      decision: result.decision
        ? {
            kind: result.decision.kind,
            model: result.decision.model,
            selected: result.decision.selected,
            confidence: Number(result.decision.confidence.toFixed(4)),
            selected_probability: Number(result.decision.selectedProbability.toFixed(4)),
            none_probability: Number(result.decision.noneProbability.toFixed(4)),
            threshold: Number(result.decision.threshold.toFixed(4)),
            escalation_recommended: result.decision.escalationRecommended,
            probabilities: Object.fromEntries(
              Object.entries(result.decision.probabilities).map(([skill, probability]) => [
                skill,
                Number(probability.toFixed(4)),
              ]),
            ),
          }
        : null,
      results: result.results.map((r) => ({
        name: r.name,
        score: Number(r.score.toFixed(4)),
        description: r.description,
        path: r.path,
        provenance: r.provenance ?? null,
        reasons: r.reasons,
        tags: r.tags,
      })),
    });
    return;
  }

  if (url.pathname === "/api/audit") {
    sendJson(res, 200, await skillAudit({ name: stringParam(url, "name") }));
    return;
  }

  if (resource === "skills") {
    const name = segments[2] ? decodeURIComponent(segments[2]) : undefined;
    const sub = segments[3];

    if (!name) {
      sendJson(
        res,
        200,
        await skillList({
          query: stringParam(url, "query"),
          tag: stringParam(url, "tag"),
          offset: intParam(url, "offset", { min: 0, max: 10485760 }),
          limit: intParam(url, "limit", { min: 1, max: 100 }),
        }),
      );
      return;
    }

    switch (sub) {
      case undefined:
        sendJson(
          res,
          200,
          await skillFetch({
            name,
            offset: intParam(url, "offset", { min: 0, max: 10485760 }),
            maxChars: intParam(url, "max_chars", { min: 1, max: 100000 }),
          }),
        );
        return;
      case "files":
        sendJson(
          res,
          200,
          await skillFiles({
            name,
            path: stringParam(url, "path"),
            offset: intParam(url, "offset", { min: 0, max: 10485760 }),
            limit: intParam(url, "limit", { min: 1, max: 100 }),
          }),
        );
        return;
      case "read":
        sendJson(
          res,
          200,
          await skillRead({
            name,
            file: stringParam(url, "file"),
            offset: intParam(url, "offset", { min: 0, max: 10485760 }),
            maxChars: intParam(url, "max_chars", { min: 1, max: 100000 }),
          }),
        );
        return;
      case "explain":
        sendJson(res, 200, await skillExplain({ name }));
        return;
      case "history":
        sendJson(
          res,
          200,
          await skillHistory({
            name,
            limit: intParam(url, "limit", { min: 1, max: 1000 }),
          }),
        );
        return;
      case "audit":
        sendJson(res, 200, await skillAudit({ name }));
        return;
      default:
        sendJson(res, 404, {
          ok: false,
          code: "E_NOT_FOUND",
          message: `未知资源: ${url.pathname}`,
        });
        return;
    }
  }

  sendJson(res, 404, { ok: false, code: "E_NOT_FOUND", message: `未知资源: ${url.pathname}` });
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const abs = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!abs.startsWith(PUBLIC_DIR + path.sep) && abs !== PUBLIC_DIR) {
    sendJson(res, 403, { ok: false, code: "E_PATH", message: "禁止越界访问" });
    return;
  }
  try {
    const content = await readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(content);
  } catch {
    // SPA hash 路由不需要服务端回退；其余一律 404
    sendJson(res, 404, { ok: false, code: "E_NOT_FOUND", message: `文件不存在: ${rel}` });
  }
}

export function createWebServer(): Server {
  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", `http://${DEFAULT_HOST}`);
      try {
        if (url.pathname.startsWith("/api/")) {
          await handleApi(req, res, url);
        } else {
          await serveStatic(res, decodeURIComponent(url.pathname));
        }
      } catch (err) {
        sendJson(res, statusForError(err), errorPayload(err));
      }
    })();
  });
}

export interface WebServerOptions {
  port?: number;
  host?: string;
}

export async function main(options: WebServerOptions = {}): Promise<Server> {
  const port = options.port ?? Number(process.env.SKILL_HUB_WEB_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.SKILL_HUB_WEB_HOST ?? DEFAULT_HOST;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new SkillHubError({ code: "E_CONFIG", message: `端口无效: ${port}` });
  }
  const server = createWebServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  console.error(`[skill-hub-web] v${SKILL_HUB_VERSION} 只读视图已启动: http://${host}:${port}`);
  return server;
}

function parseCliArgs(argv: string[]): WebServerOptions {
  const options: WebServerOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      options.port = Number(next);
      i += 1;
    } else if (arg === "--host" && next) {
      options.host = next;
      i += 1;
    }
  }
  return options;
}

function shouldAutoStart(): boolean {
  if (process.env.SKILL_HUB_WEB_NO_START === "1") return false;
  const entry = process.argv[1];
  if (!entry) return false;
  if (entry === "-" || entry === "--") return false;
  return true;
}

if (shouldAutoStart()) {
  main(parseCliArgs(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}
