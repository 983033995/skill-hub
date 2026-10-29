import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";
import type { ContextEstimate } from "./context-cost.js";

export type UsageOrigin = "cli" | "mcp" | "web" | "library";
export interface SkillUsageEvent {
  version: 1;
  at: string;
  origin: UsageOrigin;
  operation: "search" | "read";
  success: boolean;
  name?: string;
  candidates?: string[];
  kind?: "body" | "attachment";
  phase?: "initial" | "continuation";
  content?: ContextEstimate;
  errorCode?: string;
}

const MAX_LOG_BYTES = 32 * 1024 * 1024;
function logError(message: string) {
  return new SkillHubError({ code: "E_CONFIG", message });
}
export function resolveUsageLog(raw: string): string {
  if (!path.isAbsolute(raw) || !raw.endsWith(".jsonl") || raw.includes("\0")) {
    throw logError("usage日志需要显式绝对.jsonl路径");
  }
  return path.normalize(raw);
}

/** One bounded append per call. Never follows a final symlink or truncates a file. */
export async function appendUsage(file: string, event: SkillUsageEvent): Promise<void> {
  const target = resolveUsageLog(file);
  if (!validEvent(event)) throw logError("usage事件schema无效");
  const line = `${JSON.stringify(event)}\n`;
  if (Buffer.byteLength(line) > 65536) throw logError("usage事件超过64KiB上限");
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(
    target,
    constants.O_CREAT |
      constants.O_APPEND |
      constants.O_RDWR |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size + Buffer.byteLength(line) > MAX_LOG_BYTES) {
      throw logError("usage日志不是普通文件或达到32MiB上限，请人工归档");
    }
    if (info.size) {
      const end = Buffer.alloc(1);
      await handle.read(end, 0, 1, info.size - 1);
      if (end[0] !== 10) throw logError("usage日志末行不完整，请先检查日志");
      const head = Buffer.alloc(Math.min(info.size, 65536));
      await handle.read(head, 0, head.length, 0);
      const first = JSON.parse(head.toString("utf8").split("\n")[0]!);
      if (!validEvent(first)) throw logError("现有文件不是usage v1日志，拒绝追加");
    }
    await handle.writeFile(line, "utf8");
  } finally {
    await handle.close();
  }
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
function validName(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{1,256}$/.test(value);
}
function validEvent(value: unknown): value is SkillUsageEvent {
  if (!value || typeof value !== "object") return false;
  const e = value as SkillUsageEvent;
  if (
    Object.keys(e).some(
      (key) =>
        ![
          "version",
          "at",
          "origin",
          "operation",
          "success",
          "name",
          "candidates",
          "kind",
          "phase",
          "content",
          "errorCode",
        ].includes(key),
    )
  )
    return false;
  if (
    e.content &&
    Object.keys(e.content).some(
      (key) =>
        ![
          "method",
          "estimated",
          "utf16Chars",
          "codePoints",
          "utf8Bytes",
          "estimatedTokens",
        ].includes(key),
    )
  )
    return false;
  if (
    e.version !== 1 ||
    typeof e.at !== "string" ||
    !Number.isFinite(Date.parse(e.at)) ||
    !["cli", "mcp", "web", "library"].includes(e.origin) ||
    !["search", "read"].includes(e.operation) ||
    typeof e.success !== "boolean"
  )
    return false;
  if (e.name !== undefined && !validName(e.name)) return false;
  if (
    e.candidates !== undefined &&
    (!Array.isArray(e.candidates) || !e.candidates.every(validName))
  )
    return false;
  if (!e.success) return typeof e.errorCode === "string" && /^E_[A-Z_]+$/.test(e.errorCode);
  if (e.operation === "search") return Array.isArray(e.candidates);
  return (
    validName(e.name) &&
    ["body", "attachment"].includes(e.kind!) &&
    ["initial", "continuation"].includes(e.phase!) &&
    e.content?.method === "utf8-heuristic-v1" &&
    e.content.estimated === true &&
    e.content.utf16Chars <= 100000 &&
    e.content.codePoints <= e.content.utf16Chars &&
    e.content.utf8Bytes <= e.content.utf16Chars * 3 &&
    e.content.estimatedTokens <= Math.ceil(e.content.utf16Chars * 1.5) &&
    [
      e.content.utf16Chars,
      e.content.codePoints,
      e.content.utf8Bytes,
      e.content.estimatedTokens,
    ].every(isCount)
  );
}

