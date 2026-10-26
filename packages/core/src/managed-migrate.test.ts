import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { manageSkills, type ManageSkillsOptions } from "./managed.js";
import { hashSkillTree } from "./tree.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace() {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "hub-migrate-")));
  roots.push(root);
  const source = path.join(root, "old");
  const next = path.join(root, "new");
  const canonicalDir = path.join(root, "canonical");
  const stateDir = path.join(root, "state");
  await mkdir(source);
  await writeFile(
    path.join(source, "SKILL.md"),
    "---\nname: alpha\ndescription: Synthetic skill\n---\nbody\n",
  );
  await writeFile(path.join(source, "run.sh"), "echo synthetic\n", { mode: 0o644 });
  await mkdir(path.join(source, "empty"));
  await manageSkills({
    action: "install",
    source,
    canonicalDir,
    stateDir,
    overlayOf: "base",
    dryRun: false,
  });
  await rename(source, next);
  const options: ManageSkillsOptions = {
    action: "migrate-source",
    source: next,
    names: ["alpha"],
    canonicalDir,
    stateDir,
  };
  const lockPath = path.join(stateDir, "managed-lock.json");
  return { root, source, next, canonicalDir, stateDir, options, lockPath };
}
async function snapshot(ws: Awaited<ReturnType<typeof workspace>>) {
  return Promise.all([ws.canonicalDir, ws.stateDir].map(hashSkillTree));
}

it("diagnoses a missing old source and previews/applies a content-preserving migration with rollback evidence", async () => {
  const ws = await workspace();
  const checked = await manageSkills({ ...ws.options, action: "check-updates", source: undefined });
  expect(checked).toMatchObject({
    complete: false,
    items: [
      {
        localStatus: "clean",
        upstreamStatus: "unknown",
        updateAvailable: null,
        applyBlocked: true,
      },
    ],
  });
  expect(checked.issues![0]).toMatchObject({
    phase: "upstream",
    path: ws.source,
    hint: expect.stringContaining("migrate-source"),
  });
  const before = await snapshot(ws);
  const originalLock = await readFile(ws.lockPath, "utf8");
  const originalDir = await stat(path.join(ws.canonicalDir, "alpha"));
  const preview = await manageSkills(ws.options);
  expect(preview.items).toMatchObject([
    {
      action: "migrate-source",
      changes: [],
      sourceLockChanged: true,
      previousSource: { path: ws.source, overlayOf: "base" },
      nextSource: { path: ws.next, overlayOf: "base" },
    },
  ]);
  expect(preview.planToken).toBe((await manageSkills(ws.options)).planToken);
  expect(await snapshot(ws)).toEqual(before);
  const applied = await manageSkills({
    ...ws.options,
    dryRun: false,
    planToken: preview.planToken,
  });
  expect(applied.items[0]).toMatchObject({
    action: "migrate-source",
    status: "applied",
    backupPath: expect.any(String),
  });
  const currentDir = await stat(path.join(ws.canonicalDir, "alpha"));
  expect([currentDir.dev, currentDir.ino]).toEqual([originalDir.dev, originalDir.ino]);
  const lock = JSON.parse(await readFile(ws.lockPath, "utf8"));
  expect(lock.skills.alpha.path).toBe(ws.next);
  expect(lock.skills.alpha.treeHash).toBe(JSON.parse(originalLock).skills.alpha.treeHash);
  const noOp = await manageSkills(ws.options);
  expect(noOp.items[0]).toMatchObject({ action: "noop", sourceLockChanged: false });
  const unchanged = await snapshot(ws);
  const repeated = await manageSkills({ ...ws.options, dryRun: false, planToken: noOp.planToken });
  expect(repeated.items[0]).toMatchObject({ status: "unchanged", backupPath: undefined });
  expect(await snapshot(ws)).toEqual(unchanged);
  const rollback = await manageSkills({
    action: "rollback",
    names: ["alpha"],
    backupPath: applied.items[0]!.backupPath,
    canonicalDir: ws.canonicalDir,
    stateDir: ws.stateDir,
    dryRun: false,
  });
  expect(JSON.parse(await readFile(ws.lockPath, "utf8"))).toEqual(JSON.parse(originalLock));
  expect(await hashSkillTree(ws.canonicalDir)).toBe(before[0]);
  expect(rollback.items[0]!.backupPath).toBeTruthy();
});

