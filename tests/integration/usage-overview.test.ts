import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import {
  appendUsage,
  buildCatalog,
  estimateContext,
  scanSkills,
  writeCatalog,
  hashSkillTree,
} from "@skill-hub/core";
import { skillUsageOverview, type UsageOrigin } from "@skill-hub/router";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function workspace() {
  const home = await mkdtemp(path.join(tmpdir(), "hub-usage-overview-"));
  roots.push(home);
  for (let index = 0; index < 26; index++) {
    const name = `skill-${String(index).padStart(2, "0")}`;
    const target = path.join(home, "skills", name);
    await mkdir(target, { recursive: true });
    await writeFile(
      path.join(target, "SKILL.md"),
      `---\nname: ${name}\ndescription: Synthetic ${index === 25 ? "video" : "document"} fixture\n---\n${"body ".repeat(index + 1)}`,
    );
  }
  await writeCatalog(
    path.join(home, "catalog.json"),
    buildCatalog(await scanSkills(path.join(home, "skills"))),
  );
  await writeFile(
    path.join(home, "config.yaml"),
    `version: 1\ncanonical_dir: ${home}/skills\nindex_dir: ${home}/index\nbackup_dir: ${home}/backups\nagents: []\n`,
  );
  vi.stubEnv("SKILL_HUB_HOME", home);
  vi.stubEnv("SKILL_HUB_CONFIG", "");
  const file = path.join(home, "usage.jsonl");
  vi.stubEnv("SKILL_HUB_USAGE_LOG", file);
  const now = new Date();
  const write = async (
    name: string,
    count: number,
    origin: UsageOrigin = "mcp",
    phase: "initial" | "continuation" = "initial",
    at = new Date(now.getTime() - 1000).toISOString(),
  ) => {
    for (let i = 0; i < count; i++)
      await appendUsage(file, {
        version: 1,
        at,
        origin,
        operation: "read",
        success: true,
        name,
        kind: "body",
        phase,
        content: estimateContext("abcd"),
      });
  };
  await write("skill-25", 8);
  await write("skill-00", 2);
  await write("skill-00", 20, "mcp", "continuation");
  await write("skill-00", 5, "web");
  await write("removed-skill", 9);
  await write(
    "skill-01",
    1,
    "mcp",
    "initial",
    new Date(now.getTime() - 40 * 86400000).toISOString(),
  );
  return { home, file, now, write };
}

it("sorts the whole catalog before paging and keeps the denominator fixed across filters", async () => {
  const ws = await workspace();
  const before = await hashSkillTree(ws.home);
  const options = { days: 30, origin: "mcp" as const, now: ws.now };
  const result = await skillUsageOverview({ ...options, limit: 1 });
  expect(result).toMatchObject({
    complete: true,
    total: 26,
    nextOffset: 1,
    usage: { totalInitialReads: 10 },
    items: [{ name: "skill-25", usageRate: 0.8, initialBodyReads: 8 }],
  });
  expect((await skillUsageOverview({ ...options, offset: 1, limit: 1 })).items[0]).toMatchObject({
    name: "skill-00",
    usageRate: 0.2,
    continuationBodyReads: 20,
  });
  expect(await skillUsageOverview({ ...options, query: "video", status: "read" })).toMatchObject({
    total: 1,
    usage: { totalInitialReads: 10 },
    items: [{ name: "skill-25", usageRate: 0.8 }],
  });
  expect(
    (await skillUsageOverview({ ...options, tag: result.items[0]!.tags[0]!.id, query: "skill-25" }))
      .items[0]!.usageRate,
  ).toBe(0.8);
  expect(
    (await skillUsageOverview({ ...options, sort: "usage-asc", limit: 1 })).items[0]!.name,
  ).toBe("skill-00");
  expect(await hashSkillTree(ws.home)).toBe(before);
});

