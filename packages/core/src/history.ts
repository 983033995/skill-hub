import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SkillHubError, resolveAbsolutePath } from "@skill-hub/shared";
import type { SkillProvenance } from "@skill-hub/shared";

export type SkillHistoryType = "ingest" | "sync" | "index" | "overlay" | "fork";

/** 本地可审计的 Skill 生命周期事件；正文永远不写入 history。 */
export interface SkillHistoryEntry {
  at: string;
  type: SkillHistoryType;
  name?: string;
  action?: string;
  previousHash?: string;
  hash?: string;
  revision?: string;
  source?: string;
  agentId?: string;
  target?: string;
  path?: string;
  provenance?: SkillProvenance;
  detail?: Record<string, unknown>;
}

export async function appendHistory(filePath: string, entry: SkillHistoryEntry): Promise<void> {
  const abs = resolveAbsolutePath(filePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await appendFile(abs, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function appendHistoryBatch(
  filePath: string,
  entries: SkillHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const abs = resolveAbsolutePath(filePath);
  await mkdir(path.dirname(abs), { recursive: true });
  await appendFile(abs, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

export async function readHistory(filePath: string): Promise<SkillHistoryEntry[]> {
  const abs = resolveAbsolutePath(filePath);
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
    if (code === "ENOENT") return [];
    throw new SkillHubError({
      code: "E_PATH",
      message: `无法读取 Skill history: ${abs}`,
      details: { path: abs },
      cause: err,
    });
  }

  const entries: SkillHistoryEntry[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error("history entry 必须是对象");
      const value = parsed as Partial<SkillHistoryEntry>;
      if (typeof value.at !== "string" || typeof value.type !== "string") {
        throw new Error("history entry 缺少 at/type");
      }
      entries.push(value as SkillHistoryEntry);
    } catch (err) {
      throw new SkillHubError({
        code: "E_PARSE",
        message: `Skill history 第 ${index + 1} 行无效: ${abs}`,
        details: { path: abs, line: index + 1 },
        cause: err,
      });
    }
  }
  return entries;
}

export async function historyForSkill(
  filePath: string,
  name: string,
): Promise<SkillHistoryEntry[]> {
  return (await readHistory(filePath)).filter((entry) => entry.name === name);
}
