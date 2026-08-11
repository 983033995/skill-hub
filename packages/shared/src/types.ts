/**
 * 跨包共享的基础类型（配置摘要、结果外壳等）。
 * 领域实体（SkillMeta 等）以 core 为主；此处放配置与 IO 契约碎片。
 */

import type { ErrorCode } from "./errors.js";

/** 路由引擎标识（可插拔）。 */
export type RouterEngineId = "bm25" | "hybrid" | `external-${string}`;

export interface AgentMapping {
  id: string;
  skills_dir: string;
  enabled: boolean;
}

export interface RouterConfig {
  top_k: number;
  engine: RouterEngineId;
}

export interface SyncConfig {
  mode: "symlink" | "copy";
  conflict: "report" | "skip";
  require_backup: boolean;
}

export interface PrivacyConfig {
  telemetry: boolean;
}

/**
 * 运行时配置摘要（对应 `~/.skill-hub/config.yaml`）。
 * 路径字段可为 `~` 形式；使用前应 `expandUserPath` / `resolveAbsolutePath`。
 */
export interface HubConfig {
  version: number;
  canonical_dir: string;
  index_dir: string;
  backup_dir: string;
  agents: AgentMapping[];
  router: RouterConfig;
  sync: SyncConfig;
  privacy: PrivacyConfig;
}

/** CLI/库统一成功/失败外壳。 */
export type ResultOk<T> = { ok: true; data: T };
export type ResultErr = {
  ok: false;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};
export type Result<T> = ResultOk<T> | ResultErr;

export function ok<T>(data: T): ResultOk<T> {
  return { ok: true, data };
}

export function err(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ResultErr {
  return details === undefined
    ? { ok: false, code, message }
    : { ok: false, code, message, details };
}
