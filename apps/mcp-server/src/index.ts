#!/usr/bin/env node
/**
 * skill-hub MCP server（stdio，只读）。
 *
 * Tools:
 *  - skill_search  { query, top_k?, profile? }
 *  - skill_fetch   { name, max_chars? }
 *  - skill_stats   {}
 *  - skill_inventory { agent? }
 *
 * 不暴露 sync --apply / restore 写操作。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  skillFetch,
  skillInventorySummary,
  skillSearch,
  skillStats,
} from "@skill-hub/router";
import { SKILL_HUB_VERSION, SkillHubError } from "@skill-hub/shared";

const TOOLS = [
  {
    name: "skill_search",
    description:
      "Search skill-hub canonical catalog (BM25 Top-K). Use before loading full skills to save context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Natural language task description" },
        top_k: { type: "number", description: "Max results (default 5)" },
        profile: {
          type: "string",
          description: "Optional profile name: coding | video",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "skill_fetch",
    description: "Fetch SKILL.md body and metadata for one skill by name (read-only).",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Skill directory name" },
        max_chars: {
          type: "number",
          description: "Truncate body after N chars (default 50000)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "skill_stats",
    description: "Catalog skill count, default engine, sample names.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "skill_inventory",
    description: "Per-agent skills directory summary (exists + count). Read-only.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent: {
          type: "string",
          description: "Optional agent id filter: workbuddy, cursor, codex, agents, claude-code",
        },
      },
    },
  },
];

function textResult(data: unknown, isError = false) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
    isError,
  };
}

function errorPayload(err: unknown) {
  if (err instanceof SkillHubError) {
    return {
      ok: false,
      code: err.code,
      message: err.message,
      details: err.details ?? null,
    };
  }
  return {
    ok: false,
    code: "E_INTERNAL",
    message: err instanceof Error ? err.message : String(err),
  };
}

export async function createSkillHubMcpServer(): Promise<Server> {
  const server = new Server(
    {
      name: "skill-hub",
      version: SKILL_HUB_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "skill_search": {
          const query = String(args.query ?? "");
          const topK = args.top_k !== undefined ? Number(args.top_k) : undefined;
          const profile = args.profile !== undefined ? String(args.profile) : undefined;
          const result = await skillSearch({
            query,
            topK: Number.isFinite(topK) ? topK : undefined,
            profile,
          });
          return textResult({
            query: result.query,
            top_k: result.top_k,
            engine: result.engineId,
            degraded: result.degraded,
            degrade_reason: result.degradeReason ?? null,
            profile: result.profile,
            profile_matched: result.profileMatched,
            profile_fallback: result.profileFallback,
            candidate_count: result.candidateCount,
            results: result.results.map((r) => ({
              name: r.name,
              score: Number(r.score.toFixed(4)),
              description: r.description,
              path: r.path,
              reasons: r.reasons,
            })),
          });
        }
        case "skill_fetch": {
          const skillName = String(args.name ?? "");
          const maxChars =
            args.max_chars !== undefined ? Number(args.max_chars) : undefined;
          const fetched = await skillFetch({
            name: skillName,
            maxChars: Number.isFinite(maxChars) ? maxChars : undefined,
          });
          return textResult(fetched);
        }
        case "skill_stats": {
          return textResult(await skillStats());
        }
        case "skill_inventory": {
          const agent = args.agent !== undefined ? String(args.agent) : undefined;
          return textResult(await skillInventorySummary({ agent }));
        }
        default:
          return textResult({ ok: false, message: `Unknown tool: ${name}` }, true);
      }
    } catch (err) {
      return textResult(errorPayload(err), true);
    }
  });

  return server;
}

export async function main(): Promise<void> {
  // 诊断：只写 stderr，避免污染 MCP stdio JSON-RPC
  console.error(`[skill-hub-mcp] starting v${SKILL_HUB_VERSION} pid=${process.pid}`);
  const server = await createSkillHubMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[skill-hub-mcp] stdio transport connected");
}

/** 库侧探测（非 MCP 进程）。 */
export function mcpServerPlaceholder(): string {
  return `skill-hub mcp-server ${SKILL_HUB_VERSION}`;
}

/**
 * 默认作为 stdio MCP 入口启动。
 * - 宿主（WorkBuddy/Cursor）通过 `node …/index.js` 拉起时必须进入 main
 * - 仅当被库 import 且设置 SKILL_HUB_MCP_NO_START=1 时跳过
 * - 旧逻辑用 path.endsWith 判断，路径被 wrapper 改写时会静默不启动 → Connection closed
 */
function shouldAutoStart(): boolean {
  if (process.env.SKILL_HUB_MCP_NO_START === "1") return false;
  if (process.env.SKILL_HUB_MCP_FORCE_START === "1") return true;
  // 作为 CLI / MCP 入口：有 argv[1] 且不是 -e / 交互 REPL
  const entry = process.argv[1];
  if (!entry) return false;
  if (entry === "-" || entry === "--") return false;
  return true;
}

if (shouldAutoStart()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
}
