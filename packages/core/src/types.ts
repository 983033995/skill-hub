/**
 * Core 领域类型（对齐 DATA_MODEL / API.md）。
 */

import type { SkillProvenance } from "@skill-hub/shared";

export type { SkillProvenance, SkillScope, SkillSourceType, SkillStatus } from "@skill-hub/shared";

export interface SkillMeta {
  name: string;
  description: string;
  /** skill 目录绝对路径 */
  path: string;
  /** 如 `sha256:abc...` */
  hash: string;
  mtimeMs: number;
  keywords?: string[];
  agentsPresent?: string[];
  /** 旧 source 字段保留；新代码优先读取 provenance。 */
  source?: string;
  provenance?: SkillProvenance;
}

export interface ConflictVariant {
  path: string;
  hash: string;
  agentId?: string;
  source?: string;
  provenance?: SkillProvenance;
}

export interface Conflict {
  name: string;
  variants: ConflictVariant[];
  /** 按 scope/status/source 的确定性规则选出的解释性代表项。 */
  winner?: ConflictVariant;
  winnerReason?: string;
}

export interface CatalogSkillEntry {
  name: string;
  description: string;
  path: string;
  hash: string;
  mtimeMs?: number;
  keywords?: string[];
  source?: string;
  provenance?: SkillProvenance;
}

export interface Catalog {
  version: 1;
  updatedAt: string;
  skills: Record<string, CatalogSkillEntry>;
}

export interface ScanOptions {
  /** 盘点调用方可收集解析/权限/坏链/深度问题，避免把遗漏当作空目录。 */
  onIssue?: (issue: { path: string; message: string }) => void;
  /** 附加到 SkillMeta.source */
  source?: string;
  agentId?: string;
  provenance?: SkillProvenance;
  /** 默认 4；防止极深目录 */
  maxDepth?: number;
}
