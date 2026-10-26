import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MANAGED_LOCK_FILENAME, manageSkills } from "./managed.js";

async function applyPreviewedUpdate(options: Parameters<typeof manageSkills>[0]) {
  const preview = await manageSkills({ ...options, dryRun: true });
  return manageSkills({ ...options, dryRun: false, planToken: preview.planToken });
}

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createWorkspace(): Promise<{
  root: string;
  source: string;
  canonical: string;
  state: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "skill-hub-managed-"));
  temporaryRoots.push(root);
  return {
    root,
    source: path.join(root, "source"),
    canonical: path.join(root, "canonical"),
    state: path.join(root, "state"),
  };
}

async function writeSkill(
  root: string,
  name: string,
  options: { body?: string; script?: string; attachment?: string } = {},
): Promise<string> {
  const skill = path.join(root, name);
  await mkdir(path.join(skill, "scripts"), { recursive: true });
  await writeFile(
    path.join(skill, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} description\n---\n${options.body ?? "body"}\n`,
  );
  if (options.script !== undefined) {
    await writeFile(path.join(skill, "scripts", "run.sh"), options.script, { mode: 0o755 });
  }
  if (options.attachment !== undefined) {
    await mkdir(path.join(skill, "references"), { recursive: true });
    await writeFile(path.join(skill, "references", "guide.md"), options.attachment);
  }
  return skill;
}

function installOptions(workspace: Awaited<ReturnType<typeof createWorkspace>>, dryRun = false) {
  return {
    action: "install" as const,
    source: workspace.source,
    canonicalDir: workspace.canonical,
    stateDir: workspace.state,
    dryRun,
  };
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

describe("manageSkills", () => {
  it("installs a local skill collection and records a full source lock", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", {
      script: "#!/bin/sh\necho one\n",
      attachment: "v1",
    });
    await writeSkill(workspace.source, "beta", { body: "second" });

    const result = await manageSkills(installOptions(workspace));

    expect(result.dryRun).toBe(false);
    expect(result.items.map((item) => item.name)).toEqual(["alpha", "beta"]);
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toContain("one");
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "references", "guide.md"), "utf8"),
    ).toBe("v1");
    const lock = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as {
      skills: Record<string, { type: string; path: string; subpath: string; treeHash: string }>;
    };
    expect(lock.skills.alpha).toMatchObject({
      type: "local",
      path: await realpath(workspace.source),
      subpath: "alpha",
    });
    expect(lock.skills.alpha?.treeHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    const canonicalReal = await realpath(workspace.canonical);
    expect(result.skills.every((skill) => skill.path.startsWith(canonicalReal))).toBe(true);
  });

  it("updates scripts and attachments, while preserving a unique backup of the old tree", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", {
      script: "#!/bin/sh\necho old\n",
      attachment: "old guide",
    });
    await manageSkills(installOptions(workspace));
    await writeFile(
      path.join(workspace.source, "alpha", "scripts", "run.sh"),
      "#!/bin/sh\necho new\n",
      {
        mode: 0o755,
      },
    );
    await writeFile(path.join(workspace.source, "alpha", "references", "guide.md"), "new guide");

    const result = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });

    const item = result.items[0];
    expect(item).toMatchObject({ name: "alpha", action: "update", status: "applied" });
    expect(item?.backupPath).toBeTruthy();
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toContain("new");
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "references", "guide.md"), "utf8"),
    ).toBe("new guide");
    expect(await readFile(path.join(item!.backupPath!, "scripts", "run.sh"), "utf8")).toContain(
      "old",
    );
    expect(await readFile(path.join(item!.backupPath!, "references", "guide.md"), "utf8")).toBe(
      "old guide",
    );
  });

  it("rolls back one managed Skill from a verified backup and can roll forward again", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", {
      body: "version one",
      script: "one",
      attachment: "guide one",
    });
    await manageSkills(installOptions(workspace));

    await writeFile(
      path.join(workspace.source, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: alpha description\n---\nversion two\n",
    );
    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "two");
    await writeFile(path.join(workspace.source, "alpha", "references", "guide.md"), "guide two");
    const second = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const versionOneBackup = second.items[0]!.backupPath!;
    const firstManifest = JSON.parse(
      await readFile(path.join(path.dirname(versionOneBackup), "managed-rollback.json"), "utf8"),
    ) as { version: number; batchId: string; skills: Record<string, { treeHash: string }> };
    expect(firstManifest).toMatchObject({
      version: 1,
      batchId: path.basename(path.dirname(versionOneBackup)),
    });
    expect(firstManifest.skills.alpha?.treeHash).toBe(second.items[0]?.currentTreeHash);

    await writeFile(
      path.join(workspace.source, "alpha", "SKILL.md"),
      "---\nname: alpha\ndescription: alpha description\n---\nversion three\n",
    );
    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "three");
    await writeFile(path.join(workspace.source, "alpha", "references", "guide.md"), "guide three");
    await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    await rm(workspace.source, { recursive: true, force: true });

    const preview = await manageSkills({
      action: "rollback",
      names: ["alpha"],
      backupPath: versionOneBackup,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: true,
    });
    expect(preview.items).toMatchObject([{ action: "rollback", status: "planned" }]);
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toBe("three");

    const rolledBack = await manageSkills({
      action: "rollback",
      names: ["alpha"],
      backupPath: versionOneBackup,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    expect(rolledBack.items).toMatchObject([{ action: "rollback", status: "applied" }]);
    expect(await readFile(path.join(workspace.canonical, "alpha", "SKILL.md"), "utf8")).toContain(
      "version one",
    );
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toBe("one");
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "references", "guide.md"), "utf8"),
    ).toBe("guide one");

    const rolledForward = await manageSkills({
      action: "rollback",
      names: ["alpha"],
      backupPath: rolledBack.items[0]!.backupPath!,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    expect(rolledForward.items).toMatchObject([{ action: "rollback", status: "applied" }]);
    expect(await readFile(path.join(workspace.canonical, "alpha", "SKILL.md"), "utf8")).toContain(
      "version three",
    );
    const lock = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as { skills: Record<string, { treeHash: string }> };
    expect(lock.skills.alpha?.treeHash).toBe(rolledForward.items[0]?.sourceTreeHash);
  });

  it("rolls back only the selected Skill lock from a multi-Skill update batch", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "alpha one" });
    await writeSkill(workspace.source, "beta", { script: "beta one" });
    await manageSkills(installOptions(workspace));

    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "alpha two");
    await writeFile(path.join(workspace.source, "beta", "scripts", "run.sh"), "beta two");
    const second = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const alphaBackup = second.items.find((item) => item.name === "alpha")!.backupPath!;

    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "alpha three");
    await writeFile(path.join(workspace.source, "beta", "scripts", "run.sh"), "beta three");
    await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const before = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as { skills: Record<string, { treeHash: string }> };

    await manageSkills({
      action: "rollback",
      names: ["alpha"],
      backupPath: alphaBackup,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });

    const after = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as { skills: Record<string, { treeHash: string }> };
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toBe("alpha one");
    expect(
      await readFile(path.join(workspace.canonical, "beta", "scripts", "run.sh"), "utf8"),
    ).toBe("beta three");
    expect(after.skills.alpha?.treeHash).toBe(
      second.items.find((item) => item.name === "alpha")?.currentTreeHash,
    );
    expect(after.skills.beta).toEqual(before.skills.beta);
  });

  it("stores overlayOf in managed locks and preserves it through update, list and rollback", async () => {
    const workspace = await createWorkspace();
    const baseSource = path.join(workspace.root, "base-source");
    const forkSource = path.join(workspace.root, "fork-source");
    await writeSkill(baseSource, "guide-base", { body: "base" });
    await writeSkill(forkSource, "guide-custom", { body: "fork one" });
    await manageSkills({
      action: "install",
      source: baseSource,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });

    const fork = await manageSkills({
      action: "install",
      source: forkSource,
      overlayOf: "guide-base",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    expect(fork.skills[0]?.provenance?.overlayOf).toBe("guide-base");
    let lock = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as { skills: Record<string, { overlayOf?: string }> };
    expect(lock.skills["guide-base"]?.overlayOf).toBeUndefined();
    expect(lock.skills["guide-custom"]?.overlayOf).toBe("guide-base");

    await writeFile(
      path.join(forkSource, "guide-custom", "SKILL.md"),
      "---\nname: guide-custom\ndescription: guide-custom description\n---\nfork two\n",
    );
    const update = await applyPreviewedUpdate({
      action: "update",
      names: ["guide-custom"],
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    expect(update.skills[0]?.provenance?.overlayOf).toBe("guide-base");

    const listed = await manageSkills({
      action: "list",
      names: ["guide-custom"],
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
    });
    expect(listed.skills[0]?.provenance?.overlayOf).toBe("guide-base");

    const rollback = await manageSkills({
      action: "rollback",
      names: ["guide-custom"],
      backupPath: update.items[0]!.backupPath!,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    expect(rollback.skills[0]?.provenance?.overlayOf).toBe("guide-base");
    lock = JSON.parse(
      await readFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "utf8"),
    ) as { skills: Record<string, { overlayOf?: string }> };
    expect(lock.skills["guide-custom"]?.overlayOf).toBe("guide-base");
  });

  it("requires a single differently named Skill for a managed overlay", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "base-skill");
    await writeSkill(workspace.source, "fork-skill");
    await manageSkills(installOptions(workspace, true));

    await expect(
      manageSkills({
        ...installOptions(workspace, true),
        overlayOf: "base-skill",
      }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
    await expect(
      manageSkills({
        ...installOptions(workspace, true),
        names: ["base-skill"],
        overlayOf: "base-skill",
      }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
  });

  it("rejects rollback paths outside managed backups and refuses a modified canonical tree", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "old" });
    await manageSkills(installOptions(workspace));
    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "new");
    const update = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const backupPath = update.items[0]!.backupPath!;
    const rollback = (pathValue: string) =>
      manageSkills({
        action: "rollback",
        names: ["alpha"],
        backupPath: pathValue,
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: false,
      });

    await expect(rollback(path.join(workspace.source, "alpha"))).rejects.toMatchObject({
      code: "E_PATH",
    });
    await writeFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "local edit");
    await expect(rollback(backupPath)).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toBe("local edit");
  });

  it("rejects a backup whose tree no longer matches its saved source lock", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "old" });
    await manageSkills(installOptions(workspace));
    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "new");
    const update = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const backupPath = update.items[0]!.backupPath!;
    await writeFile(path.join(backupPath, "scripts", "run.sh"), "tampered backup");

    await expect(
      manageSkills({
        action: "rollback",
        names: ["alpha"],
        backupPath,
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "E_BACKUP" });
  });

  it("refuses legacy update backups that have no managed source-lock snapshot", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "old" });
    await manageSkills(installOptions(workspace));
    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "new");
    const update = await applyPreviewedUpdate({
      action: "update",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const backupPath = update.items[0]!.backupPath!;
    await rm(path.join(path.dirname(backupPath), "managed-rollback.json"));

    await expect(
      manageSkills({
        action: "rollback",
        names: ["alpha"],
        backupPath,
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "E_NOT_FOUND" });
  });

  it("refuses update when any canonical attachment was modified locally", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "#!/bin/sh\necho upstream-one\n" });
    await manageSkills(installOptions(workspace));
    await writeFile(
      path.join(workspace.canonical, "alpha", "scripts", "run.sh"),
      "#!/bin/sh\necho local\n",
      {
        mode: 0o755,
      },
    );
    await writeFile(
      path.join(workspace.source, "alpha", "scripts", "run.sh"),
      "#!/bin/sh\necho upstream-two\n",
      {
        mode: 0o755,
      },
    );

    await expect(
      applyPreviewedUpdate({
        action: "update",
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toContain("local");
  });

  it("is dry-run by default and does not create hub or state directories", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha", { script: "echo dry" });

    const result = await manageSkills({
      action: "install",
      source: workspace.source,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
    });

    expect(result.dryRun).toBe(true);
    expect(result.items).toMatchObject([{ name: "alpha", status: "planned" }]);
    expect(await fileExists(workspace.canonical)).toBe(false);
    expect(await fileExists(workspace.state)).toBe(false);
  });

  it("reports missing requested skills instead of silently installing a partial selection", async () => {
    const workspace = await createWorkspace();
    await writeSkill(workspace.source, "alpha");

    await expect(
      manageSkills({ ...installOptions(workspace, true), names: ["does-not-exist"] }),
    ).rejects.toMatchObject({ code: "E_NOT_FOUND" });
  });

  it("rejects a malformed managed lock", async () => {
    const workspace = await createWorkspace();
    await mkdir(workspace.state, { recursive: true });
    await writeFile(path.join(workspace.state, MANAGED_LOCK_FILENAME), "{not valid json");

    await expect(
      manageSkills({
        action: "list",
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
      }),
    ).rejects.toMatchObject({ code: "E_CONFIG" });
  });

  it("rejects source path traversal, credential URLs, escaping symlinks, and canonical skill symlinks", async () => {
    const workspace = await createWorkspace();
    const alpha = await writeSkill(workspace.source, "alpha");
    const outside = await writeSkill(path.join(workspace.root, "outside"), "outside");
    await symlink(outside, path.join(alpha, "scripts", "escape"));

    await expect(
      manageSkills({
        ...installOptions(workspace, true),
        source: `${workspace.source}/../source`,
      }),
    ).rejects.toMatchObject({ code: "E_PATH" });
    await expect(
      manageSkills({
        ...installOptions(workspace, true),
        source: "https://token@github.com/owner/repo.git",
      }),
    ).rejects.toMatchObject({ code: "E_PATH" });
    await expect(manageSkills(installOptions(workspace, true))).rejects.toMatchObject({
      code: "E_PATH",
    });

    await rm(path.join(alpha, "scripts", "escape"));
    await mkdir(workspace.canonical, { recursive: true });
    await symlink(outside, path.join(workspace.canonical, "alpha"));
    await expect(manageSkills(installOptions(workspace, true))).rejects.toMatchObject({
      code: "E_PATH",
    });
  });

  it("prevents same-name source conflicts and leaves existing canonical content intact when backup preparation fails", async () => {
    const workspace = await createWorkspace();
    const alternate = path.join(workspace.root, "alternate");
    await writeSkill(workspace.source, "alpha", { script: "echo first" });
    await writeSkill(alternate, "alpha", { script: "echo other" });
    await manageSkills(installOptions(workspace));

    await expect(
      manageSkills({
        action: "install",
        source: alternate,
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: false,
      }),
    ).rejects.toMatchObject({ code: "E_CONFLICT" });

    await writeFile(path.join(workspace.source, "alpha", "scripts", "run.sh"), "echo update", {
      mode: 0o755,
    });
    await rm(path.join(workspace.state, "backups"), { recursive: true, force: true });
    await writeFile(path.join(workspace.state, "backups"), "block backups");
    await expect(
      applyPreviewedUpdate({
        action: "update",
        canonicalDir: workspace.canonical,
        stateDir: workspace.state,
        dryRun: false,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(
      await readFile(path.join(workspace.canonical, "alpha", "scripts", "run.sh"), "utf8"),
    ).toBe("echo first");
  });

  it("adopts only an identical existing canonical tree and exposes managed skills through list", async () => {
    const workspace = await createWorkspace();
    const sourceSkill = await writeSkill(workspace.source, "alpha", { attachment: "same" });
    await cp(sourceSkill, path.join(workspace.canonical, "alpha"), {
      recursive: true,
      dereference: true,
    });

    const adopted = await manageSkills({
      action: "adopt",
      source: workspace.source,
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
      dryRun: false,
    });
    const listed = await manageSkills({
      action: "list",
      canonicalDir: workspace.canonical,
      stateDir: workspace.state,
    });

    expect(adopted.items).toMatchObject([{ name: "alpha", action: "adopt", status: "applied" }]);
    expect(listed.items).toMatchObject([{ name: "alpha", status: "present" }]);
    expect(listed.skills[0]?.provenance).toMatchObject({ sourceType: "local", scope: "user" });
  });
});
