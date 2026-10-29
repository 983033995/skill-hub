import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyCatalog, updateCatalog } from "@skill-hub/core";
import { getDefaultHubHome, hubLayout } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

async function exists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (isMissingPath(error)) return false;
    throw error;
  }
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

export async function runInit(options: { json: boolean; force: boolean }): Promise<number> {
  const layout = hubLayout(getDefaultHubHome());
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of [layout.home, layout.skills, layout.index, layout.backups]) {
    try {
      await access(dir, fsConstants.F_OK);
      skipped.push(dir);
    } catch (error) {
      if (!isMissingPath(error)) throw error;
      await mkdir(dir, { recursive: true });
      created.push(dir);
    }
  }

  // config.yaml
  let configAction = "skipped";
  const configExists = await exists(layout.config);
  if (configExists) {
    if (options.force) {
      await writeDefaultConfig(layout.config);
      configAction = "overwritten";
    }
  } else {
    await writeDefaultConfig(layout.config);
    configAction = "created";
    created.push(layout.config);
  }

  // catalog.json
  let catalogAction = "skipped";
  const catalogExists = await exists(layout.catalog);
  if (catalogExists) {
    if (options.force) {
      await updateCatalog(layout.catalog, () => createEmptyCatalog());
      catalogAction = "overwritten";
    }
  } else {
    await updateCatalog(layout.catalog, (current, alreadyExists) =>
      alreadyExists ? current : createEmptyCatalog(),
    );
    catalogAction = "created";
    created.push(layout.catalog);
  }

  const result = {
    ok: true,
    home: layout.home,
    created,
    skipped,
    config: { path: layout.config, action: configAction },
    catalog: { path: layout.catalog, action: catalogAction },
  };

  if (options.json) printJson(result);
  else {
    printLines([
      `init hub → ${layout.home}`,
      `  config:  ${configAction}`,
      `  catalog: ${catalogAction}`,
      `  created dirs: ${created.filter((c) => !c.endsWith(".yaml") && !c.endsWith(".json")).length}`,
    ]);
  }
  return 0;
}

async function writeDefaultConfig(target: string): Promise<void> {
  // 优先从仓库模板复制
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../../configs/agents/default.yaml"),
    path.resolve(process.cwd(), "configs/agents/default.yaml"),
  ];
  for (const c of candidates) {
    let template: string;
    try {
      template = await readFile(c, "utf8");
    } catch (error) {
      if (isMissingPath(error)) continue;
      throw error;
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, template.replaceAll("~/.skill-hub", getDefaultHubHome()), "utf8");
    return;
  }
  const fallback = `version: 1
canonical_dir: ~/.skill-hub/skills
index_dir: ~/.skill-hub/index
backup_dir: ~/.skill-hub/backups
agents:
  - id: workbuddy
    skills_dir: ~/.workbuddy/skills
    enabled: true
sources: []
router:
  top_k: 5
  engine: bm25
sync:
  mode: symlink
  conflict: report
  require_backup: true
privacy:
  telemetry: false
`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, fallback.replaceAll("~/.skill-hub", getDefaultHubHome()), "utf8");
}
