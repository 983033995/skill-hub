import { appendFile, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { estimateContext } from "./context-cost.js";
import { appendUsage, readUsageReport, type SkillUsageEvent } from "./usage.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});
async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), "hub-usage-"));
  roots.push(root);
  return { root, file: path.join(root, "usage.jsonl") };
}
const now = new Date("2026-10-26T02:00:00Z");
function event(overrides: Partial<SkillUsageEvent> = {}): SkillUsageEvent {
  return {
    version: 1,
    at: "2026-10-25T00:00:00Z",
    origin: "mcp",
    operation: "read",
    success: true,
    name: "alpha",
    kind: "body",
    phase: "initial",
    content: estimateContext("abcd中文🙂"),
    ...overrides,
  };
}

it("estimates ASCII, CJK, emoji, mixed and empty text with explicit character/byte units", () => {
  expect(estimateContext("")).toMatchObject({ estimatedTokens: 0, utf8Bytes: 0 });
  expect(estimateContext("abcd")).toMatchObject({
    estimatedTokens: 1,
    codePoints: 4,
    utf16Chars: 4,
    utf8Bytes: 4,
  });
  expect(estimateContext("中文")).toMatchObject({
    estimatedTokens: 3,
    codePoints: 2,
    utf8Bytes: 6,
  });
  expect(estimateContext("🙂")).toMatchObject({
    estimatedTokens: 2,
    codePoints: 1,
    utf16Chars: 2,
    utf8Bytes: 4,
  });
  expect(estimateContext("abcd中文🙂")).toMatchObject({
    method: "utf8-heuristic-v1",
    estimated: true,
    estimatedTokens: 6,
  });
});

it("aggregates calls by interface and phase, filters dates, and never invents billing", async () => {
  const { file } = await workspace();
  for (const value of [
    event(),
    event({ phase: "continuation" }),
    event({ kind: "attachment" }),
    event({ origin: "web", at: "2026-09-01T00:00:00Z" }),
    {
      version: 1,
      at: "2026-10-25T00:00:00Z",
      origin: "mcp",
      operation: "search",
      success: true,
      candidates: ["alpha", "alpha", "beta"],
    } as SkillUsageEvent,
    {
      version: 1,
      at: "2026-10-25T00:00:00Z",
      origin: "mcp",
      operation: "read",
      success: false,
      name: "alpha",
      errorCode: "E_PATH",
    } as SkillUsageEvent,
  ])
    await appendUsage(file, value);
  const report = await readUsageReport({ file, days: 7, now, origin: "mcp", name: "alpha" });
  expect(report).toMatchObject({
    complete: true,
    exists: true,
    searchCalls: 1,
    readCalls: 4,
    errors: 1,
    actualModelTokens: null,
    actualCost: null,
  });
  expect(report.skills).toMatchObject([
    {
      name: "alpha",
      origin: "mcp",
      appearances: 1,
      initialBodyReads: 1,
      continuationBodyReads: 1,
      attachmentReads: 1,
      errors: 1,
      estimatedReturnedTokens: 18,
    },
  ]);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect((await readUsageReport({ file, now })).skills).toHaveLength(3);
});

it("accepts 101 search candidates but still enforces the per-event byte bound", async () => {
  const { file } = await workspace();
  const search: SkillUsageEvent = {
    version: 1,
    at: "2026-10-25T00:00:00Z",
    origin: "mcp",
    operation: "search",
    success: true,
    candidates: Array.from({ length: 101 }, (_, index) => `skill-${index}`),
  };
  await appendUsage(file, search);

  await expect(
    appendUsage(file, {
      ...search,
      candidates: Array.from(
        { length: 300 },
        (_, index) => `candidate-${String(index).padStart(5, "0")}-${"x".repeat(240)}`,
      ),
    }),
  ).rejects.toMatchObject({ code: "E_CONFIG" });

  const report = await readUsageReport({ file, now });
  expect(report).toMatchObject({ complete: true, searchCalls: 1 });
  expect(report.skills).toHaveLength(101);
  expect(report.skills.every((skill) => skill.appearances === 1)).toBe(true);
});

it("retains healthy records beside corrupt, invalid and incomplete lines", async () => {
  const { file } = await workspace();
  await appendUsage(file, event());
  await appendFile(file, 'not-json\n{"version":99}\n{"unfinished":');
  const report = await readUsageReport({ file, now });
  expect(report).toMatchObject({
    complete: false,
    readCalls: 1,
    issues: [{ line: 2 }, { line: 3 }, { line: 4 }],
  });
  await expect(appendUsage(file, event())).rejects.toMatchObject({ code: "E_CONFIG" });
});

it("missing history stays unknown and invalid filters fail", async () => {
  const { file } = await workspace();
  expect(await readUsageReport({ file })).toMatchObject({
    exists: false,
    recordedSince: null,
    skills: [],
    actualModelTokens: null,
  });
  for (const days of [0, -1, 1.5, 3651, NaN])
    await expect(readUsageReport({ file, days })).rejects.toMatchObject({ code: "E_CONFIG" });
  await expect(readUsageReport({ file, origin: "unknown" as "mcp" })).rejects.toMatchObject({
    code: "E_CONFIG",
  });
});

it("rejects symlinks, foreign logs, relative paths and private extra fields without modifying their contents", async () => {
  const { file, root } = await workspace();
  const foreign = path.join(root, "foreign.jsonl");
  await writeFile(foreign, '{"type":"ingest"}\n');
  await symlink(foreign, file);
  await expect(appendUsage(file, event())).rejects.toThrow();
  await expect(readUsageReport({ file })).rejects.toThrow();
  await expect(appendUsage(foreign, event())).rejects.toThrow();
  expect(await readFile(foreign, "utf8")).toBe('{"type":"ingest"}\n');
  await expect(appendUsage("relative.jsonl", event())).rejects.toMatchObject({ code: "E_CONFIG" });
  await expect(
    appendUsage(path.join(root, "private.jsonl"), {
      ...event(),
      query: "secret",
    } as SkillUsageEvent),
  ).rejects.toMatchObject({ code: "E_CONFIG" });
});

it("keeps concurrent appends as separate parseable events", async () => {
  const { file } = await workspace();
  await Promise.all(Array.from({ length: 20 }, () => appendUsage(file, event())));
  expect(await readUsageReport({ file, now })).toMatchObject({ complete: true, readCalls: 20 });
});
