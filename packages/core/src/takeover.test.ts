import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { inspectTakeover } from "./takeover.js";

it("reports full-tree conflicts, managed links, plugin boundaries and broken links", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "hub-takeover-"));
  const canonical = path.join(root, "canonical");
  const agent = path.join(root, "agent");
  const plugin = path.join(root, "plugin");
  for (const dir of [canonical, agent, plugin]) await mkdir(dir);
  async function skill(dir: string, name: string, attachment: string) {
    await mkdir(dir);
    await writeFile(
      path.join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: testing\n---\nbody`,
    );
    await writeFile(path.join(dir, "attachment"), attachment);
  }
  await skill(path.join(canonical, "conflict"), "conflict", "one");
  await skill(path.join(agent, "conflict"), "conflict", "two");
  await skill(path.join(canonical, "ready"), "ready", "same");
  await symlink(path.join(canonical, "ready"), path.join(agent, "ready"));
  await skill(path.join(agent, "new"), "new", "new");
  await skill(path.join(plugin, "conflict"), "conflict", "plugin is separate");
  await symlink(path.join(root, "missing"), path.join(agent, "broken"));
  const report = await inspectTakeover(
    [
      { id: "hub", path: canonical, ownership: "canonical" },
      { id: "agent", path: agent, ownership: "agent" },
      { id: "plugin", path: plugin, ownership: "external" },
    ],
    canonical,
  );
  expect(report.summary).toMatchObject({
    uniqueSkills: 3,
    ready: 1,
    import: 1,
    conflicts: 1,
    external: 1,
    linkedToHub: 1,
    issues: 1,
  });
  expect(report.skills.find((s) => s.name === "conflict")?.variants).toHaveLength(2);
  expect(report.issues[0]?.path).toContain("broken");
});
