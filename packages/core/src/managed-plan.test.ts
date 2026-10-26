import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { manageSkills, MANAGED_LOCK_FILENAME } from "./managed.js";
import { hashSkillTree } from "./tree.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), "hub-update-plan-"));
  roots.push(root);
  const source = path.join(root, "source");
  const canonicalDir = path.join(root, "canonical");
  const stateDir = path.join(root, "state");
  for (const name of ["alpha", "beta"]) {
    await mkdir(path.join(source, name), { recursive: true });
    await writeFile(
      path.join(source, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: Synthetic fixture\n---\nold\n`,
    );
    await writeFile(path.join(source, name, "run.sh"), "echo fixture\n", { mode: 0o644 });
    await mkdir(path.join(source, name, "empty-old"));
    await writeFile(path.join(source, name, "remove.txt"), "old");
    await writeFile(path.join(source, name, "kind-change"), "file");
  }
  await manageSkills({ action: "install", source, canonicalDir, stateDir, dryRun: false });
  return { root, source, canonicalDir, stateDir };
}
function update(ws: Awaited<ReturnType<typeof workspace>>, names?: string[]) {
  return { action: "update" as const, canonicalDir: ws.canonicalDir, stateDir: ws.stateDir, names };
}
async function snapshot(ws: Awaited<ReturnType<typeof workspace>>) {
  return Promise.all([ws.canonicalDir, ws.stateDir].map(hashSkillTree));
}

describe("version-bound managed update plans", () => {
  it("previews content/mode/directory changes without bodies or state writes and produces stable tokens", async () => {
    const ws = await workspace();
    const source = path.join(ws.source, "alpha");
    await rm(path.join(source, "remove.txt"));
    await rm(path.join(source, "empty-old"), { recursive: true });
    await rm(path.join(source, "kind-change"));
    await mkdir(path.join(source, "kind-change"));
    await mkdir(path.join(source, "empty-new"));
    await writeFile(path.join(source, "new.txt"), "private fixture body must not be in Diff");
    await chmod(path.join(source, "run.sh"), 0o755);
    const before = await snapshot(ws);
    const first = await manageSkills(update(ws, ["alpha"]));
    expect(first.planToken).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.items[0]!.changes!.map(({ path, change }) => ({ path, change }))).toEqual([
      { path: "empty-new", change: "added" },
      { path: "empty-old", change: "removed" },
      { path: "kind-change", change: "modified" },
      { path: "new.txt", change: "added" },
      { path: "remove.txt", change: "removed" },
      { path: "run.sh", change: "modified" },
    ]);
    const mode = first.items[0]!.changes!.find((change) => change.path === "run.sh")!;
    expect(mode.before!.contentHash).toBe(mode.after!.contentHash);
    expect(mode.before!.executable).toBe(0);
    expect(mode.after!.executable).toBe(0o111);
    expect(JSON.stringify(first.items[0]!.changes)).not.toContain("private fixture body");
    await mkdir(path.join(source, ".git"));
    await writeFile(path.join(source, ".git", "ignored"), "metadata");
    expect((await manageSkills(update(ws, ["alpha"]))).planToken).toBe(first.planToken);
    expect(await snapshot(ws)).toEqual(before);
    const applied = await manageSkills({
      ...update(ws, ["alpha"]),
      dryRun: false,
      planToken: first.planToken,
    });
    expect(applied.planToken).toBe(first.planToken);
    expect(applied.items[0]!.backupPath).toBeTruthy();
    expect(await hashSkillTree(path.join(ws.canonicalDir, "alpha"))).toBe(
      first.items[0]!.sourceTreeHash,
    );
  });

  it("rejects missing, malformed and mismatched write tokens without changing content", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws.source, "alpha", "new.txt"), "next");
    const before = await snapshot(ws);
    await expect(manageSkills({ ...update(ws), dryRun: false })).rejects.toMatchObject({
      code: "E_CONFIG",
    });
    await expect(
      manageSkills({ ...update(ws), dryRun: false, planToken: "invalid" }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
    await expect(
      manageSkills({ ...update(ws), dryRun: false, planToken: `sha256:${"0".repeat(64)}` }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    await expect(
      manageSkills({
        ...update(ws, ["alpha", "alpha"]),
        dryRun: false,
        planToken: `sha256:${"0".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
    expect(await snapshot(ws)).toEqual(before);
    expect(await readdir(ws.stateDir)).toEqual([MANAGED_LOCK_FILENAME]);
  });

  it("rejects upstream and local drift after preview, then accepts a fresh upstream plan", async () => {
    const ws = await workspace();
    const file = path.join(ws.source, "alpha", "new.txt");
    await writeFile(file, "version two");
    const preview = await manageSkills(update(ws, ["alpha"]));
    const before = await snapshot(ws);
    await writeFile(file, "version three");
    await expect(
      manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: preview.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await snapshot(ws)).toEqual(before);
    const fresh = await manageSkills(update(ws, ["alpha"]));
    expect(fresh.planToken).not.toBe(preview.planToken);
    await writeFile(path.join(ws.canonicalDir, "alpha", "custom.txt"), "local edit");
    await expect(
      manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: fresh.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await readFile(path.join(ws.canonicalDir, "alpha", "custom.txt"), "utf8")).toBe(
      "local edit",
    );
    await rm(path.join(ws.canonicalDir, "alpha", "custom.txt"));
    await manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: fresh.planToken });
    expect(await readFile(path.join(ws.canonicalDir, "alpha", "new.txt"), "utf8")).toBe(
      "version three",
    );
  });

  it("binds the selected set and target location while preserving unrelated source-lock updates", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws.source, "alpha", "new.txt"), "next");
    const all = await manageSkills(update(ws));
    expect((await manageSkills(update(ws, ["beta", "alpha"]))).planToken).toBe(all.planToken);
    const alpha = await manageSkills(update(ws, ["alpha"]));
    expect(alpha.planToken).not.toBe(all.planToken);
    await expect(
      manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: all.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    const alternateCanonical = path.join(ws.root, "alternate-canonical");
    await cp(ws.canonicalDir, alternateCanonical, { recursive: true });
    await expect(
      manageSkills({
        ...update(ws, ["alpha"]),
        canonicalDir: alternateCanonical,
        dryRun: false,
        planToken: alpha.planToken,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    const alternateState = path.join(ws.root, "alternate-state");
    await cp(ws.stateDir, alternateState, { recursive: true });
    await expect(
      manageSkills({
        ...update(ws, ["alpha"]),
        stateDir: alternateState,
        dryRun: false,
        planToken: alpha.planToken,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    await mkdir(path.join(ws.source, "gamma"));
    await writeFile(
      path.join(ws.source, "gamma", "SKILL.md"),
      "---\nname: gamma\ndescription: Synthetic gamma\n---\nbody\n",
    );
    await manageSkills({
      action: "install",
      names: ["gamma"],
      source: ws.source,
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
      dryRun: false,
    });
    await expect(
      manageSkills({ ...update(ws), dryRun: false, planToken: all.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    await writeFile(path.join(ws.source, "beta", "beta-new.txt"), "unrelated update");
    const betaPlan = await manageSkills(update(ws, ["beta"]));
    await manageSkills({ ...update(ws, ["beta"]), dryRun: false, planToken: betaPlan.planToken });
    const betaHash = await hashSkillTree(path.join(ws.canonicalDir, "beta"));
    await manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: alpha.planToken });
    const lock = JSON.parse(await readFile(path.join(ws.stateDir, MANAGED_LOCK_FILENAME), "utf8"));
    expect(lock.skills.gamma).toBeTruthy();
    expect(lock.skills.beta.treeHash).toBe(betaHash);
  });

  it("binds the selected source-lock identity even when the installed content is unchanged", async () => {
    const ws = await workspace();
    const preview = await manageSkills(update(ws, ["alpha"]));
    const lockPath = path.join(ws.stateDir, MANAGED_LOCK_FILENAME);
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    lock.skills.alpha.overlayOf = "external-base";
    await writeFile(lockPath, JSON.stringify(lock));
    const before = await snapshot(ws);
    await expect(
      manageSkills({ ...update(ws, ["alpha"]), dryRun: false, planToken: preview.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await snapshot(ws)).toEqual(before);
  });
});
