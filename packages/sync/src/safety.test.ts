import { mkdtemp, mkdir, writeFile, readFile, symlink, realpath, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parseSkillMd } from "@skill-hub/core";
import { defaultHubConfig } from "@skill-hub/core";
import { planSync } from "./plan.js";
import { applySync } from "./apply.js";
import { verifySync } from "./verify.js";

const fault = vi.hoisted(() => ({ target: "" }));
vi.mock("node:fs/promises", async (load) => {
  const actual = await load<typeof import("node:fs/promises")>();
  return {
    ...actual,
    symlink: vi.fn(async (source: string, target: string) => {
      if (fault.target === target) {
        fault.target = "";
        throw new Error("simulated symlink failure");
      }
      return actual.symlink(source, target);
    }),
  };
});
afterEach(() => {
  fault.target = "";
});
async function setup(mode: "copy" | "symlink" = "symlink") {
  const root = await mkdtemp(path.join(tmpdir(), "hub-sync-safe-"));
  const canonical = path.join(root, "canonical");
  const source = path.join(canonical, "alpha");
  const agent = path.join(root, "agent");
  await mkdir(source, { recursive: true });
  await mkdir(agent);
  await writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: alpha\ndescription: testing\n---\nbody",
  );
  await writeFile(path.join(source, "script"), "one");
  const config = defaultHubConfig();
  config.canonical_dir = canonical;
  config.agents = [{ id: "test", skills_dir: agent, enabled: true }];
  config.sync.mode = mode;
  return {
    root,
    source,
    config,
    meta: await parseSkillMd(path.join(source, "SKILL.md")),
    target: path.join(agent, "alpha"),
  };
}
it("copy plan and verify notice attachment changes with unchanged SKILL.md", async () => {
  const s = await setup("copy");
  const plan = await planSync(s.config, [s.meta]);
  expect((await applySync(plan)).failed).toBe(0);
  expect((await verifySync(s.config, [s.meta])).ok).toBe(true);
  await writeFile(path.join(s.target, "script"), "local");
  expect((await verifySync(s.config, [s.meta])).summary.content_mismatch).toBe(1);
  expect((await planSync(s.config, [s.meta])).summary.conflict).toBe(1);
});
for (const type of ["file", "directory", "symlink"] as const) {
  it(`preserves ${type} appearing after create preview`, async () => {
    const s = await setup();
    const plan = await planSync(s.config, [s.meta]);
    if (type === "file") await writeFile(s.target, "keep");
    if (type === "directory") await mkdir(s.target);
    if (type === "symlink") await symlink(s.source, s.target);
    expect((await applySync(plan)).failed).toBe(1);
    expect(await lstat(s.target)).toBeTruthy();
    if (type === "file") expect(await readFile(s.target, "utf8")).toBe("keep");
  });
}
it("restores original directory after replacement failure and never overwrites prior stash", async () => {
  const s = await setup();
  await mkdir(s.target);
  await writeFile(path.join(s.target, "original"), "keep");
  const stash = path.join(s.root, "stash");
  const plan = await planSync(s.config, [s.meta], { replaceReal: true });
  fault.target = s.target;
  expect((await applySync(plan, { replaceStashDir: stash })).failed).toBe(1);
  expect(await readFile(path.join(s.target, "original"), "utf8")).toBe("keep");
  await mkdir(path.join(stash, "test/alpha"), { recursive: true });
  await writeFile(path.join(stash, "test/alpha/old"), "history");
  expect((await applySync(plan, { replaceStashDir: stash })).failed).toBe(1);
  expect(await readFile(path.join(stash, "test/alpha/old"), "utf8")).toBe("history");
  expect(await readFile(path.join(s.target, "original"), "utf8")).toBe("keep");
});
it("rejects missing sources, path traversal, self projection and sources outside canonical", async () => {
  const s = await setup();
  for (const meta of [
    { ...s.meta, name: "../bad" },
    { ...s.meta, path: path.join(s.root, "absent") },
    { ...s.meta, path: s.target },
  ]) {
    expect((await planSync(s.config, [meta])).summary.conflict).toBe(1);
  }
  s.config.agents[0]!.skills_dir = s.config.canonical_dir;
  expect((await planSync(s.config, [s.meta])).summary.conflict).toBe(1);
});
it("supports canonical root symlinks and physical catalog paths", async () => {
  const s = await setup();
  const alias = path.join(s.root, "hub-link");
  await symlink(s.config.canonical_dir, alias);
  s.config.canonical_dir = alias;
  s.meta.path = await realpath(s.source);
  const plan = await planSync(s.config, [s.meta]);
  expect(plan.summary.create).toBe(1);
  expect((await applySync(plan)).failed).toBe(0);
  expect((await verifySync(s.config, [s.meta])).ok).toBe(true);
});
