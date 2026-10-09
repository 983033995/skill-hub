import { lstat } from "node:fs/promises";
import {
  appendHistoryBatch,
  createEmptyCatalog,
  detectConflicts,
  hashSkillTree,
  materializeToCanonical,
  readCatalog,
  scanSkills,
  sourceMappingToProvenance,
  upsertSkills,
  writeCatalog,
  type SkillMeta,
} from "@skill-hub/core";
import {
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
  type SkillSourceMapping,
  isPathInside,
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
  canonicalDir?: string;
  backupDir?: string;
  /** 可选配置 source；传入后 --sources 可使用 source id。 */
  sourceMappings?: SkillSourceMapping[];
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
  } catch (err) {
    const exists = await lstat(catalogPath).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (exists) throw err;
    catalog = createEmptyCatalog();
  }
  const previousCatalog = catalog;
  const canonicalDir = resolveAbsolutePath(options.canonicalDir ?? layout.skills);

  const scanned: SkillMeta[] = [];
  const resolvedSources: Array<{ requested: string; path: string; sourceId?: string }> = [];
  for (const requested of options.sources) {
    const mapping = (options.sourceMappings ?? []).find(
      (s) => s.id === requested || resolveAbsolutePath(s.path) === resolveAbsolutePath(requested),
    );
    const abs = resolveAbsolutePath(mapping?.path ?? requested);
    const provenance = mapping
      ? sourceMappingToProvenance(mapping, abs)
      : { scope: "user" as const, sourceType: "local" as const, sourceRef: abs };
    const scanIssues: Array<{ path: string; message: string }> = [];
    const skills = await scanSkills(abs, {
      onIssue: (issue) => scanIssues.push(issue),
      source: abs,
      provenance,
      maxDepth: 5,
    });
    if (scanIssues.length) throw new Error(`来源扫描不完整: ${JSON.stringify(scanIssues)}`);
    scanned.push(...skills);
    resolvedSources.push({ requested, path: abs, sourceId: mapping?.id });
  }

  // 附件参与冲突检测；同名冲突未明确选源时不导入任何一方。
  const trees = new Map<string, string>();
  for (const skill of scanned) trees.set(skill.path, await hashSkillTree(skill.path));
  const conflicts = detectConflicts(
    scanned.map((skill) => ({ ...skill, hash: trees.get(skill.path)! })),
  );
  const conflictNames = new Set(conflicts.map((c) => c.name));
  const groups = new Map<string, SkillMeta[]>();
  for (const skill of scanned) groups.set(skill.name, [...(groups.get(skill.name) ?? []), skill]);
  const selected: SkillMeta[] = [];
  const unresolved: string[] = [];
  for (const [name, variants] of groups) {
    if (!conflictNames.has(name)) {
      selected.push(variants[0]!);
      continue;
    }
    const preferred = options.prefer
      ? variants.filter((skill) => isPathInside(skill.path, options.prefer!))
      : [];
    if (preferred.length && new Set(preferred.map((skill) => trees.get(skill.path))).size === 1) {
      selected.push(preferred[0]!);
    } else unresolved.push(name);
  }
  // report 模式整个批次不写；skip 模式仅导入无冲突项。
  if (unresolved.length && options.conflictMode === "report" && !options.dryRun) {
    if (options.json)
      printJson({
        dryRun: false,
        applied: false,
        conflicts,
        unresolved,
        note: "未写入：请 --prefer 选择来源或 --conflict skip",
      });
    else printLines([`导入已停止：${unresolved.length} 个未解决冲突`, ...unresolved]);
    return 2;
  }

  let materializeSummary: {
    copied: string[];
    skipped: Array<{ name: string; reason: string }>;
    failed: Array<{ name: string; error: string }>;
  } | null = null;

  let catalogSkills: SkillMeta[] = selected;
  let skippedUpsert: string[] = [];
  let updated: string[] = [];

  if (options.materialize) {
    const mat = await materializeToCanonical(selected, canonicalDir, {
      force: options.forceMaterialize === true,
      dryRun: options.dryRun,
      backupDir: options.backupDir,
    });
    materializeSummary = { copied: mat.copied, skipped: mat.skipped, failed: mat.failed };
    catalogSkills = mat.skills;
    const upserted = upsertSkills(catalog, catalogSkills, { skipOnHashConflict: false });
    catalog = upserted.catalog;
    updated = upserted.updated;
    skippedUpsert = [
      ...unresolved,
      ...mat.skipped.filter((s) => s.reason.includes("冲突")).map((s) => s.name),
    ];
    if (!options.dryRun && updated.length) await writeCatalog(catalogPath, catalog);
  } else {
    const upserted = upsertSkills(catalog, selected, {
      skipOnHashConflict: !options.prefer || options.conflictMode === "skip",
    });
    catalog = upserted.catalog;
    updated = upserted.updated;
    skippedUpsert = [...unresolved, ...upserted.skipped];
    if (!options.dryRun && updated.length) await writeCatalog(catalogPath, catalog);
  }
  const preview = catalog;

  if (!options.dryRun && updated.length > 0) {
    const now = new Date().toISOString();
    await appendHistoryBatch(
      layout.history,
      updated.flatMap((name) => {
        const next = catalog.skills[name];
        if (!next) return [];
        const previous = previousCatalog.skills[name];
        const type = next.provenance?.overlayOf ? "overlay" : "ingest";
        return [
          {
            at: now,
            type,
            name,
            action: previous ? "update" : "create",
            previousHash: previous?.hash,
            hash: next.hash,
            revision: next.provenance?.revision,
            source: next.source ?? next.provenance?.sourceRef,
            provenance: next.provenance,
            path: next.path,
            detail: { catalogPath, materialize: options.materialize },
          } as const,
        ];
      }),
    );
  }

  const result = {
    dryRun: options.dryRun,
    materializeEnabled: options.materialize && !options.dryRun,
    sources: resolvedSources,
    prefer: options.prefer ? resolveAbsolutePath(options.prefer) : null,
    scanned: scanned.length,
    selected: selected.length,
    updated: updated.length,
    skipped: skippedUpsert,
    conflicts,
    materialize: materializeSummary,
    catalogPath,
    catalogSkillCount: Object.keys(preview.skills).length,
    canonicalDir,
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
        ...result.conflicts.map((c) => `    - ${c.name} (${c.variants.length} variants)`),
      ]);
    }
    if (materializeSummary?.failed.length) {
      printLines([
        "  materialize failed:",
        ...materializeSummary.failed.slice(0, 20).map((f) => `    - ${f.name}: ${f.error}`),
      ]);
    }
  }

  if (materializeSummary && materializeSummary.failed.length > 0) return 3;
  return skippedUpsert.length > 0 ? 2 : 0;
}
