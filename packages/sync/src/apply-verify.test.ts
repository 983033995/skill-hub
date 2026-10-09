import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import type { HubConfig } from "@skill-hub/shared";
import { applySync } from "./apply.js";
import { planSync } from "./plan.js";
import { verifySync } from "./verify.js";

describe("apply + verify sandbox", () => {
  it("creates symlinks and verifies", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-apply-"));
    const canonPdf = path.join(root, "canonical", "pdf");
    const agentDir = path.join(root, "agent-skills");
    await mkdir(canonPdf, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(canonPdf, "SKILL.md"), "pdf body\n");

    // conflict real dir
    await mkdir(path.join(agentDir, "ui"), { recursive: true });
    await writeFile(path.join(agentDir, "ui", "SKILL.md"), "old\n");

    const skills: SkillMeta[] = [
      {
        name: "pdf",
        description: "pdf",
        path: canonPdf,
        hash: "sha256:1",
        mtimeMs: 1,
      },
      {
        name: "ui",
        description: "ui",
        path: path.join(root, "canonical", "ui"),
        hash: "sha256:2",
        mtimeMs: 1,
      },
    ];

    const config: HubConfig = {
      version: 1,
      canonical_dir: path.join(root, "canonical"),
      index_dir: path.join(root, "index"),
      backup_dir: path.join(root, "backups"),
      agents: [{ id: "sandbox", skills_dir: agentDir, enabled: true }],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "symlink", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };

    const plan = await planSync(config, skills, { dryRun: false });
    expect(plan.items.find((i) => i.skillName === "pdf")?.action).toBe("create_symlink");
    expect(plan.items.find((i) => i.skillName === "ui")?.action).toBe("conflict");

    const applied = await applySync(plan, { dryRun: false });
    expect(applied.applied).toBe(1);
    expect(applied.failed).toBe(0);

    const st = await lstat(path.join(agentDir, "pdf"));
    expect(st.isSymbolicLink()).toBe(true);
    expect(await realpath(path.join(agentDir, "pdf"))).toBe(await realpath(canonPdf));

    const report = await verifySync(config, skills);
    const pdf = report.items.find((i) => i.skillName === "pdf");
    const ui = report.items.find((i) => i.skillName === "ui");
    expect(pdf?.kind).toBe("ok");
    expect(ui?.kind).toBe("not_symlink");
    expect(report.ok).toBe(false);
  });

  it("create-only + agents filter skips conflicts and non-target agents", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-create-only-"));
    const canonPdf = path.join(root, "canonical", "pdf");
    const agentDir = path.join(root, "wb-skills");
    const otherDir = path.join(root, "other-skills");
    await mkdir(canonPdf, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await mkdir(otherDir, { recursive: true });
    await writeFile(path.join(canonPdf, "SKILL.md"), "pdf body\n");
    await mkdir(path.join(agentDir, "ui"), { recursive: true });

    const skills: SkillMeta[] = [
      {
        name: "pdf",
        description: "pdf",
        path: canonPdf,
        hash: "sha256:1",
        mtimeMs: 1,
      },
      {
        name: "ui",
        description: "ui",
        path: path.join(root, "canonical", "ui"),
        hash: "sha256:2",
        mtimeMs: 1,
      },
    ];

    const config: HubConfig = {
      version: 1,
      canonical_dir: path.join(root, "canonical"),
      index_dir: path.join(root, "index"),
      backup_dir: path.join(root, "backups"),
      agents: [
        { id: "workbuddy", skills_dir: agentDir, enabled: true },
        { id: "cursor", skills_dir: otherDir, enabled: true },
      ],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "symlink", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };

    const plan = await planSync(config, skills, {
      dryRun: false,
      agents: ["workbuddy"],
      createOnly: true,
    });
    expect(plan.items.every((i) => i.agentId === "workbuddy")).toBe(true);
    expect(plan.summary.create).toBe(1);
    expect(plan.items.find((i) => i.skillName === "pdf")?.action).toBe("create_symlink");
    expect(plan.items.find((i) => i.skillName === "ui")?.action).toBe("skipped");

    const applied = await applySync(plan, { dryRun: false, createOnly: true });
    expect(applied.applied).toBe(1);
    expect(applied.failed).toBe(0);
    const st = await lstat(path.join(agentDir, "pdf"));
    expect(st.isSymbolicLink()).toBe(true);
  });

  it("replace-real stashes real dir then creates symlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-replace-real-"));
    const canonUi = path.join(root, "canonical", "ui");
    const agentDir = path.join(root, "wb-skills");
    const stash = path.join(root, "stash");
    await mkdir(canonUi, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(canonUi, "SKILL.md"), "canon ui\n");
    await mkdir(path.join(agentDir, "ui"), { recursive: true });
    await writeFile(path.join(agentDir, "ui", "SKILL.md"), "old real ui\n");

    const skills: SkillMeta[] = [
      {
        name: "ui",
        description: "ui",
        path: canonUi,
        hash: "sha256:2",
        mtimeMs: 1,
      },
    ];

    const config: HubConfig = {
      version: 1,
      canonical_dir: path.join(root, "canonical"),
      index_dir: path.join(root, "index"),
      backup_dir: path.join(root, "backups"),
      agents: [{ id: "workbuddy", skills_dir: agentDir, enabled: true }],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "symlink", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };

    const plan = await planSync(config, skills, {
      dryRun: false,
      agents: ["workbuddy"],
      replaceReal: true,
    });
    expect(plan.summary.replace).toBe(1);
    expect(plan.items[0]?.action).toBe("replace_real");

    const applied = await applySync(plan, {
      dryRun: false,
      replaceStashDir: stash,
    });
    expect(applied.applied).toBe(1);
    expect(applied.failed).toBe(0);

    const st = await lstat(path.join(agentDir, "ui"));
    expect(st.isSymbolicLink()).toBe(true);
    expect(await realpath(path.join(agentDir, "ui"))).toBe(await realpath(canonUi));

    const stashed = path.join(stash, "workbuddy", "ui", "SKILL.md");
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(stashed, "utf8")).toBe("old real ui\n");

    const report = await verifySync(config, skills);
    expect(report.items.find((i) => i.skillName === "ui")?.kind).toBe("ok");
    expect(report.ok).toBe(true);
  });

  it("copies skills in copy mode and verifies content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-copy-"));
    const canonPdf = path.join(root, "canonical", "pdf");
    const agentDir = path.join(root, "agent-skills");
    await mkdir(canonPdf, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      path.join(canonPdf, "SKILL.md"),
      "---\nname: pdf\ndescription: Copy fixture\n---\nbody\n",
    );
    await writeFile(path.join(canonPdf, "reference.txt"), "reference\n");

    const { parseSkillMd } = await import("@skill-hub/core");
    const skill = await parseSkillMd(path.join(canonPdf, "SKILL.md"));
    const config: HubConfig = {
      version: 1,
      canonical_dir: path.join(root, "canonical"),
      index_dir: path.join(root, "index"),
      backup_dir: path.join(root, "backups"),
      agents: [{ id: "sandbox", skills_dir: agentDir, enabled: true }],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "copy", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };

    const plan = await planSync(config, [skill], { dryRun: false });
    expect(plan.items[0]?.action).toBe("create_copy");
    const applied = await applySync(plan, { dryRun: false });
    expect(applied.applied).toBe(1);

    const target = path.join(agentDir, "pdf");
    const st = await lstat(target);
    expect(st.isSymbolicLink()).toBe(false);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path.join(target, "reference.txt"), "utf8")).toBe("reference\n");

    const secondPlan = await planSync(config, [skill], { dryRun: true });
    expect(secondPlan.items[0]?.action).toBe("noop");

    await rm(target, { recursive: true, force: true });
    await symlink(canonPdf, target);
    const updatePlan = await planSync(config, [skill], { dryRun: false });
    expect(updatePlan.items[0]?.action).toBe("update_copy");
    expect((await applySync(updatePlan, { dryRun: false })).applied).toBe(1);

    await writeFile(path.join(target, "SKILL.md"), "local mutation\n");
    const stash = path.join(root, "stash");
    const replacePlan = await planSync(config, [skill], {
      dryRun: false,
      replaceReal: true,
    });
    expect(replacePlan.items[0]?.action).toBe("replace_real_copy");
    expect(
      (await applySync(replacePlan, { dryRun: false, replaceStashDir: stash })).applied,
    ).toBe(1);
    expect(await readFile(path.join(stash, "sandbox", "pdf", "SKILL.md"), "utf8")).toBe(
      "local mutation\n",
    );

    const report = await verifySync(config, [skill]);
    expect(report.ok).toBe(true);
    expect(report.summary.ok).toBe(1);
  });
});
