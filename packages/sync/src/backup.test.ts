import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HubConfig } from "@skill-hub/shared";
import { createBackup, readBackupManifest } from "./backup.js";
import { restoreFromBackup } from "./restore.js";

function cfg(root: string, agents: HubConfig["agents"]): HubConfig {
  return {
    version: 1,
    canonical_dir: path.join(root, "canonical"),
    index_dir: path.join(root, "index"),
    backup_dir: path.join(root, "backups"),
    agents,
    router: { top_k: 5, engine: "bm25" },
    sync: { mode: "symlink", conflict: "report", require_backup: true },
    privacy: { telemetry: false },
  };
}

describe("backup / restore", () => {
  it("copies agent skills and writes manifest", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-bak-"));
    const agentDir = path.join(root, "agent-skills");
    const canon = path.join(root, "canonical", "pdf");
    await mkdir(path.join(agentDir, "pdf"), { recursive: true });
    await writeFile(path.join(agentDir, "pdf", "SKILL.md"), "agent pdf\n");
    await mkdir(canon, { recursive: true });
    await writeFile(path.join(canon, "SKILL.md"), "canon pdf\n");

    const config = cfg(root, [
      { id: "test", skills_dir: agentDir, enabled: true },
      { id: "missing", skills_dir: path.join(root, "nope"), enabled: true },
    ]);

    const manifest = await createBackup(config, { notes: "unit", includeCanonical: true });
    expect(manifest.agents.find((a) => a.id === "test")?.exists).toBe(true);
    expect(manifest.agents.find((a) => a.id === "missing")?.skipped).toBe(true);
    expect(manifest.canonical?.exists).toBe(true);

    const raw = await readFile(path.join(manifest.backupDir, "manifest.json"), "utf8");
    expect(raw).toContain("unit");
    const loaded = await readBackupManifest(manifest.backupDir);
    expect(loaded.notes).toBe("unit");

    // mutate agent dir then restore
    await writeFile(path.join(agentDir, "pdf", "SKILL.md"), "mutated\n");
    const restore = await restoreFromBackup(manifest.backupDir, { dryRun: false });
    expect(restore.restored).toContain("test");
    const body = await readFile(path.join(agentDir, "pdf", "SKILL.md"), "utf8");
    expect(body).toBe("agent pdf\n");
  });
});
