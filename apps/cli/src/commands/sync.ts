import {
  catalogToSkillMetas,
  defaultHubConfig,
  loadHubConfig,
  readCatalog,
  resolveHubConfigPaths,
  scanSkills,
  type SkillMeta,
} from "@skill-hub/core";
import {
  applySync,
  assertBackupReady,
  planSync,
} from "@skill-hub/sync";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import path from "node:path";
import { printJson, printLines } from "../output.js";

export async function runSync(options: {
  json: boolean;
  apply: boolean;
  dryRun: boolean;
  requireBackup: boolean;
  yes: boolean;
  allowWrite: boolean;
  backupDir?: string;
  configPath?: string;
  catalogPath?: string;
  /** 仅这些 agent id */
  agents?: string[];
  /** 仅 create_symlink，不 update、不碰真实目录 */
  createOnly: boolean;
  /**
   * 真实目录/文件：先 stash 到 backup-dir/replaced-real 再 symlink。
   * 与 createOnly 互斥。
   */
  replaceReal: boolean;
}): Promise<number> {
  const wantApply = options.apply && !options.dryRun;

  if (options.createOnly && options.replaceReal) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: "--create-only 与 --replace-real 互斥，请只选其一。",
    });
  }

  // 生产写入双重闸门：--apply --yes --allow-write
  if (wantApply) {
    if (!options.yes || !options.allowWrite) {
      throw new SkillHubError({
        code: "E_SYNC",
        message:
          "sync --apply 需要同时提供 --yes --allow-write（将修改各 Agent skills 目录的 symlink）。可先 --dry-run。",
      });
    }
  }

  const dryRun = !wantApply;
  const config = resolveHubConfigPaths(
    options.configPath
      ? await loadHubConfig(options.configPath)
      : await loadHubConfig().catch(() => defaultHubConfig()),
  );

  const requireBackup =
    options.requireBackup ||
    (wantApply && config.sync.require_backup) ||
    (wantApply && options.replaceReal);

  if (wantApply && requireBackup) {
    const backupDir = options.backupDir;
    if (!backupDir) {
      throw new SkillHubError({
        code: "E_BACKUP",
        message:
          "sync --apply 要求备份：请先 skill-hub backup，并用 --backup-dir <path> 指向含 manifest.json 的备份目录（replace-real 强制需要）",
      });
    }
    await assertBackupReady(backupDir);
  }

  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;

  let skills: SkillMeta[] = [];
  try {
    skills = catalogToSkillMetas(await readCatalog(catalogPath));
  } catch {
    try {
      skills = await scanSkills(layout.skills);
    } catch {
      skills = [];
    }
  }

  const plan = await planSync(config, skills, {
    dryRun,
    agents: options.agents,
    createOnly: options.createOnly,
    replaceReal: options.replaceReal,
  });

  const modeNote = [
    options.agents?.length ? `agents=${options.agents.join(",")}` : "agents=all-enabled",
    options.createOnly ? "create-only" : options.replaceReal ? "replace-real" : "full-actions",
  ].join(" ");

  const replaceStashDir = options.backupDir
    ? path.join(resolveAbsolutePath(options.backupDir), "replaced-real")
    : undefined;

  if (!wantApply) {
    const createItems = plan.items.filter((i) => i.action === "create_symlink");
    const replaceItems = plan.items.filter((i) => i.action === "replace_real");
    const updateItems = plan.items.filter((i) => i.action === "update_symlink");
    const skippedItems = plan.items.filter((i) => i.action === "skipped");
    const result = {
      dryRun: true,
      require_backup: requireBackup,
      createOnly: options.createOnly,
      replaceReal: options.replaceReal,
      agents: options.agents ?? null,
      replace_stash_dir: replaceStashDir ?? null,
      summary: plan.summary,
      itemCount: plan.items.length,
      createCount: createItems.length,
      replaceCount: replaceItems.length,
      updateCount: updateItems.length,
      skippedCount: skippedItems.length,
      items: plan.items,
      note: `dry-run (${modeNote})：未修改任何路径。apply 需 --apply --yes --allow-write --backup-dir${options.replaceReal ? " --replace-real" : ""}${options.createOnly ? " --create-only" : ""}`,
    };
    if (options.json) printJson(result);
    else {
      printLines(
        [
          `sync plan (dry-run=true ${modeNote})`,
          `  create=${plan.summary.create} update=${plan.summary.update} replace=${plan.summary.replace} conflict=${plan.summary.conflict} noop=${plan.summary.noop} skipped=${skippedItems.length}`,
          ...replaceItems.slice(0, 30).map(
            (i) =>
              `  [replace] ${i.agentId}:${i.skillName} → stash then → ${i.source}`,
          ),
          replaceItems.length > 30 ? `  ... +${replaceItems.length - 30} more replaces` : "",
          ...createItems.slice(0, 20).map(
            (i) =>
              `  [create] ${i.agentId}:${i.skillName} → ${i.target}`,
          ),
          createItems.length > 20 ? `  ... +${createItems.length - 20} more creates` : "",
          options.replaceReal
            ? `  note: replace-real 将把真实目录/文件迁入 ${replaceStashDir ?? "<backup-dir>/replaced-real"}`
            : "",
          options.createOnly
            ? `  note: create-only 已将非 create 项标为 skipped`
            : "",
          result.note,
        ].filter(Boolean),
      );
    }
    if (options.createOnly || options.replaceReal) return 0;
    return plan.summary.conflict > 0 ? 2 : 0;
  }

  const applied = await applySync(plan, {
    dryRun: false,
    createOnly: options.createOnly,
    replaceStashDir: options.replaceReal ? replaceStashDir : undefined,
  });
  const result = {
    dryRun: false,
    require_backup: requireBackup,
    backup_dir: options.backupDir ?? null,
    replace_stash_dir: options.replaceReal ? replaceStashDir ?? null : null,
    createOnly: options.createOnly,
    replaceReal: options.replaceReal,
    agents: options.agents ?? null,
    plan_summary: plan.summary,
    apply: {
      applied: applied.applied,
      skipped: applied.skipped,
      failed: applied.failed,
    },
    items: applied.items,
  };

  if (options.json) printJson(result);
  else {
    printLines(
      [
        `sync APPLY (${modeNote})`,
        `  plan: create=${plan.summary.create} update=${plan.summary.update} replace=${plan.summary.replace} conflict=${plan.summary.conflict} noop=${plan.summary.noop}`,
        `  result: applied=${applied.applied} skipped=${applied.skipped} failed=${applied.failed}`,
        options.replaceReal && replaceStashDir ? `  stash: ${replaceStashDir}` : "",
        ...applied.items
          .filter((i) => i.result === "applied")
          .slice(0, 40)
          .map((i) => `  + ${i.action} ${i.agentId}:${i.skillName}`),
        applied.applied > 40 ? `  ... +${applied.applied - 40} more` : "",
        ...applied.items
          .filter((i) => i.result === "failed")
          .map((i) => `  FAIL ${i.agentId}:${i.skillName} ${i.error ?? ""}`),
      ].filter(Boolean),
    );
  }

  if (applied.failed > 0) return 1;
  if (!options.createOnly && !options.replaceReal && plan.summary.conflict > 0) return 2;
  return 0;
}