export async function readUsageReport(options: {
  file: string;
  days?: number;
  origin?: UsageOrigin;
  name?: string;
  now?: Date;
}) {
  const file = resolveUsageLog(options.file);
  const now = options.now ?? new Date();
  if (
    !Number.isFinite(now.getTime()) ||
    (options.days !== undefined &&
      (!Number.isSafeInteger(options.days) || options.days < 1 || options.days > 3650))
  ) {
    throw logError("days须为1到3650的整数，now须为有效日期");
  }
  if (options.origin !== undefined && !["cli", "mcp", "web", "library"].includes(options.origin))
    throw logError("未知usage来源");
  let exists = true;
  let raw = "";
  try {
    const handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_LOG_BYTES)
        throw logError("usage日志不是普通文件或超过32MiB读取上限");
      const bytes = Buffer.alloc(info.size + 1);
      let length = 0;
      while (length < bytes.length) {
        const chunk = await handle.read(bytes, length, bytes.length - length, null);
        if (!chunk.bytesRead) break;
        length += chunk.bytesRead;
      }
      const after = await handle.stat();
      if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs)
        throw logError("读取期间usage日志变化，请重试");
      raw = bytes.subarray(0, length).toString("utf8");
      if (!Buffer.from(raw).equals(bytes.subarray(0, length)))
        throw logError("usage日志不是有效UTF-8");
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") exists = false;
    else throw error;
  }
  const issues: Array<{ line: number; code: string }> = [];
  const byKey = new Map<
    string,
    {
      name: string;
      origin: UsageOrigin;
      appearances: number;
      initialBodyReads: number;
      continuationBodyReads: number;
      attachmentReads: number;
      errors: number;
      returnedChars: number;
      returnedBytes: number;
      estimatedReturnedTokens: number;
      lastReadAt: string | null;
    }
  >();
  const since = options.days === undefined ? -Infinity : now.getTime() - options.days * 86400000;
  let recordedSince: string | null = null;
  let searchCalls = 0;
  let readCalls = 0;
  let errors = 0;
  const row = (name: string, origin: UsageOrigin) => {
    const key = JSON.stringify([origin, name]);
    let value = byKey.get(key);
    if (!value) {
      value = {
        name,
        origin,
        appearances: 0,
        initialBodyReads: 0,
        continuationBodyReads: 0,
        attachmentReads: 0,
        errors: 0,
        returnedChars: 0,
        returnedBytes: 0,
        estimatedReturnedTokens: 0,
        lastReadAt: null,
      };
      byKey.set(key, value);
    }
    return value;
  };
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    if (!line.trim()) continue;
    let event: SkillUsageEvent;
    try {
      if (Buffer.byteLength(line) > 65536 || (index === lines.length - 1 && !raw.endsWith("\n")))
        throw new Error();
      const parsed: unknown = JSON.parse(line);
      if (!validEvent(parsed) || Date.parse(parsed.at) > now.getTime()) throw new Error();
      event = parsed;
    } catch {
      issues.push({ line: index + 1, code: "E_PARSE" });
      continue;
    }
    if (recordedSince === null || Date.parse(event.at) < Date.parse(recordedSince))
      recordedSince = event.at;
    if (Date.parse(event.at) < since || (options.origin && event.origin !== options.origin))
      continue;
    if (options.name && event.name !== options.name && !event.candidates?.includes(options.name))
      continue;
    if (event.operation === "search") searchCalls++;
    else readCalls++;
    if (!event.success) {
      errors++;
      if (event.name) row(event.name, event.origin).errors++;
      continue;
    }
    if (event.operation === "search") {
      for (const name of new Set(event.candidates)) {
        if (!options.name || name === options.name) row(name, event.origin).appearances++;
      }
      continue;
    }
    const entry = row(event.name!, event.origin);
    if (event.kind === "attachment") entry.attachmentReads++;
    else if (event.phase === "continuation") entry.continuationBodyReads++;
    else entry.initialBodyReads++;
    entry.returnedChars += event.content!.utf16Chars;
    entry.returnedBytes += event.content!.utf8Bytes;
    entry.estimatedReturnedTokens += event.content!.estimatedTokens;
    if (entry.lastReadAt === null || Date.parse(event.at) > Date.parse(entry.lastReadAt))
      entry.lastReadAt = event.at;
  }
  return {
    file,
    exists,
    complete: issues.length === 0,
    issues,
    recordedSince,
    days: options.days ?? null,
    origin: options.origin ?? null,
    searchCalls,
    readCalls,
    errors,
    actualModelTokens: null,
    actualCost: null,
    estimateMethod: "utf8-heuristic-v1",
    returnedTextTotals: {
      utf16Chars: [...byKey.values()].reduce((sum, s) => sum + s.returnedChars, 0),
      utf8Bytes: [...byKey.values()].reduce((sum, s) => sum + s.returnedBytes, 0),
      estimatedTokens: [...byKey.values()].reduce((sum, s) => sum + s.estimatedReturnedTokens, 0),
    },
    coverage:
      "Hub service calls only; initial reads are requests, not unique tasks. Missing history is unknown. Returned text excludes envelopes, caches and model billing.",
    skills: [...byKey.values()].sort(
      (a, b) =>
        b.initialBodyReads - a.initialBodyReads ||
        b.appearances - a.appearances ||
        a.name.localeCompare(b.name) ||
        a.origin.localeCompare(b.origin),
    ),
  };
}
