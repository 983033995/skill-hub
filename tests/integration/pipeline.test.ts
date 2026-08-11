import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  catalogToSkillMetas,
  scanSkills,
  writeCatalog,
} from "@skill-hub/core";
import { createBm25Router } from "@skill-hub/router";
import { planSync } from "@skill-hub/sync";
import type { HubConfig } from "@skill-hub/shared";

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/skills",
);

describe("integration: ingest → index → route → sync dry-run", () => {
  it("fixture pipeline", async () => {
    const skills = await scanSkills(fixtures);
    expect(skills.map((s) => s.name)).toEqual(
      expect.arrayContaining(["sample-skill", "pdf-merge", "frontend-design"]),
    );

    const catalog = buildCatalog(skills);
    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-pipe-"));
    const catalogPath = path.join(dir, "catalog.json");
    await writeCatalog(catalogPath, catalog);

    const loaded = catalogToSkillMetas(catalog);
    const router = createBm25Router();
    await router.build(loaded);
    const ranked = await router.query({ text: "merge pdf", topK: 2 });
    expect(ranked[0]?.name).toBe("pdf-merge");

    // sync plan against empty agent dir → all create
    const agentDir = path.join(dir, "agent-skills");
    await mkdir(agentDir, { recursive: true });
    const config: HubConfig = {
      version: 1,
      canonical_dir: fixtures,
      index_dir: path.join(dir, "index"),
      backup_dir: path.join(dir, "backups"),
      agents: [{ id: "fixture-agent", skills_dir: agentDir, enabled: true }],
      router: { top_k: 5, engine: "bm25" },
      sync: { mode: "symlink", conflict: "report", require_backup: true },
      privacy: { telemetry: false },
    };
    const plan = await planSync(config, loaded, { dryRun: true });
    expect(plan.summary.create).toBe(loaded.length);
    expect(plan.summary.conflict).toBe(0);

    await writeFile(
      path.join(dir, "note.txt"),
      `pipeline ok skills=${loaded.length}\n`,
      "utf8",
    );
  });
});
