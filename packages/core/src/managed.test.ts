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

    const result = await manageSkills({
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
      manageSkills({
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
      manageSkills({
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
