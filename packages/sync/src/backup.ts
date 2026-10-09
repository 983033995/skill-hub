import { randomUUID } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import type { HubConfig } from "@skill-hub/shared";
import { SkillHubError, expandUserPath, resolveAbsolutePath } from "@skill-hub/shared";
import {
  backupTimestamp,
  copyPathRecursive,
  countEntries,
  pathExists,
  writeJson,
} from "./fs-utils.js";
import type { BackupManifest, BackupAgentEntry } from "./types.js";

export interface BackupOptions {
  /** 备份根目录，默认 config.backup_dir */
  backupRoot?: string;
  notes?: string;
  /** 是否一并备份 canonical skills */
  includeCanonical?: boolean;
  hubMeta?: { catalogPath?: string; configPath?: string };
  /** dry-run：只返回将写入的计划，不复制 */
  dryRun?: boolean;
  now?: Date;
}

/**
 * 备份各 enabled agent 的 skills 目录（及可选 canonical）到 backupDir，并写 manifest.json。
 * 使用 `cp` 解引用复制，保留内容快照，不改源目录。
 */
export async function createBackup(
  config: HubConfig,
  options: BackupOptions = {},
): Promise<BackupManifest> {
  const now = options.now ?? new Date();
  const backupRoot = expandUserPath(options.backupRoot ?? config.backup_dir);
  const backupDir = path.join(backupRoot, `${backupTimestamp(now)}-${randomUUID().slice(0, 8)}`);
  const dryRun = options.dryRun === true;

  const agents: BackupAgentEntry[] = [];

  for (const agent of config.agents.filter((a) => a.enabled)) {
    const src = expandUserPath(agent.skills_dir);
    const dest = path.join(backupDir, `${agent.id}-skills`);
    let exists = false;
    try {
      await access(src, fsConstants.R_OK);
      exists = true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT")
        throw new SkillHubError({
          code: "E_BACKUP",
          message: `无法读取备份来源: ${src}`,
          cause: err,
        });
      exists = false;
    }

    if (!exists) {
      agents.push({
        id: agent.id,
        path: src,
        backupPath: dest,
        exists: false,
        entryCount: 0,
        skipped: true,
        error: "源目录不存在或不可读",
      });
      continue;
    }

    const entryCount = await countEntries(src);
    if (!dryRun) {
      try {
        await copyPathRecursive(src, dest);
      } catch (err) {
        throw new SkillHubError({
          code: "E_BACKUP",
          message: `Agent 备份失败，不生成成功 manifest: ${agent.id}`,
          details: { backupDir, source: src },
          cause: err,
        });
      }
    }

    agents.push({
      id: agent.id,
      path: src,
      backupPath: dest,
      exists: true,
      entryCount,
    });
  }

  let canonical: BackupManifest["canonical"];
  if (options.includeCanonical !== false) {
    const cSrc = expandUserPath(config.canonical_dir);
    const cDest = path.join(backupDir, "canonical-skills");
    const exists = await pathExists(cSrc);
    if (exists) {
      const entryCount = await countEntries(cSrc);
      if (!dryRun) {
        await copyPathRecursive(cSrc, cDest);
      }
      canonical = {
        path: cSrc,
        backupPath: cDest,
        exists: true,
        entryCount,
      };
    } else {
      canonical = {
        path: cSrc,
        backupPath: cDest,
        exists: false,
        entryCount: 0,
      };
    }
  }

  const manifest: BackupManifest = {
    version: 1,
    createdAt: now.toISOString(),
    backupDir,
    notes: options.notes,
    agents,
    canonical,
    hub: options.hubMeta,
  };

  if (!dryRun) {
    await writeJson(path.join(backupDir, "manifest.json"), manifest);
  }

  return manifest;
}

export async function readBackupManifest(manifestOrDir: string): Promise<BackupManifest> {
  const abs = resolveAbsolutePath(manifestOrDir);
  let file = abs;
  if (!abs.endsWith("manifest.json")) {
    file = path.join(abs, "manifest.json");
  }
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new SkillHubError({
      code: "E_BACKUP",
      message: `无法读取 backup manifest: ${file}`,
      details: { path: file },
      cause: err,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: `backup manifest JSON 无效: ${file}`,
      cause: err,
    });
  }
  if (!parsed || typeof parsed !== "object") {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "backup manifest 根必须是对象",
    });
  }
  const m = parsed as BackupManifest;
  if (m.version !== 1 || !m.backupDir || !Array.isArray(m.agents)) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "backup manifest 字段不完整",
      details: { path: file },
    });
  }
  return m;
}

/**
 * 检查 backupDir 是否存在且含有效 manifest（用于 require_backup）。
 */
export async function assertBackupReady(
  backupDir: string,
  config?: HubConfig,
): Promise<BackupManifest> {
  const root = resolveAbsolutePath(backupDir);
  const manifest = await readBackupManifest(root);
  if (resolveAbsolutePath(manifest.backupDir) !== root)
    throw new SkillHubError({
      code: "E_BACKUP",
      message: "manifest backupDir 与实际备份目录不匹配",
    });
  const assertSnapshot = async (file: string) => {
    const rel = path.relative(root, resolveAbsolutePath(file));
    if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))
      throw new SkillHubError({ code: "E_BACKUP", message: `快照路径不在备份目录内: ${file}` });
    if (!(await stat(file)).isDirectory())
      throw new SkillHubError({ code: "E_BACKUP", message: `快照不存在或不是目录: ${file}` });
  };
  for (const agent of manifest.agents) {
    if (agent.exists && (agent.skipped || agent.error))
      throw new SkillHubError({ code: "E_BACKUP", message: `Agent 备份不完整: ${agent.id}` });
    if (agent.exists) await assertSnapshot(agent.backupPath);
  }
  if (manifest.canonical?.exists) await assertSnapshot(manifest.canonical.backupPath);
  if (config) {
    for (const agent of config.agents.filter((a) => a.enabled)) {
      const record = manifest.agents.find(
        (a) =>
          a.id === agent.id &&
          resolveAbsolutePath(a.path) === resolveAbsolutePath(agent.skills_dir),
      );
      if (!record)
        throw new SkillHubError({ code: "E_BACKUP", message: `备份未覆盖同步目标: ${agent.id}` });
      if (!record.exists && (await pathExists(expandUserPath(agent.skills_dir))))
        throw new SkillHubError({
          code: "E_BACKUP",
          message: `目标在备份后出现，必须重新备份: ${agent.id}`,
        });
    }
  }
  return manifest;
}
