import { mkdir, writeFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import {
  appendHistory,
  loadHubConfig,
  resolveHubConfigPaths,
  catalogToSkillMetas,
  catalogHash,
  createEmptyCatalog,
  readCatalog,
  scanSkills,
  skillMetaToCatalogEntry,
  writeCatalog,
} from "@skill-hub/core";
import { createBm25Router } from "@skill-hub/router";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
  isPathInside,
} from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runIndex(options: {
  json: boolean;
  rebuild: boolean;
  catalogPath?: string;
  indexDir?: string;
  configPath?: string;
  quiet?: boolean;
}): Promise<number> {
  const layout = hubLayout(getDefaultHubHome());
  const config = resolveHubConfigPaths(await loadHubConfig(options.configPath));
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;
  const indexDir = options.indexDir ? resolveAbsolutePath(options.indexDir) : config.index_dir;

  let catalog: Awaited<ReturnType<typeof readCatalog>>;
  try {
    catalog = await readCatalog(catalogPath);
  } catch (err) {
    const exists = await lstat(catalogPath).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (exists) throw err;
    if (!options.rebuild) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: `catalog 不存在，请先 ingest 或 index --rebuild 从 canonical 扫描: ${catalogPath}`,
        details: { path: catalogPath },
      });
    }
    catalog = createEmptyCatalog();
  }

  let skills = catalogToSkillMetas(catalog);
  if (options.rebuild || skills.length === 0) {
    {
      const issues: Array<{ path: string; message: string }> = [];
      skills = await scanSkills(config.canonical_dir, {
        onIssue: (issue) => issues.push(issue),
        source: config.canonical_dir,
        provenance: {
          scope: "user",
          sourceType: "local",
          sourceRef: config.canonical_dir,
        },
      });
      if (issues.length)
        throw new SkillHubError({
          code: "E_INDEX",
          message: `canonical 扫描不完整: ${JSON.stringify(issues)}`,
        });
      const previousEntries = catalog.skills;
      const physicalCanonical = await realpath(config.canonical_dir);
      catalog = {
        version: 1 as const,
        updatedAt: new Date().toISOString(),
        skills: Object.fromEntries([
          ...Object.entries(previousEntries).filter(
            ([, entry]) =>
              !isPathInside(entry.path, config.canonical_dir) &&
              !isPathInside(entry.path, physicalCanonical),
          ),
          ...skills.map((s) => {
            const entry = skillMetaToCatalogEntry(s);
            const previous = previousEntries[s.name];
            if (previous?.provenance) entry.provenance = { ...previous.provenance };
            if (previous?.source) entry.source = previous.source;
            return [s.name, entry];
          }),
        ]),
      };
      await writeCatalog(catalogPath, catalog);
      skills = catalogToSkillMetas(catalog);
    }
  }

  const router = createBm25Router();
  await router.build(skills);

  await mkdir(indexDir, { recursive: true });
  const currentCatalogHash = catalogHash(catalog);
  const artifactPath = path.join(indexDir, "bm25.json");
  await writeFile(artifactPath, `${JSON.stringify(router.toArtifact(), null, 2)}\n`);
  const meta = {
    version: 1 as const,
    engine: "bm25",
    builtAt: new Date().toISOString(),
    skillCount: skills.length,
    catalogHash: currentCatalogHash,
    artifact: path.basename(artifactPath),
    artifactFormat: "skill-hub.bm25.v1",
  };
  await writeFile(path.join(indexDir, "index-meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  await appendHistory(layout.history, {
    at: meta.builtAt,
    type: "index",
    action: options.rebuild ? "rebuild" : "build",
    detail: {
      engine: meta.engine,
      skillCount: meta.skillCount,
      catalogHash: meta.catalogHash,
      artifact: artifactPath,
    },
  });

  const result = {
    ok: true,
    ...meta,
    catalogPath,
    indexDir,
  };

  if (options.quiet) return 0;
  if (options.json) printJson(result);
  else {
    printLines([
      `index built  engine=bm25  skills=${meta.skillCount}`,
      `  catalog: ${catalogPath}`,
      `  meta:    ${path.join(indexDir, "index-meta.json")}`,
      `  artifact: ${artifactPath}`,
    ]);
  }
  return 0;
}
