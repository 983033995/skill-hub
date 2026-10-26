import {
  cp,
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rename,
  stat,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { manageSkills } from "./managed.js";

async function applyPreviewedUpdate(options: Parameters<typeof manageSkills>[0]) {
  const preview = await manageSkills({ ...options, dryRun: true });
  return manageSkills({ ...options, dryRun: false, planToken: preview.planToken });
}

const fault = vi.hoisted(() => ({
  failPublish: false,
  failLock: false,
  failRestore: false,
  mutateLockPath: "",
  migrationLockPath: "",
  migrationSourcePath: "",
}));
vi.mock("node:fs/promises", async (load) => {
  const actual = await load<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: vi.fn(async (source: string, dest: string) => {
      if (dest.endsWith("managed-rollback.json")) {
        if (fault.migrationLockPath) {
          const lock = JSON.parse(await actual.readFile(fault.migrationLockPath, "utf8"));
          lock.skills.alpha.overlayOf = "external-base";
          await actual.writeFile(fault.migrationLockPath, JSON.stringify(lock));
          fault.migrationLockPath = "";
        }
        if (fault.migrationSourcePath) {
          await actual.writeFile(fault.migrationSourcePath, "source drift during backup");
          fault.migrationSourcePath = "";
        }
      }
      if (fault.mutateLockPath && source.includes("/staging/beta")) {
        const lockPath = fault.mutateLockPath;
        fault.mutateLockPath = "";
        const lock = JSON.parse(await actual.readFile(lockPath, "utf8"));
        lock.skills.alpha.overlayOf = "external-base";
        await actual.writeFile(lockPath, JSON.stringify(lock));
      }
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
  Object.assign(fault, {
    failPublish: false,
    failLock: false,
    failRestore: false,
    mutateLockPath: "",
    migrationLockPath: "",
    migrationSourcePath: "",
  });
});

for (const failure of ["lock-write", "lock-drift", "source-drift"] as const) {
  it(`keeps canonical intact and retains migration recovery evidence on ${failure}`, async () => {
    const ws = await setup();
    try {
      const next = path.join(ws.root, "next-source");
      await cp(path.join(ws.canonicalDir, "alpha"), next, { recursive: true });
      const options = {
        action: "migrate-source" as const,
        names: ["alpha"],
        source: next,
        canonicalDir: ws.canonicalDir,
        stateDir: ws.stateDir,
      };
      const preview = await manageSkills(options);
      const original = await stat(path.join(ws.canonicalDir, "alpha"));
      if (failure === "lock-write") fault.failLock = true;
      if (failure === "lock-drift")
        fault.migrationLockPath = path.join(ws.stateDir, "managed-lock.json");
      if (failure === "source-drift") fault.migrationSourcePath = path.join(next, "script");
      await expect(
        manageSkills({ ...options, dryRun: false, planToken: preview.planToken }),
      ).rejects.toThrow();
      const current = await stat(path.join(ws.canonicalDir, "alpha"));
      expect([current.dev, current.ino]).toEqual([original.dev, original.ino]);
      expect(await readFile(path.join(ws.canonicalDir, "alpha", "script"), "utf8")).toBe("old");
      const lock = await readFile(path.join(ws.stateDir, "managed-lock.json"), "utf8");
      if (failure === "lock-drift")
        expect(JSON.parse(lock).skills.alpha.overlayOf).toBe("external-base");
      else expect(lock).toBe(ws.oldLock);
      const batches = await readdir(path.join(ws.stateDir, "backups"));
      expect(batches).toHaveLength(1);
      const manifest = JSON.parse(
        await readFile(
          path.join(ws.stateDir, "backups", batches[0]!, "managed-rollback.json"),
          "utf8",
        ),
      );
      expect(manifest.skills.alpha).toEqual(JSON.parse(ws.oldLock).skills.alpha);
    } finally {
      await rm(ws.root, { recursive: true, force: true });
    }
  });
}
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
      applyPreviewedUpdate({ action: "update", ...workspace, dryRun: false, source: undefined }),
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
    applyPreviewedUpdate({ action: "update", ...workspace, dryRun: false, source: undefined }),
  ).rejects.toThrow("保留事务目录");
  const transactions = (await readdir(workspace.canonicalDir)).filter((name) =>
    name.startsWith(".managed-txn-"),
  );
  expect(transactions).toHaveLength(1);
  expect(await readdir(path.join(workspace.stateDir, "backups"))).toHaveLength(1);
  expect(vi.isMockFunction(rename)).toBe(true);
});

it("restores canonical trees and preserves a non-cooperating lock edit during apply", async () => {
  const workspace = await setup();
  fault.mutateLockPath = path.join(workspace.stateDir, "managed-lock.json");
  await expect(
    applyPreviewedUpdate({ action: "update", ...workspace, source: undefined, dryRun: false }),
  ).rejects.toMatchObject({ code: "E_CONFLICT" });
  for (const name of ["alpha", "beta"]) {
    expect(await readFile(path.join(workspace.canonicalDir, name, "script"), "utf8")).toBe("old");
  }
  const lock = JSON.parse(
    await readFile(path.join(workspace.stateDir, "managed-lock.json"), "utf8"),
  );
  expect(lock.skills.alpha.overlayOf).toBe("external-base");
});

it("preserves a no-op directory when a mixed update fails at lock publication", async () => {
  const workspace = await setup();
  await writeFile(path.join(workspace.source, "beta", "script"), "old");
  const original = await stat(path.join(workspace.canonicalDir, "beta"));
  fault.failLock = true;
  await expect(
    applyPreviewedUpdate({ action: "update", ...workspace, source: undefined, dryRun: false }),
  ).rejects.toThrow("simulated lock write failure");
  const final = await stat(path.join(workspace.canonicalDir, "beta"));
  expect([final.dev, final.ino]).toEqual([original.dev, original.ino]);
  expect(await readFile(path.join(workspace.canonicalDir, "alpha", "script"), "utf8")).toBe("old");
  expect(await readFile(path.join(workspace.stateDir, "managed-lock.json"), "utf8")).toBe(
    workspace.oldLock,
  );
});
