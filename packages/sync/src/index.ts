/**
 * @skill-hub/sync — 备份 / 分发计划 / apply / verify / restore。
 *
 * 安全约定：
 * - plan 永不写盘
 * - apply 按 config.sync.mode 创建/更新 symlink 或实体副本，永不静默覆盖真实目录
 * - CLI 对生产路径默认还需 --yes --allow-write
 */

export type {
  ApplyOptions,
  ApplyResult,
  BackupAgentEntry,
  BackupManifest,
  PlanSyncOptions,
  RestoreOptions,
  SyncAction,
  SyncPlan,
  SyncPlanItem,
  SyncMode,
  VerifyIssueKind,
  VerifyItem,
  VerifyReport,
} from "./types.js";

export { planSync, summarizeItems } from "./plan.js";
export { filterGlobalSyncSkills } from "./scope.js";
export type { SyncScopeExclusion } from "./scope.js";
export { applySync } from "./apply.js";
export { assertBackupReady, createBackup, readBackupManifest } from "./backup.js";
export type { BackupOptions } from "./backup.js";
export { verifySync } from "./verify.js";
export { restoreFromBackup } from "./restore.js";
export type { RestoreResult } from "./restore.js";

/** @deprecated */
export function syncPlaceholder(): string {
  return "skill-hub/sync";
}
