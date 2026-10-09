import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendHistoryBatch, historyForSkill, readHistory } from "./history.js";

describe("skill history", () => {
  it("appends and filters lifecycle events without Skill body", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-history-"));
    const file = path.join(dir, "history.jsonl");
    await appendHistoryBatch(file, [
      { at: new Date(1).toISOString(), type: "ingest", name: "pdf", hash: "sha256:a" },
      { at: new Date(2).toISOString(), type: "sync", name: "pdf", agentId: "cursor" },
    ]);

    expect((await readHistory(file)).length).toBe(2);
    expect((await historyForSkill(file, "pdf")).map((entry) => entry.type)).toEqual([
      "ingest",
      "sync",
    ]);
  });

  it("returns an empty list for a missing history file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-history-empty-"));
    expect(await readHistory(path.join(dir, "missing.jsonl"))).toEqual([]);
  });
});
