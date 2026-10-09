import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalog, catalogHash, writeCatalog } from "@skill-hub/core";
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
