#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SKILL_HUB_VERSION } from "@skill-hub/shared";
import { createSkillHubMcpServer } from "./server.js";
export { createSkillHubMcpServer } from "./server.js";

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
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  });
}
