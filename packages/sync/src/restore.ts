import { rm } from "node:fs/promises";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";
import { readBackupManifest } from "./backup.js";
import { copyPathRecursive, pathExists } from "./fs-utils.js";
import type { BackupManifest, RestoreOptions } from "./types.js";

export interface RestoreResult {
  dryRun: boolean;
  restored: string[];
  skipped: Array<{ id: string; reason: string }>;
  manifest: BackupManifest;
}

/**
 * 将 backup 中的 agent skills 快照恢复到 manifest 记录的原路径。
 * 破坏性：会替换目标目录内容 —— 仅在 dryRun=false 时执行。
 */
export async function restoreFromBackup(
  manifestOrDir: string,
  options: RestoreOptions = {},
): Promise<RestoreResult> {
  const manifest = await readBackupManifest(manifestOrDir);
  const dryRun = options.dryRun === true;
  const filter = options.agents ? new Set(options.agents) : null;
  const restored: string[] = [];
  const skipped: RestoreResult["skipped"] = [];

  for (const agent of manifest.agents) {
    if (filter && !filter.has(agent.id)) {
      skipped.push({ id: agent.id, reason: "不在 --agents 过滤中" });
      continue;
    }
    if (!agent.exists || agent.skipped) {
      skipped.push({ id: agent.id, reason: agent.error ?? "备份时无源" });
      continue;
    }
    if (!(await pathExists(agent.backupPath))) {
      skipped.push({ id: agent.id, reason: `备份路径不存在: ${agent.backupPath}` });
      continue;
    }

    if (dryRun) {
      restored.push(agent.id);
      continue;
    }

    try {
      // 先清目标再复制（目标路径是 skills 目录本身）
      if (await pathExists(agent.path)) {
        await rm(agent.path, { recursive: true, force: true });
      }
      await copyPathRecursive(agent.backupPath, agent.path);
      restored.push(agent.id);
    } catch (err) {
      throw new SkillHubError({
        code: "E_BACKUP",
        message: `恢复失败 agent=${agent.id}`,
        details: {
          id: agent.id,
          from: agent.backupPath,
          to: agent.path,
        },
        cause: err,
      });
    }
  }

  // 可选恢复 canonical
  if (manifest.canonical?.exists && (await pathExists(manifest.canonical.backupPath))) {
    const id = "canonical";
    if (!filter || filter.has(id)) {
      if (!dryRun) {
        if (await pathExists(manifest.canonical.path)) {
          await rm(manifest.canonical.path, { recursive: true, force: true });
        }
        await copyPathRecursive(manifest.canonical.backupPath, manifest.canonical.path);
      }
      restored.push(id);
    }
  }

  void path;
  return { dryRun, restored, skipped, manifest };
}
