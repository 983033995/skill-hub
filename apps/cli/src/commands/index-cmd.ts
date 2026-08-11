import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  catalogToSkillMetas,
  createEmptyCatalog,
  readCatalog,
  scanSkills,
  writeCatalog,
} from "@skill-hub/core";
import { createBm25Router } from "@skill-hub/router";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

function hashText(s: string): string {
  return `sha256:${createHash("sha256").update(s).digest("hex")}`;
}

export async function runIndex(options: {
  json: boolean;
  rebuild: boolean;
  catalogPath?: string;
  indexDir?: string;
}): Promise<number> {
  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;
  const indexDir = options.indexDir
    ? resolveAbsolutePath(options.indexDir)
    : layout.index;

  let catalog: Awaited<ReturnType<typeof readCatalog>>;
  try {
    catalog = await readCatalog(catalogPath);
  } catch {
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
    try {
      skills = await scanSkills(layout.skills, { source: layout.skills });
      catalog = {
        version: 1 as const,
        updatedAt: new Date().toISOString(),
        skills: Object.fromEntries(
          skills.map((s) => [
            s.name,
            {
              name: s.name,
              description: s.description,
              path: s.path,
              hash: s.hash,
              mtimeMs: s.mtimeMs,
              keywords: s.keywords,
              source: s.source,
            },
          ]),
        ),
      };
      await writeCatalog(catalogPath, catalog);
      skills = catalogToSkillMetas(catalog);
    } catch {
      // 允许空 catalog 继续写 meta
    }
  }

  const router = createBm25Router();
  await router.build(skills);

  await mkdir(indexDir, { recursive: true });
  const catalogHash = hashText(JSON.stringify(catalog.skills));
  const meta = {
    engine: "bm25",
    builtAt: new Date().toISOString(),
    skillCount: skills.length,
    catalogHash,
  };
  await writeFile(
    path.join(indexDir, "index-meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );

  const result = {
    ok: true,
    ...meta,
    catalogPath,
    indexDir,
  };

  if (options.json) printJson(result);
  else {
    printLines([
      `index built  engine=bm25  skills=${meta.skillCount}`,
      `  catalog: ${catalogPath}`,
      `  meta:    ${path.join(indexDir, "index-meta.json")}`,
    ]);
  }
  return 0;
}
