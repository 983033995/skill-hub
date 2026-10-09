import { mkdtemp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runIngest } from "../../apps/cli/src/commands/ingest.js";
import { readCatalog, parseSkillMd, hashSkillTree, materializeToCanonical } from "@skill-hub/core";

async function skill(dir: string, name: string, script = "one") {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: useful skill\n---\nbody`,
  );
  await writeFile(path.join(dir, "script.sh"), script);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "hub-ingest-safety-"));
  vi.stubEnv("SKILL_HUB_HOME", path.join(root, "hub"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  return root;
}
async function ingest(root: string, sources: string[], extra = {}) {
  return runIngest({
    json: true,
    sources,
    dryRun: false,
    materialize: true,
    conflictMode: "report",
    canonicalDir: path.join(root, "custom-skills"),
    ...extra,
  });
}
describe("incremental ingest safety", () => {
  it("retains earlier catalog entries, uses configured canonical, previews without writes", async () => {
    const root = await setup();
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    await skill(a, "alpha");
    await skill(b, "beta");
    expect(await ingest(root, [a])).toBe(0);
    expect(await ingest(root, [b])).toBe(0);
    const catalog = await readCatalog(path.join(root, "hub/catalog.json"));
    expect(Object.keys(catalog.skills).sort()).toEqual(["alpha", "beta"]);
    expect(catalog.skills.alpha?.path).toBe(path.join(root, "custom-skills/alpha"));
    const before = await readdir(path.join(root, "custom-skills"));
    const history = await readFile(path.join(root, "hub/history.jsonl"), "utf8");
    await skill(path.join(root, "c"), "gamma");
    expect(await ingest(root, [path.join(root, "c")], { dryRun: true })).toBe(0);
    expect(await readdir(path.join(root, "custom-skills"))).toEqual(before);
    expect(await readFile(path.join(root, "hub/history.jsonl"), "utf8")).toBe(history);
  });
  it("blocks same markdown with different scripts and requires explicit source selection", async () => {
    const root = await setup();
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    await skill(a, "alpha", "one");
    await skill(b, "alpha", "two");
    expect(await ingest(root, [a, b])).toBe(2);
    await expect(readCatalog(path.join(root, "hub/catalog.json"))).rejects.toThrow();
    expect(await ingest(root, [a, b], { prefer: a })).toBe(0);
    expect(await readFile(path.join(root, "custom-skills/alpha/script.sh"), "utf8")).toBe("one");
    expect(await ingest(root, [b])).toBe(2);
    expect(await readFile(path.join(root, "custom-skills/alpha/script.sh"), "utf8")).toBe("one");
  });
  it("refuses a corrupt catalog before writing skills", async () => {
    const root = await setup();
    const a = path.join(root, "a");
    await skill(a, "alpha");
    await mkdir(path.join(root, "hub"));
    await writeFile(path.join(root, "hub/catalog.json"), "broken");
    await expect(ingest(root, [a])).rejects.toThrow();
    expect(await readFile(path.join(root, "hub/catalog.json"), "utf8")).toBe("broken");
  });
  it("archives full previous content when explicit replacement is requested", async () => {
    const root = await setup();
    const a = path.join(root, "a");
    await skill(a, "alpha");
    const dest = path.join(root, "skills");
    await materializeToCanonical([await parseSkillMd(path.join(a, "SKILL.md"))], dest);
    const old = await hashSkillTree(path.join(dest, "alpha"));
    await writeFile(path.join(a, "script.sh"), "two");
    const result = await materializeToCanonical(
      [await parseSkillMd(path.join(a, "SKILL.md"))],
      dest,
      { force: true },
    );
    expect(result.failed).toEqual([]);
    expect(result.backups).toHaveLength(1);
    expect(await hashSkillTree(result.backups[0]!.path)).toBe(old);
    expect(await readFile(path.join(dest, "alpha/script.sh"), "utf8")).toBe("two");
  });
});