it("requires one managed target, explicit source and a matching migration token", async () => {
  const ws = await workspace();
  const preview = await manageSkills(ws.options);
  const before = await snapshot(ws);
  for (const overrides of [
    { source: undefined },
    { names: undefined },
    { names: [] },
    { names: ["alpha", "beta"] },
    { overlayOf: "other" },
    { backupPath: "unused" },
    { dryRun: false },
    { planToken: "bad" },
  ]) {
    await expect(manageSkills({ ...ws.options, ...overrides })).rejects.toMatchObject({
      code: "E_CONFIG",
    });
  }
  await expect(manageSkills({ ...ws.options, names: ["unknown"] })).rejects.toMatchObject({
    code: "E_NOT_FOUND",
  });
  await expect(
    manageSkills({ ...ws.options, dryRun: false, planToken: `sha256:${"0".repeat(64)}` }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  await rename(ws.next, ws.source);
  const update = await manageSkills({ ...ws.options, action: "update", source: undefined });
  await expect(
    manageSkills({ ...ws.options, source: ws.source, planToken: update.planToken, dryRun: false }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  expect(update.planToken).not.toBe(preview.planToken);
  expect(await snapshot(ws)).toEqual(before);
});

it("rejects local edits even when the new source matches the edited tree", async () => {
  const ws = await workspace();
  for (const dir of [ws.next, path.join(ws.canonicalDir, "alpha")])
    await writeFile(path.join(dir, "custom"), "edited");
  const before = await snapshot(ws);
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_CONFLICT" });
  expect(await snapshot(ws)).toEqual(before);
});

it("rejects source content, execution mode and empty-directory differences", async () => {
  const ws = await workspace();
  const before = await snapshot(ws);
  await chmod(path.join(ws.next, "run.sh"), 0o755);
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_CONFLICT" });
  await chmod(path.join(ws.next, "run.sh"), 0o644);
  await mkdir(path.join(ws.next, "another-empty"));
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_CONFLICT" });
  await rm(path.join(ws.next, "another-empty"), { recursive: true });
  await writeFile(path.join(ws.next, "new-file"), "next version");
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_CONFLICT" });
  expect(await snapshot(ws)).toEqual(before);
});

it("binds old/new source locks and Hub locations, and rejects source drift after preview", async () => {
  const ws = await workspace();
  const preview = await manageSkills(ws.options);
  const before = await snapshot(ws);
  const other = path.join(ws.root, "other-source");
  await cp(ws.next, other, { recursive: true });
  await expect(
    manageSkills({ ...ws.options, source: other, planToken: preview.planToken, dryRun: false }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  for (const key of ["canonicalDir", "stateDir"] as const) {
    const alternate = path.join(ws.root, key);
    await cp(ws[key], alternate, { recursive: true });
    await expect(
      manageSkills({
        ...ws.options,
        [key]: alternate,
        planToken: preview.planToken,
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
  }
  expect(await snapshot(ws)).toEqual(before);
  const lock = JSON.parse(await readFile(ws.lockPath, "utf8"));
  lock.skills.alpha.path = path.join(ws.root, "different-old-source");
  await writeFile(ws.lockPath, JSON.stringify(lock));
  const changed = await snapshot(ws);
  await expect(
    manageSkills({ ...ws.options, planToken: preview.planToken, dryRun: false }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  await writeFile(path.join(ws.next, "drift"), "changed after preview");
  await expect(
    manageSkills({ ...ws.options, planToken: preview.planToken, dryRun: false }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  expect(await snapshot(ws)).toEqual(changed);
});

it("rejects self-managed sources, missing canonical targets and mismatched names", async () => {
  const ws = await workspace();
  await expect(
    manageSkills({ ...ws.options, source: path.join(ws.canonicalDir, "alpha") }),
  ).rejects.toMatchObject({ code: "E_PATH" });
  const alias = path.join(ws.root, "self-alias");
  await symlink(path.join(ws.canonicalDir, "alpha"), alias);
  await expect(manageSkills({ ...ws.options, source: alias })).rejects.toMatchObject({
    code: "E_PATH",
  });
  await writeFile(
    path.join(ws.next, "SKILL.md"),
    "---\nname: beta\ndescription: Other skill\n---\n",
  );
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_NOT_FOUND" });
  await rm(path.join(ws.canonicalDir, "alpha"), { recursive: true });
  await expect(manageSkills(ws.options)).rejects.toMatchObject({ code: "E_PATH" });
});
