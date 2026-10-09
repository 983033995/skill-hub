import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
  catalogHash,
  catalogToSkillMetas,
  readCatalog,
  upsertSkills,
  writeCatalog,
} from "./catalog.js";
import type { SkillMeta } from "./types.js";

const sample: SkillMeta = {
  name: "sample-skill",
  description: "d",
  path: "/tmp/sample-skill",
  hash: "sha256:abc",
  mtimeMs: 1,
  provenance: {
    scope: "project",
    sourceType: "local",
    sourceRef: "/repo/.claude/skills",
    revision: "abc",
  },
};

describe("catalog", () => {
  it("build and round-trip", async () => {
    const cat = buildCatalog([sample]);
    expect(cat.skills["sample-skill"]?.hash).toBe("sha256:abc");
    const metas = catalogToSkillMetas(cat);
    expect(metas).toHaveLength(1);

    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-cat-"));
    const file = path.join(dir, "catalog.json");
    await writeCatalog(file, cat);
    const raw = await readFile(file, "utf8");
    expect(raw).toContain("sample-skill");
    const loaded = await readCatalog(file);
    expect(loaded.skills["sample-skill"]?.name).toBe("sample-skill");
    expect(loaded.skills["sample-skill"]?.provenance).toEqual(sample.provenance);
    expect(catalogToSkillMetas(loaded)[0]?.provenance).toEqual(sample.provenance);
  });

  it("skip on hash conflict when requested", () => {
    const cat = buildCatalog([sample]);
    const { skipped, updated, catalog } = upsertSkills(
      cat,
      [{ ...sample, hash: "sha256:other", description: "new" }],
      { skipOnHashConflict: true },
    );
    expect(skipped).toEqual(["sample-skill"]);
    expect(updated).toEqual([]);
    expect(catalog.skills["sample-skill"]?.hash).toBe("sha256:abc");
  });

  it("keeps legacy entries readable without provenance", () => {
    const legacy = {
      version: 1 as const,
      updatedAt: new Date(0).toISOString(),
      skills: {
        legacy: {
          name: "legacy",
          description: "legacy skill",
          path: "/tmp/legacy",
          hash: "sha256:legacy",
        },
      },
    };
    const metas = catalogToSkillMetas(legacy);
    expect(metas[0]?.name).toBe("legacy");
    expect(metas[0]?.provenance).toBeUndefined();
  });

  it("catalog hash ignores updatedAt", () => {
    const first = buildCatalog([sample], new Date(1));
    const second = {
      version: 1 as const,
      updatedAt: new Date(2).toISOString(),
      skills: { [sample.name]: { ...first.skills[sample.name]! } },
    };
    expect(catalogHash(first)).toBe(catalogHash(second));
  });
});
