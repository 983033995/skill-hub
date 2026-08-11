/**
 * Core 领域类型（对齐 DATA_MODEL / API.md）。
 */

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
  source?: string;
}

export interface ConflictVariant {
  path: string;
  hash: string;
  agentId?: string;
}

export interface Conflict {
  name: string;
  variants: ConflictVariant[];
}

export interface CatalogSkillEntry {
  name: string;
  description: string;
  path: string;
  hash: string;
  mtimeMs?: number;
  keywords?: string[];
  source?: string;
}

export interface Catalog {
  version: 1;
  updatedAt: string;
  skills: Record<string, CatalogSkillEntry>;
}

export interface ScanOptions {
  /** 附加到 SkillMeta.source */
  source?: string;
  agentId?: string;
  /** 默认 4；防止极深目录 */
  maxDepth?: number;
}
