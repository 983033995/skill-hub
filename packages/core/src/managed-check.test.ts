import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as scanner from "./scan.js";
import { SkillHubError } from "@skill-hub/shared";
import { manageSkills, MANAGED_LOCK_FILENAME } from "./managed.js";
import { hashSkillTree } from "./tree.js";

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace() {
  const root = await mkdtemp(path.join(tmpdir(), "hub-managed-check-"));
  roots.push(root);
  const source = path.join(root, "source");
  const canonicalDir = path.join(root, "canonical");
  const stateDir = path.join(root, "state");
  for (const name of ["alpha", "beta", "gamma"]) {
    await mkdir(path.join(source, name), { recursive: true });
    await writeFile(
      path.join(source, name, "SKILL.md"),
      `---\nname: ${name}\ndescription: Synthetic ${name}\n---\nOriginal\n`,
    );
  }
  await manageSkills({ action: "install", source, canonicalDir, stateDir, dryRun: false });
  return { root, source, canonicalDir, stateDir };
}

function locations(ws: { canonicalDir: string; stateDir: string }) {
  return { canonicalDir: ws.canonicalDir, stateDir: ws.stateDir };
}

describe("managed read-only observations", () => {
  it("keeps upstream updates visible beside local edits and isolates a failed source without writes", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws.canonicalDir, "alpha", "local.txt"), "local customization");
    await writeFile(path.join(ws.source, "alpha", "upstream.txt"), "new upstream content");
    await rm(path.join(ws.source, "beta"), { recursive: true });
    await writeFile(path.join(ws.stateDir, "catalog.json"), "sentinel catalog");
    await mkdir(path.join(ws.stateDir, "index"));
    await writeFile(path.join(ws.stateDir, "index", "sentinel"), "index");
    const agent = path.join(ws.root, "agent");
    await mkdir(agent);
    await writeFile(path.join(agent, "sentinel"), "agent");
    const before = await Promise.all([ws.canonicalDir, ws.stateDir, agent].map(hashSkillTree));

    const result = await manageSkills({ action: "check-updates", ...locations(ws) });

    expect(result).toMatchObject({ dryRun: true, complete: false, skills: [] });
    expect(result.items).toMatchObject([
      {
        name: "alpha",
        localStatus: "modified",
        upstreamStatus: "changed",
        updateAvailable: true,
        applyBlocked: true,
        errors: [],
      },
      {
        name: "beta",
        localStatus: "clean",
        upstreamStatus: "unknown",
        updateAvailable: null,
        applyBlocked: true,
        errors: [{ phase: "upstream", code: "E_PATH" }],
      },
      {
        name: "gamma",
        localStatus: "clean",
        upstreamStatus: "unchanged",
        updateAvailable: false,
        applyBlocked: false,
        errors: [],
      },
    ]);
    expect(result.items.every((item) => !Number.isNaN(Date.parse(item.checkedAt!)))).toBe(true);
    expect(await Promise.all([ws.canonicalDir, ws.stateDir, agent].map(hashSkillTree))).toEqual(
      before,
    );
    await expect(
      manageSkills({
        action: "update",
        names: ["alpha"],
        ...locations(ws),
        dryRun: false,
        planToken: `sha256:${"0".repeat(64)}`,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(await hashSkillTree(ws.canonicalDir)).toBe(before[0]);
  });

  it("compares upstream with the installed lock rather than an edited local tree", async () => {
    const ws = await workspace();
    await writeFile(path.join(ws.canonicalDir, "alpha", "custom.txt"), "custom");
    const result = await manageSkills({
      action: "check-updates",
      names: ["alpha"],
      ...locations(ws),
    });
    expect(result.complete).toBe(true);
    expect(result.items[0]).toMatchObject({
      localStatus: "modified",
      upstreamStatus: "unchanged",
      updateAvailable: false,
    });
    expect(result.items[0]!.currentTreeHash).not.toBe(result.items[0]!.sourceTreeHash);
    expect(result.items[0]!.lockedTreeHash).toBe(result.items[0]!.sourceTreeHash);
  });

  it("returns healthy list entries with explicit scan errors and missing locked entries", async () => {
    const ws = await workspace();
    await symlink(path.join(ws.root, "missing"), path.join(ws.canonicalDir, "broken"));
    await rm(path.join(ws.canonicalDir, "beta"), { recursive: true });
    const result = await manageSkills({ action: "list", ...locations(ws) });
    expect(result.complete).toBe(false);
    expect(result.skills.map((skill) => skill.name)).toEqual(["alpha", "gamma"]);
    expect(result.items.find((item) => item.name === "beta")).toMatchObject({ status: "missing" });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: "scan", path: path.join(result.canonicalDir, "broken") }),
        expect.objectContaining({ phase: "local", name: "beta", code: "E_NOT_FOUND" }),
      ]),
    );
    expect(await readFile(path.join(ws.canonicalDir, "alpha", "SKILL.md"), "utf8")).toContain(
      "Original",
    );
  });

  it("does not follow an unsafe canonical Skill for list or block other entries", async () => {
    const ws = await workspace();
    await rm(path.join(ws.canonicalDir, "alpha"), { recursive: true });
    await symlink(path.join(ws.source, "alpha"), path.join(ws.canonicalDir, "alpha"));
    const result = await manageSkills({ action: "list", ...locations(ws) });
    expect(result.complete).toBe(false);
    expect(result.items.find((item) => item.name === "alpha")).toMatchObject({ status: "blocked" });
    expect(result.items.find((item) => item.name === "gamma")).toMatchObject({ status: "present" });
    expect(result.skills.map((skill) => skill.name)).not.toContain("alpha");
  });

  it("reports an unreadable scan ancestor as blocked rather than inventing missing Skills", async () => {
    const ws = await workspace();
    vi.spyOn(scanner, "scanSkills").mockRejectedValueOnce(
      new SkillHubError({ code: "E_PATH", message: "synthetic unreadable root" }),
    );
    const result = await manageSkills({ action: "list", ...locations(ws) });
    expect(result.complete).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.status === "blocked")).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0]).toMatchObject({
      phase: "scan",
      message: "synthetic unreadable root",
    });
  });

  it("reports missing and untracked names without inventing an unchanged upstream", async () => {
    const ws = await workspace();
    await rm(path.join(ws.canonicalDir, "alpha"), { recursive: true });
    const result = await manageSkills({
      action: "check-updates",
      names: ["alpha", "untracked"],
      ...locations(ws),
    });
    expect(result.complete).toBe(false);
    expect(result.items).toMatchObject([
      {
        name: "alpha",
        localStatus: "missing",
        upstreamStatus: "unchanged",
        updateAvailable: false,
      },
      {
        name: "untracked",
        localStatus: "unmanaged",
        upstreamStatus: "unknown",
        updateAvailable: null,
      },
    ]);
  });

  it("rejects write/source overrides and malformed locks, and creates no state for an empty check", async () => {
    const ws = await workspace();
    const base = { action: "check-updates" as const, ...locations(ws) };
    await expect(manageSkills({ ...base, dryRun: false })).rejects.toMatchObject({
      code: "E_CONFIG",
    });
    await expect(manageSkills({ ...base, ref: "main" })).rejects.toMatchObject({
      code: "E_CONFIG",
    });
    await writeFile(path.join(ws.stateDir, MANAGED_LOCK_FILENAME), "invalid json");
    await expect(manageSkills(base)).rejects.toMatchObject({ code: "E_CONFIG" });
    const emptyState = path.join(ws.root, "empty-state");
    const empty = await manageSkills({ ...base, stateDir: emptyState });
    expect(empty).toMatchObject({ complete: true, items: [], dryRun: true });
    await expect(access(emptyState)).rejects.toThrow();
  });
});
