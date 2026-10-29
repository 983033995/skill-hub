import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { readUsageReport } from "@skill-hub/core";
import { observeSearch, withUsageScope } from "./usage.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("records a 101-result search as one complete usage event", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "skill-hub-router-usage-"));
  roots.push(root);
  const file = path.join(root, "usage.jsonl");
  vi.stubEnv("SKILL_HUB_USAGE_LOG", file);
  const results = Array.from({ length: 101 }, (_, index) => ({ name: `skill-${index}` }));

  const result = await withUsageScope("cli", () => observeSearch(async () => ({ results })));
  const lines = (await readFile(file, "utf8")).trim().split("\n");
  const report = await readUsageReport({ file, now: new Date(Date.now() + 1000) });

  expect(result.results).toEqual(results);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!).candidates).toEqual(results.map((skill) => skill.name));
  expect(report).toMatchObject({ complete: true, searchCalls: 1 });
  expect(report.skills).toHaveLength(101);
  expect(report.skills.every((skill) => skill.appearances === 1)).toBe(true);
});
