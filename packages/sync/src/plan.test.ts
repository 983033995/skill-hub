import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HubConfig } from "@skill-hub/shared";
import type { SkillMeta } from "@skill-hub/core";
import { planSync } from "./plan.js";

describe("planSync", () => {
  it("plans create / noop / conflict correctly", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-sync-"));
    const canonical = path.join(root, "canonical", "pdf");
    const agentDir = path.join(root, "agent-skills");
    await mkdir(canonical, { recursive: true });
    await mkdir(agentDir, { recursive: true });
    await writeFile(path.join(canonical, "SKILL.md"), "x");

    // conflict: real directory for "ui"
    await mkdir(path.join(agentDir, "ui"), { recursive: true });
    await writeFile(path.join(agentDir, "ui", "SKILL.md"), "old");

    // noop: already correct symlink for "pdf" after create? first pdf missing → create
    // add second skill "ok" with correct symlink
    const okCanon = path.join(root, "canonical", "ok");
    await mkdir(okCanon, { recursive: true });
    await writeFile(path.join(okCanon, "SKILL.md"), "ok");
    await symlink(okCanon, path.join(agentDir, "ok"));

    const skills: SkillMeta[] = [
      {
        name: "pdf",
        description: "d",
        path: canonical,
        hash: "sha256:1",
        mtimeMs: 1,
      },
      {
        name: "ui",
        description: "d",
        path: path.join(root, "canonical", "ui"),
        hash: "sha256:2",
        mtimeMs: 1,
      },
      {
        name: "ok",
        description: "d",
        path: okCanon,
        hash: "sha256:3",
        mtimeMs: 1,
      },
    ];

    const config: HubConfig = {
      version: 1,
      canonical_dir: path.join(root, "canonical"),
      index_dir: path.join(root, "index"),
      backup_dir: path.join(root, "backups"),
      agents: [{ id: "test", skills_dir: agentDir, enabled: true }],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "symlink", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };

    const plan = await planSync(config, skills, { dryRun: true });
    const byName = Object.fromEntries(plan.items.map((i) => [i.skillName, i]));
    expect(byName.pdf?.action).toBe("create_symlink");
    expect(byName.ui?.action).toBe("conflict");
    expect(byName.ok?.action).toBe("noop");
    expect(plan.dryRun).toBe(true);
  });
});
