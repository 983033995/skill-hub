import { mkdir, mkdtemp, writeFile, unlink, utimes, rename, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalog, catalogHash, parseSkillMd, writeCatalog } from "@skill-hub/core";
import type { SkillMeta } from "@skill-hub/core";
import { createBm25Router } from "./bm25.js";
import { inspectBm25Index } from "./index-store.js";
import { skillSearch } from "./hub-service.js";

const skill: SkillMeta = {
  name: "pdf-merge",
  description: "merge pdf files",
  path: "/tmp/pdf-merge",
  hash: "sha256:pdf",
  mtimeMs: 1,
};

describe("persistent index freshness", () => {
  it("loads a matching bm25 artifact", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-index-"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "SKILL.md"),
      "---\nname: pdf-merge\ndescription: merge pdf files\n---\nOriginal body\n",
    );
    const skill = await parseSkillMd(path.join(dir, "SKILL.md"));
    const catalog = buildCatalog([skill]);
    const catalogPath = path.join(dir, "catalog.json");
    await writeCatalog(catalogPath, catalog);
    const router = createBm25Router();
    await router.build([skill]);
    await writeFile(
      path.join(dir, "bm25.json"),
      `${JSON.stringify(router.toArtifact())}\n`,
      "utf8",
    );
    await writeFile(
      path.join(dir, "index-meta.json"),
      `${JSON.stringify({
        version: 1,
        engine: "bm25",
        builtAt: new Date().toISOString(),
        skillCount: 1,
        catalogHash: catalogHash(catalog),
        artifact: "bm25.json",
      })}\n`,
      "utf8",
    );

    const inspected = await inspectBm25Index({ indexDir: dir, catalog });
    expect(inspected.fresh).toBe(true);
    expect(inspected.router).not.toBeNull();

    const routed = await skillSearch({
      query: "merge pdf",
      catalogPath,
      indexDir: dir,
    });
    expect(routed.indexSource).toBe("persistent");
    expect(routed.indexFresh).toBe(true);
  });

  it("marks a changed catalog stale with rebuild guidance", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-index-stale-"));
    const catalog = buildCatalog([skill]);
    const catalogPath = path.join(dir, "catalog.json");
    await writeCatalog(catalogPath, catalog);
    await writeFile(
      path.join(dir, "index-meta.json"),
      `${JSON.stringify({
        version: 1,
        engine: "bm25",
        builtAt: new Date().toISOString(),
        skillCount: 1,
        catalogHash: "sha256:old",
        artifact: "bm25.json",
      })}\n`,
      "utf8",
    );
    const inspected = await inspectBm25Index({
      indexDir: dir,
      catalog,
    });
    expect(inspected.fresh).toBe(false);
    expect(inspected.reason).toContain("index --rebuild");

    const routed = await skillSearch({ query: "merge pdf", catalogPath, indexDir: dir });
    expect(routed.indexSource).toBe("memory");
    expect(routed.indexRebuildRecommended).toBe(true);
  });
});

async function indexedFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "skill-hub-index-content-"));
  const file = path.join(dir, "SKILL.md");
  await writeFile(file, "---\nname: pdf-merge\ndescription: merge pdf files\n---\nOld body\n");
  const skill = await parseSkillMd(file);
  const catalog = buildCatalog([skill]);
  const router = createBm25Router();
  await router.build([skill]);
  await writeCatalog(path.join(dir, "catalog.json"), catalog);
  await writeFile(path.join(dir, "bm25.json"), JSON.stringify(router.toArtifact()));
  await writeFile(
    path.join(dir, "index-meta.json"),
    JSON.stringify({
      engine: "bm25",
      builtAt: new Date().toISOString(),
      skillCount: 1,
      catalogHash: catalogHash(catalog),
      artifact: "bm25.json",
    }),
  );
  return { dir, file, skill, catalog, router };
}

describe("index content and algorithm drift", () => {
  it("detects body changes even with the original mtime and unchanged catalog", async () => {
    const f = await indexedFixture();
    await writeFile(f.file, "---\nname: pdf-merge\ndescription: merge pdf files\n---\nNew body\n");
    await utimes(f.file, f.skill.mtimeMs / 1000, f.skill.mtimeMs / 1000);
    const checked = await inspectBm25Index({ indexDir: f.dir, catalog: f.catalog });
    expect(checked.fresh).toBe(false);
    expect(checked.reason).toContain("SKILL.md");
    expect(checked.router).toBeNull();
    const result = await skillSearch({
      query: "merge pdf",
      catalogPath: path.join(f.dir, "catalog.json"),
      indexDir: f.dir,
    });
    expect(result.indexFresh).toBe(false);
    expect(result.indexRebuildRecommended).toBe(true);
    expect(result.indexSource).toBe("memory");
  });

  it("reports a missing Skill instead of claiming freshness", async () => {
    const f = await indexedFixture();
    await unlink(f.file);
    expect((await inspectBm25Index({ indexDir: f.dir, catalog: f.catalog })).fresh).toBe(false);
  });

  it("rejects old algorithm artifacts even when the catalog hash matches", async () => {
    const f = await indexedFixture();
    await writeFile(
      path.join(f.dir, "bm25.json"),
      JSON.stringify({ ...f.router.toArtifact(), version: 1 }),
    );
    const checked = await inspectBm25Index({ indexDir: f.dir, catalog: f.catalog });
    expect(checked.fresh).toBe(false);
    expect(checked.reason).toContain("index --rebuild");
    const result = await skillSearch({
      query: "merge pdf",
      catalogPath: path.join(f.dir, "catalog.json"),
      indexDir: f.dir,
    });
    expect(result.results[0]?.name).toBe("pdf-merge");
    expect(result.indexSource).toBe("memory");
  });

  it("supports the lowercase skill.md convention used by the scanner", async () => {
    const f = await indexedFixture();
    await rename(f.file, path.join(f.dir, "skill.md"));
    expect((await inspectBm25Index({ indexDir: f.dir, catalog: f.catalog })).fresh).toBe(true);
  });

  it("does not follow a SKILL.md link outside its Skill root", async () => {
    const f = await indexedFixture();
    const outside = await mkdtemp(path.join(tmpdir(), "skill-hub-outside-content-"));
    const outsideFile = path.join(outside, "SKILL.md");
    await rename(f.file, outsideFile);
    await symlink(outsideFile, f.file);
    expect((await inspectBm25Index({ indexDir: f.dir, catalog: f.catalog })).fresh).toBe(false);
  });
});
