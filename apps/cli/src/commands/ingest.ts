import {
  buildCatalog,
  createEmptyCatalog,
  detectConflicts,
  materializeToCanonical,
  readCatalog,
  scanSkills,
  upsertSkills,
  writeCatalog,
  type SkillMeta,
} from "@skill-hub/core";
import {
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runIngest(options: {
  json: boolean;
  sources: string[];
  dryRun: boolean;
  prefer?: string;
  conflictMode: "report" | "skip";
  catalogPath?: string;
  /** 复制 skill 正文到 ~/.skill-hub/skills（Canonical），默认 true */
  materialize: boolean;
  forceMaterialize?: boolean;
}): Promise<number> {
  if (options.sources.length === 0) {
    throw new Error("ingest 需要 --sources <dir>[,<dir>...]");
  }

  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;

  let catalog;
  try {
    catalog = await readCatalog(catalogPath);
  } catch {
    catalog = createEmptyCatalog();
  }

  const scanned: SkillMeta[] = [];
  for (const src of options.sources) {
    const abs = resolveAbsolutePath(src);
    const skills = await scanSkills(abs, { source: abs, maxDepth: 5 });
    scanned.push(...skills);
  }

  // prefer：同名时优先某一 source 前缀
  let selected = scanned;
  if (options.prefer) {
    const prefer = resolveAbsolutePath(options.prefer);
    const byName = new Map<string, SkillMeta>();
    for (const s of scanned) {
      const prev = byName.get(s.name);
      if (!prev) {
        byName.set(s.name, s);
        continue;
      }
      const prevPref =
        prev.path.startsWith(prefer) || (prev.source ?? "").startsWith(prefer);
      const curPref =
        s.path.startsWith(prefer) || (s.source ?? "").startsWith(prefer);
      if (curPref && !prevPref) byName.set(s.name, s);
    }
    selected = [...byName.values()];
  } else {
    // 无 prefer：同名保留扫描顺序中最后出现者（后面 source 覆盖）
    const byName = new Map<string, SkillMeta>();
    for (const s of scanned) byName.set(s.name, s);
    selected = [...byName.values()];
  }

  const conflicts = detectConflicts(scanned);

  let materializeSummary: {
    copied: string[];
    skipped: Array<{ name: string; reason: string }>;
    failed: Array<{ name: string; error: string }>;
  } | null = null;

  let catalogSkills: SkillMeta[] = selected;
  let skippedUpsert: string[] = [];
  let updated: string[] = [];

  if (!options.dryRun && options.materialize) {
    const mat = await materializeToCanonical(selected, layout.skills, {
      force: options.forceMaterialize === true,
    });
    materializeSummary = {
      copied: mat.copied,
      skipped: mat.skipped,
      failed: mat.failed,
    };
    catalogSkills = mat.skills;
    const upserted = upsertSkills(createEmptyCatalog(), catalogSkills, {
      skipOnHashConflict: false,
    });
    catalog = upserted.catalog;
    updated = upserted.updated;
    skippedUpsert = upserted.skipped;
    await writeCatalog(catalogPath, catalog);
  } else if (!options.dryRun) {
    const upserted = upsertSkills(catalog, selected, {
      skipOnHashConflict: options.conflictMode === "skip",
    });
    catalog = upserted.catalog;
    updated = upserted.updated;
    skippedUpsert = upserted.skipped;
    await writeCatalog(catalogPath, catalog);
  } else {
    const previewUpsert = upsertSkills(catalog, selected, {
      skipOnHashConflict: options.conflictMode === "skip",
    });
    updated = previewUpsert.updated;
    skippedUpsert = previewUpsert.skipped;
  }

  const preview = options.dryRun
    ? buildCatalog(selected)
    : catalog;

  const result = {
    dryRun: options.dryRun,
    materializeEnabled: options.materialize && !options.dryRun,
    sources: options.sources.map((s) => resolveAbsolutePath(s)),
    prefer: options.prefer ? resolveAbsolutePath(options.prefer) : null,
    scanned: scanned.length,
    selected: selected.length,
    updated: updated.length,
    skipped: skippedUpsert,
    conflicts,
    materialize: materializeSummary,
    catalogPath,
    catalogSkillCount: Object.keys(preview.skills).length,
    canonicalDir: layout.skills,
    note: options.dryRun
      ? "dry-run：未写入 catalog / canonical"
      : options.materialize
        ? "已物化到 canonical 并写入 catalog（未修改各 Agent skills 目录）"
        : "已写入 catalog（未复制 skill 文件；路径仍指向源目录）",
  };

  if (options.json) printJson(result);
  else {
    printLines([
      `ingest ${options.dryRun ? "(dry-run)" : ""}`.trim(),
      `  scanned:   ${result.scanned}`,
      `  selected:  ${result.selected}`,
      `  updated:   ${result.updated}`,
      `  skipped:   ${result.skipped.length}`,
      `  conflicts: ${result.conflicts.length}`,
      `  catalog:   ${catalogPath} (${result.catalogSkillCount} skills)`,
      materializeSummary
        ? `  materialize: copied=${materializeSummary.copied.length} skipped=${materializeSummary.skipped.length} failed=${materializeSummary.failed.length}`
        : `  materialize: ${options.dryRun ? "n/a (dry-run)" : options.materialize ? "requested" : "off"}`,
      `  note:      ${result.note}`,
    ]);
    if (result.conflicts.length > 0 && result.conflicts.length <= 30) {
      printLines([
        "  conflict names:",
        ...result.conflicts.map(
          (c) =>
            `    - ${c.name} (${c.variants.length} variants)`,
        ),
      ]);
    }
    if (materializeSummary?.failed.length) {
      printLines([
        "  materialize failed:",
        ...materializeSummary.failed.slice(0, 20).map(
          (f) => `    - ${f.name}: ${f.error}`,
        ),
      ]);
    }
  }

  if (materializeSummary && materializeSummary.failed.length > 0) return 3;
  return conflicts.length > 0 && options.conflictMode === "report" ? 2 : 0;
}
