import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appendHistoryBatch, buildCatalog, scanSkills, writeCatalog } from "@skill-hub/core";
import { skillExplain, skillHistory, skillPaths } from "./hub-service.js";

describe("explain/path/history", () => {
  it("explains overlay provenance and projection status", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-insights-"));
    const source = path.join(root, "project-skills");
    const canonical = path.join(root, "canonical");
    const agentLink = path.join(root, "agent-link");
    const agentConflict = path.join(root, "agent-conflict");
    const index = path.join(root, "index");
    const backups = path.join(root, "backups");
    const history = path.join(root, "history.jsonl");
    await mkdir(path.join(source, "overlay-skill"), { recursive: true });
    await mkdir(path.join(canonical, "overlay-skill"), { recursive: true });
    await mkdir(agentLink, { recursive: true });
    await mkdir(path.join(agentConflict, "overlay-skill"), { recursive: true });
    const body = `---\nname: overlay-skill\ndescription: project overlay skill\n---\n\nproject body\n`;
    await writeFile(path.join(source, "overlay-skill", "SKILL.md"), body, "utf8");
    await writeFile(path.join(canonical, "overlay-skill", "SKILL.md"), body, "utf8");
    await writeFile(
      path.join(agentConflict, "overlay-skill", "SKILL.md"),
      `---\nname: overlay-skill\ndescription: user variant\n---\n\nuser body\n`,
      "utf8",
    );
    await symlink(path.join(canonical, "overlay-skill"), path.join(agentLink, "overlay-skill"));

    const projectMeta = (
      await scanSkills(source, {
        provenance: {
          scope: "project",
          sourceType: "local",
          sourceRef: source,
          revision: "r1",
          status: "active",
          overlayOf: "base-skill",
        },
      })
    )[0]!;
    const catalog = buildCatalog([
      { ...projectMeta, path: path.join(canonical, "overlay-skill") },
      {
        name: "base-skill",
        description: "base skill",
        path: path.join(canonical, "base-skill"),
        hash: "sha256:base",
        mtimeMs: 1,
        provenance: { scope: "user", sourceType: "local", sourceRef: canonical },
      },
    ]);
    const catalogPath = path.join(root, "catalog.json");
    await writeCatalog(catalogPath, catalog);
    await appendHistoryBatch(history, [
      {
        at: new Date(1).toISOString(),
        type: "overlay",
        name: "overlay-skill",
        action: "create",
        revision: "r1",
      },
    ]);
    const configPath = path.join(root, "config.yaml");
    await writeFile(
      configPath,
      `version: 1\ncanonical_dir: ${canonical}\nindex_dir: ${index}\nbackup_dir: ${backups}\nagents:\n  - id: link-agent\n    skills_dir: ${agentLink}\n    enabled: true\n  - id: conflict-agent\n    skills_dir: ${agentConflict}\n    enabled: true\nsources:\n  - id: project\n    path: ${source}\n    scope: project\n    enabled: true\n    source_type: local\n    source_ref: ${source}\n    revision: r1\n    overlay_of: base-skill\nrouter:\n  top_k: 5\n  engine: bm25\nsync:\n  mode: symlink\n  conflict: report\n  require_backup: true\nprivacy:\n  telemetry: false\n`,
      "utf8",
    );

    const paths = await skillPaths({ name: "overlay-skill", catalogPath, configPath });
    expect(paths.canonicalExists).toBe(true);
    expect(paths.agents.find((item) => item.agentId === "link-agent")?.status).toBe("ok");

    const explained = await skillExplain({
      name: "overlay-skill",
      catalogPath,
      configPath,
      historyPath: history,
    });
    expect(explained.scope).toBe("project");
    expect(explained.overlay.overlayOf).toBe("base-skill");
    expect(explained.overlay.base?.name).toBe("base-skill");
    expect(explained.conflict?.winner?.provenance?.scope).toBe("project");
    expect(explained.history).toHaveLength(1);

    const historyResult = await skillHistory({ name: "overlay-skill", historyPath: history });
    expect(historyResult.entries[0]?.type).toBe("overlay");
  });
});
