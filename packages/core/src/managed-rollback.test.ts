import { mkdtemp, mkdir, writeFile, readFile, readdir, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { manageSkills } from "./managed.js";

const fault = vi.hoisted(() => ({ failPublish: false, failLock: false, failRestore: false }));
vi.mock("node:fs/promises", async (load) => {
  const actual = await load<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(async (source: string, dest: string) => {
      if (fault.failPublish && source.includes("/staging/beta")) {
        fault.failPublish = false;
        throw new Error("simulated publish failure");
      }
      if (fault.failLock && dest.endsWith("managed-lock.json")) {
        fault.failLock = false;
        throw new Error("simulated lock write failure");
      }
      if (fault.failRestore && source.includes("/rollback/"))
        throw new Error("simulated restore failure");
      return actual.rename(source, dest);
    }),
  };
});
afterEach(() => {
  Object.assign(fault, { failPublish: false, failLock: false, failRestore: false });
});
async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), "hub-rollback-"));
  const source = path.join(root, "source");
  const canonicalDir = path.join(root, "canonical");
  const stateDir = path.join(root, "state");
  for (const name of ["alpha", "beta"]) {
    await mkdir(path.join(source, name), { recursive: true });
    await writeFile(
      path.join(source, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: testing\n---\nbody`,
    );
    await writeFile(path.join(source, name, "script"), "old");
  }
  await manageSkills({ action: "install", source, canonicalDir, stateDir, dryRun: false });
  const oldLock = await readFile(path.join(stateDir, "managed-lock.json"), "utf8");
  for (const name of ["alpha", "beta"]) await writeFile(path.join(source, name, "script"), "new");
  return { root, source, canonicalDir, stateDir, oldLock };
}
for (const faultName of ["failPublish", "failLock"] as const) {
  it(`restores all original skills and lock when ${faultName} happens`, async () => {
    const workspace = await setup();
    fault[faultName] = true;
    await expect(
      manageSkills({ action: "update", ...workspace, dryRun: false, source: undefined }),
    ).rejects.toThrow("simulated");
    for (const name of ["alpha", "beta"])
      expect(await readFile(path.join(workspace.canonicalDir, name, "script"), "utf8")).toBe("old");
    expect(await readFile(path.join(workspace.stateDir, "managed-lock.json"), "utf8")).toBe(
      workspace.oldLock,
    );
  });
}
it("preserves recovery artifacts when rollback itself fails", async () => {
  const workspace = await setup();
  fault.failPublish = true;
  fault.failRestore = true;
  await expect(
    manageSkills({ action: "update", ...workspace, dryRun: false, source: undefined }),
  ).rejects.toThrow("保留事务目录");
  const transactions = (await readdir(workspace.canonicalDir)).filter((name) =>
    name.startsWith(".managed-txn-"),
  );
  expect(transactions).toHaveLength(1);
  expect(await readdir(path.join(workspace.stateDir, "backups"))).toHaveLength(1);
  expect(vi.isMockFunction(rename)).toBe(true);
});
