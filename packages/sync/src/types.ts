export type SyncAction =
  | "create_symlink"
  | "update_symlink"
  | "replace_real"
  | "conflict"
  | "noop"
  | "remove_orphan"
  | "skipped";

export interface SyncPlanItem {
  agentId: string;
  skillName: string;
  action: SyncAction;
  /** agent 侧目标路径 */
  target: string;
  /** canonical skill 路径 */
  source: string;
  detail?: string;
}

export interface SyncPlan {
  dryRun: boolean;
  generatedAt: string;
  items: SyncPlanItem[];
  summary: {
    create: number;
    update: number;
    replace: number;
    conflict: number;
    noop: number;
  };
}

export interface PlanSyncOptions {
  /** 默认 true */
  dryRun?: boolean;
  /** 仅规划这些 agent id（与 config.agents.id 匹配） */
  agents?: string[];
  /**
   * 仅计划「目标不存在」的 create_symlink。
   * update / conflict / noop 记为 skipped（不写入）。
   */
  createOnly?: boolean;
  /**
   * 将「真实目录/文件 conflict」转为 replace_real（apply 时先 stash 再 symlink）。
   * 与 createOnly 互斥（createOnly 优先）。
   */
  replaceReal?: boolean;
}

export interface BackupAgentEntry {
  id: string;
  path: string;
  backupPath: string;
  exists: boolean;
  entryCount: number;
  skipped?: boolean;
  error?: string;
}

export interface BackupManifest {
  version: 1;
  createdAt: string;
  backupDir: string;
  notes?: string;
  agents: BackupAgentEntry[];
  canonical?: {
    path: string;
    backupPath: string;
    exists: boolean;
    entryCount: number;
  };
  hub?: {
    catalogPath?: string;
    configPath?: string;
  };
}

export interface ApplyOptions {
  /** 必须 true 才会写入；false 只重算计划 */
  dryRun?: boolean;
  /** 跳过 conflict 项（默认 true：apply 本就不写 conflict） */
  skipConflicts?: boolean;
  /** 仅执行 create_symlink，跳过 update_symlink */
  createOnly?: boolean;
  /**
   * replace_real 时：把原真实路径迁到此目录下
   * `<stashDir>/<agentId>/<skillName>/`
   */
  replaceStashDir?: string;
}

export interface ApplyResult {
  dryRun: boolean;
  applied: number;
  skipped: number;
  failed: number;
  items: Array<SyncPlanItem & { result: "applied" | "skipped" | "failed"; error?: string }>;
}

export type VerifyIssueKind =
  | "missing"
  | "not_symlink"
  | "broken_symlink"
  | "wrong_target"
  | "ok";

export interface VerifyItem {
  agentId: string;
  skillName: string;
  target: string;
  expected: string;
  kind: VerifyIssueKind;
  detail?: string;
  suggestion?: string;
}

export interface VerifyReport {
  generatedAt: string;
  ok: boolean;
  summary: {
    ok: number;
    missing: number;
    not_symlink: number;
    broken_symlink: number;
    wrong_target: number;
  };
  items: VerifyItem[];
}

export interface RestoreOptions {
  /** true 则不写盘 */
  dryRun?: boolean;
  /** 只恢复指定 agent id */
  agents?: string[];
}
