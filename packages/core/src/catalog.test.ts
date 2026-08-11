import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCatalog,
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
});
