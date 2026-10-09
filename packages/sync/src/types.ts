export type SyncAction =
  | "create_symlink"
  | "update_symlink"
  | "replace_real"
  | "create_copy"
  | "update_copy"
  | "replace_real_copy"
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
  /** 生成计划时 catalog 中的 SKILL.md hash；apply 可据此拒绝陈旧 source。 */
  expectedSkillHash?: string;
  detail?: string;
}

export interface SyncPlan {
  dryRun: boolean;
  generatedAt: string;
  mode: SyncMode;
  /** 由 planSync 填充；供 apply 在写入前复核 source 的 canonical 边界。 */
  canonicalDir?: string;
  items: SyncPlanItem[];
  summary: {
    create: number;
    update: number;
    replace: number;
    conflict: number;
    noop: number;
  };
}

export type SyncMode = "symlink" | "copy";

export interface PlanSyncOptions {
  /** 默认 true */
  dryRun?: boolean;
  /** 仅规划这些 agent id（与 config.agents.id 匹配） */
  agents?: string[];
  /** 分发模式；默认读取 config.sync.mode。 */
  mode?: SyncMode;
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
  /** true 只预览；false 执行，调用方必须先完成授权与备份检查。 */
  dryRun?: boolean;
  /** 跳过 conflict 项（默认 true：apply 本就不写 conflict） */
  skipConflicts?: boolean;
  /** 仅执行 create 项，跳过 update / replace */
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
  | "not_copy"
  | "broken_symlink"
  | "wrong_target"
  | "content_mismatch"
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
    not_copy: number;
    broken_symlink: number;
    wrong_target: number;
    content_mismatch: number;
  };
  items: VerifyItem[];
}

export interface RestoreOptions {
  /** true 则不写盘 */
  dryRun?: boolean;
  /** 只恢复指定 agent id */
  agents?: string[];
}
