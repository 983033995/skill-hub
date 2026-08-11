import { lstat, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import type { HubConfig } from "@skill-hub/shared";
import {
  applySync,
  createBackup,
  planSync,
  restoreFromBackup,
  verifySync,
} from "@skill-hub/sync";

/**
 * 完整沙箱演练：backup → plan → apply → verify → 破坏 → restore。
 * 不触碰真实用户 home 下各 Agent skills 目录。
 */
describe("phase2 sandbox drill", () => {
  it("backup → apply → verify → restore", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-p2-"));
    const agentDir = path.join(root, "agent-skills");
    const canon = path.join(root, "canonical", "hello");
    await mkdir(path.join(agentDir, "legacy"), { recursive: true });
    await writeFile(path.join(agentDir, "legacy", "SKILL.md"), "legacy body\n");
    await mkdir(canon, { recursive: true });
    await writeFile(path.join(canon, "SKILL.md"), "hello body\n");

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

    const backup = await createBackup(config, { notes: "p2-drill", includeCanonical: true });
    expect(backup.agents[0]?.entryCount).toBeGreaterThan(0);

    const skills: SkillMeta[] = [
      {
        name: "hello",
        description: "hello skill",
        path: canon,
        hash: "sha256:h",
        mtimeMs: 1,
      },
      {
        name: "legacy",
        description: "legacy real dir",
        path: path.join(root, "canonical", "legacy"),
        hash: "sha256:l",
        mtimeMs: 1,
      },
    ];

    const plan = await planSync(config, skills, { dryRun: false });
    expect(plan.items.find((i) => i.skillName === "hello")?.action).toBe("create_symlink");
    expect(plan.items.find((i) => i.skillName === "legacy")?.action).toBe("conflict");

    const applied = await applySync(plan, { dryRun: false });
    expect(applied.applied).toBe(1);
    expect((await lstat(path.join(agentDir, "hello"))).isSymbolicLink()).toBe(true);
    expect(await realpath(path.join(agentDir, "hello"))).toBe(await realpath(canon));

    const report = await verifySync(config, skills);
    expect(report.items.find((i) => i.skillName === "hello")?.kind).toBe("ok");
    expect(report.items.find((i) => i.skillName === "legacy")?.kind).toBe("not_symlink");

    // 破坏 legacy 内容后 restore 应还原
    await writeFile(path.join(agentDir, "legacy", "SKILL.md"), "broken\n");
    await restoreFromBackup(backup.backupDir, { dryRun: false, agents: ["sandbox"] });
    const body = await (await import("node:fs/promises")).readFile(
      path.join(agentDir, "legacy", "SKILL.md"),
      "utf8",
    );
    expect(body).toBe("legacy body\n");
  });
});