it("distinguishes unobserved from zero and separates dates, sources and missing denominators", async () => {
  const ws = await workspace();
  const base = { days: 30, origin: "mcp" as const, now: ws.now };
  const unknown = await skillUsageOverview({ ...base, status: "unobserved" });
  expect(unknown.total).toBe(24);
  expect(
    unknown.items.every((row) => row.usageRate === null && row.initialBodyReads === null),
  ).toBe(true);
  expect(await skillUsageOverview({ ...base, origin: "web", limit: 1 })).toMatchObject({
    usage: { totalInitialReads: 5 },
    items: [{ name: "skill-00", usageRate: 1 }],
  });
  expect((await skillUsageOverview({ now: ws.now, origin: "mcp" })).usage.totalInitialReads).toBe(
    11,
  );
  expect(await skillUsageOverview({ ...base, origin: "cli", limit: 1 })).toMatchObject({
    usage: { totalInitialReads: 0 },
    items: [{ usageRate: null }],
  });
  await rm(ws.file);
  expect(await skillUsageOverview({ ...base, limit: 1 })).toMatchObject({
    usage: { exists: false },
    items: [{ initialBodyReads: null, usageRate: null }],
  });
});

it("keeps costs and healthy log rows beside errors and sorts unknown costs last in both directions", async () => {
  const ws = await workspace();
  await rm(path.join(ws.home, "skills", "skill-25", "SKILL.md"));
  await appendFile(ws.file, "broken\n");
  const report = await skillUsageOverview({
    days: 30,
    origin: "mcp",
    sort: "tokens-desc",
    now: ws.now,
    limit: 100,
  });
  expect(report).toMatchObject({
    complete: false,
    usage: { complete: false, issueCount: 1 },
    context: { complete: false, readable: 25 },
  });
  expect(report.items.at(-1)).toMatchObject({
    name: "skill-25",
    cost: { fullBody: null, errorCode: "E_PATH" },
  });
  expect(
    (await skillUsageOverview({ sort: "tokens-asc", now: ws.now, limit: 100 })).items.at(-1)!.name,
  ).toBe("skill-25");
  await rm(ws.file);
  await mkdir(ws.file);
  expect(await skillUsageOverview({ now: ws.now, limit: 1 })).toMatchObject({
    complete: false,
    usage: { complete: false, errorCode: expect.any(String) },
    items: [{ initialBodyReads: null }],
  });
});

it("rejects invalid filters and empty results preserve the sample denominator", async () => {
  const ws = await workspace();
  for (const options of [
    { days: 0 },
    { limit: 0 },
    { offset: -1 },
    { origin: "bad" },
    { sort: "bad" },
    { status: "bad" },
  ]) {
    await expect(
      skillUsageOverview(options as Parameters<typeof skillUsageOverview>[0]),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
  }
  expect(
    await skillUsageOverview({ days: 30, origin: "mcp", query: "not-found", now: ws.now }),
  ).toMatchObject({ total: 0, items: [], usage: { totalInitialReads: 10 } });
});

it("serves read-only HTTP filters with no arbitrary log path and does not count inspecting the report", async () => {
  const ws = await workspace();
  vi.stubEnv("SKILL_HUB_WEB_NO_START", "1");
  const { createWebServer } = await import("../../apps/web/src/index.js");
  const server = createWebServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/api/usage-overview`;
    const before = await readFile(ws.file, "utf8");
    const response = await fetch(`${url}?days=30&origin=mcp&sort=usage-desc&limit=1`);
    expect(response.ok).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      total: 26,
      items: [{ name: "skill-25", usageRate: 0.8 }],
    });
    for (const query of [
      "days=0",
      "sort=bad",
      "origin=bad",
      "file=/private/log.jsonl",
      "limit=0",
      "days=30x",
    ])
      expect((await fetch(`${url}?${query}`)).status).toBe(400);
    expect((await fetch(url, { method: "POST" })).status).toBe(405);
    expect(await readFile(ws.file, "utf8")).toBe(before);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
