import { access, cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const git = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: git.execFile }));

import { manageSkills, MANAGED_LOCK_FILENAME, type ManagedSourceLock } from "./managed.js";
import { hashSkillTree } from "./tree.js";

const roots: string[] = [];
const clones: string[] = [];
const fetchedRefs: string[] = [];
const OLD = "1".repeat(40);
const NEW = "2".repeat(40);
let fixture = "";
let revision = NEW;
let failGit = false;

beforeEach(() => {
  clones.length = 0;
  fetchedRefs.length = 0;
  revision = NEW;
  failGit = false;
  git.execFile.mockReset();
  git.execFile.mockImplementation(
    (_command: unknown, rawArgs: unknown, _options: unknown, rawCallback: unknown) => {
      const args = rawArgs as string[];
      const callback = rawCallback as (
        error: Error | null,
        result?: { stdout: string; stderr: string },
      ) => void;
      // Mock the process boundary, not the hashing/source reader: no Git/network execution.
      void (async () => {
        if (args.includes("clone")) {
          const target = args.at(-1)!;
          clones.push(target);
          if (failGit) throw new Error("synthetic network timeout");
          await cp(fixture, target, { recursive: true });
        }
        if (args.includes("fetch")) fetchedRefs.push(args.at(-1)!);
        callback(null, { stdout: args.includes("rev-parse") ? revision : "", stderr: "" });
      })().catch((error: Error) => callback(error));
    },
  );
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function skill(root: string, name: string, body = "old") {
  const target = path.join(root, name);
  await mkdir(target, { recursive: true });
  await writeFile(
    path.join(target, "SKILL.md"),
    `---\nname: ${name}\ndescription: Synthetic ${name}\n---\n${body}\n`,
  );
  return hashSkillTree(target);
}

async function workspace(ref = "main") {
  const root = await mkdtemp(path.join(tmpdir(), "hub-check-git-"));
  roots.push(root);
  const canonicalDir = path.join(root, "canonical");
  const stateDir = path.join(root, "state");
  fixture = path.join(root, "remote-fixture");
  const entries: Record<string, ManagedSourceLock> = {};
  for (const name of ["alpha", "beta"]) {
    const treeHash = await skill(canonicalDir, name);
    await skill(fixture, name, name === "alpha" && ref === "main" ? "new" : "old");
    entries[name] = {
      type: "github",
      url: "https://github.com/fixture/skills.git",
      ref,
      commit: ref === "main" ? OLD : ref,
      subpath: name,
      treeHash,
    };
  }
  await mkdir(stateDir);
  await writeFile(
    path.join(stateDir, MANAGED_LOCK_FILENAME),
    JSON.stringify({ version: 1, skills: entries }),
  );
  return { root, canonicalDir, stateDir, entries };
}

describe("GitHub read-only update checks", () => {
  it("migrates GitHub to local and back with pinned revisions, preserving content and rejecting moved commits", async () => {
    const ws = await workspace();
    const local = path.join(ws.root, "local-source");
    await cp(path.join(ws.canonicalDir, "alpha"), local, { recursive: true });
    const options = {
      action: "migrate-source" as const,
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
      names: ["alpha"],
      source: local,
    };
    const preview = await manageSkills(options);
    expect(preview.items[0]).toMatchObject({
      previousSource: { type: "github", commit: OLD },
      nextSource: { type: "local" },
    });
    await manageSkills({ ...options, dryRun: false, planToken: preview.planToken });
    expect(clones).toHaveLength(0); // The previous GitHub source need not be accessible.
    await writeFile(
      path.join(fixture, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: Synthetic alpha\n---\nold\n",
    );
    const gitOptions = { ...options, source: "fixture/new-skills", ref: "release" };
    const gitPreview = await manageSkills(gitOptions);
    expect(gitPreview.items[0]).toMatchObject({
      previousSource: { type: "local" },
      nextSource: { type: "github", ref: "release", commit: NEW },
    });
    revision = "3".repeat(40);
    const before = await hashSkillTree(ws.stateDir);
    await expect(
      manageSkills({ ...gitOptions, dryRun: false, planToken: gitPreview.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await hashSkillTree(ws.stateDir)).toBe(before);
    const fresh = await manageSkills(gitOptions);
    await manageSkills({ ...gitOptions, dryRun: false, planToken: fresh.planToken });
    expect(fetchedRefs.every((ref) => ref === "release")).toBe(true);
    for (const clone of clones) await expect(access(clone)).rejects.toThrow();
  });

  it("shares one repository/ref snapshot and reports upstream beside local modifications", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws.canonicalDir, "alpha", "custom.txt"), "local edit");
    const before = await hashSkillTree(ws.stateDir);
    const result = await manageSkills({
      action: "check-updates",
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
    });
    expect(clones).toHaveLength(1);
    expect(fetchedRefs).toEqual(["main"]);
    expect(result.complete).toBe(true);
    expect(result.items).toMatchObject([
      {
        name: "alpha",
        localStatus: "modified",
        upstreamStatus: "changed",
        updateAvailable: true,
        currentRevision: OLD,
        upstreamRevision: NEW,
      },
      {
        name: "beta",
        localStatus: "clean",
        upstreamStatus: "unchanged",
        updateAvailable: false,
        currentRevision: OLD,
        upstreamRevision: NEW,
      },
    ]);
    expect(await hashSkillTree(ws.stateDir)).toBe(before);
    for (const clone of clones) await expect(access(clone)).rejects.toThrow();
  });

  it("reuses a failed fetch diagnostic while continuing healthy local sources", async () => {
    const ws = await workspace();
    const gammaHash = await skill(ws.canonicalDir, "gamma");
    await skill(fixture, "gamma");
    ws.entries.gamma = { type: "local", path: fixture, subpath: "gamma", treeHash: gammaHash };
    await writeFile(
      path.join(ws.stateDir, MANAGED_LOCK_FILENAME),
      JSON.stringify({ version: 1, skills: ws.entries }),
    );
    failGit = true;
    const result = await manageSkills({
      action: "check-updates",
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
    });
    expect(clones).toHaveLength(1);
    expect(result.complete).toBe(false);
    expect(result.items).toMatchObject([
      {
        name: "alpha",
        upstreamStatus: "unknown",
        updateAvailable: null,
        errors: [{ phase: "upstream", code: "E_PATH" }],
      },
      {
        name: "beta",
        upstreamStatus: "unknown",
        updateAvailable: null,
        errors: [{ phase: "upstream", code: "E_PATH" }],
      },
      { name: "gamma", upstreamStatus: "unchanged", updateAvailable: false },
    ]);
    for (const clone of clones) await expect(access(clone)).rejects.toThrow();
  });

  it("checks the exact pinned SHA instead of following a moving branch", async () => {
    const pinned = "3".repeat(40);
    const ws = await workspace(pinned);
    revision = pinned;
    const result = await manageSkills({
      action: "check-updates",
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
    });
    expect(fetchedRefs).toEqual([pinned]);
    expect(result.complete).toBe(true);
    expect(
      result.items.every(
        (item) => item.upstreamRevision === pinned && item.updateAvailable === false,
      ),
    ).toBe(true);
  });

  it("invalidates update approval when a Git commit moves with identical Skill content", async () => {
    const ws = await workspace();
    const options = {
      action: "update" as const,
      names: ["beta"],
      canonicalDir: ws.canonicalDir,
      stateDir: ws.stateDir,
    };
    const preview = await manageSkills(options);
    expect(preview.items[0]).toMatchObject({
      action: "noop",
      changes: [],
      sourceLockChanged: true,
      currentRevision: OLD,
      upstreamRevision: NEW,
    });
    const before = await Promise.all([ws.canonicalDir, ws.stateDir].map(hashSkillTree));
    const originalDirectory = await stat(path.join(ws.canonicalDir, "beta"));
    revision = "4".repeat(40);
    await expect(
      manageSkills({ ...options, dryRun: false, planToken: preview.planToken }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await Promise.all([ws.canonicalDir, ws.stateDir].map(hashSkillTree))).toEqual(before);
    const fresh = await manageSkills(options);
    expect(fresh.planToken).not.toBe(preview.planToken);
    await manageSkills({ ...options, dryRun: false, planToken: fresh.planToken });
    expect(await hashSkillTree(ws.canonicalDir)).toBe(before[0]);
    const finalDirectory = await stat(path.join(ws.canonicalDir, "beta"));
    expect([finalDirectory.dev, finalDirectory.ino]).toEqual([
      originalDirectory.dev,
      originalDirectory.ino,
    ]);
    const lock = JSON.parse(await readFile(path.join(ws.stateDir, MANAGED_LOCK_FILENAME), "utf8"));
    expect(lock.skills.beta.commit).toBe(revision);
    expect(lock.skills.alpha.commit).toBe(OLD);
  });
});
