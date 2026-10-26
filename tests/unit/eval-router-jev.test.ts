import type { SkillMeta } from "@skill-hub/core";
import { Bm25Router } from "@skill-hub/router";
import { describe, expect, it } from "vitest";
import {
  evaluateBm25Baseline,
  findMissingExpectedSkills,
  selectEvaluationTasks,
} from "../../scripts/eval-router-jev.mjs";

function skill(name: string, description: string): SkillMeta {
  return {
    name,
    description,
    path: `/synthetic/${name}`,
    hash: `sha256:${"0".repeat(64)}`,
    mtimeMs: 0,
  };
}

describe("opt-in Jev evaluation BM25 comparator", () => {
  it("detects missing labels in the explicit catalog before any online call", () => {
    const tasks = [
      { expectedAnyOf: ["found", "missing-z"] },
      { expectedAnyOf: ["missing-a", "missing-z"] },
    ];
    expect(findMissingExpectedSkills(tasks, new Set(["found"]))).toEqual([
      "missing-a",
      "missing-z",
    ]);
  });

  it("round-robins low request budgets across task kinds and preserves source order", () => {
    const cases = [
      { id: "r1", kind: "required" },
      { id: "r2", kind: "required" },
      { id: "r3", kind: "required" },
      { id: "n1", kind: "none" },
      { id: "a1", kind: "ambiguous" },
      { id: "a2", kind: "ambiguous" },
    ];

    expect(selectEvaluationTasks(cases, 0)).toEqual([]);
    expect(selectEvaluationTasks(cases, 1).map((task) => task.id)).toEqual(["r1"]);
    expect(selectEvaluationTasks(cases, 3).map((task) => task.id)).toEqual(["r1", "n1", "a1"]);
    expect(selectEvaluationTasks(cases, 5).map((task) => task.id)).toEqual([
      "r1",
      "n1",
      "a1",
      "r2",
      "a2",
    ]);
    expect(selectEvaluationTasks(cases, 99).map((task) => task.id)).toEqual([
      "r1",
      "n1",
      "a1",
      "r2",
      "a2",
      "r3",
    ]);
  });

  it("returns a local BM25 top-five and measured query latency without a service call", async () => {
    const router = new Bm25Router();
    await router.build([
      skill("pdf-merge", "Merge and combine PDF documents."),
      skill("music-video", "Create videos from music tracks."),
    ]);

    const result = await evaluateBm25Baseline(router, {
      query: "merge PDF documents",
      expectedAnyOf: ["pdf-merge"],
      kind: "required",
    });

    expect(result.top5[0]).toBe("pdf-merge");
    expect(result.top5).toHaveLength(1);
    expect(Number.isFinite(result.latencyMs)).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
