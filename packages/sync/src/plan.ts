import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "@skill-hub/core";
import { type HubConfig, expandUserPath, resolveAbsolutePath } from "@skill-hub/shared";
import {
  assertSafeSkillName,
  compareCopyTree,
  inspectProjectionIntegrity,
  isErrno,
} from "./integrity.js";
import type { PlanSyncOptions, SyncMode, SyncPlan, SyncPlanItem } from "./types.js";

/**
 * 仅生成分发计划，**永不**创建 symlink 或 copy。
 *
 * 对每个 enabled agent × each skill：
 * - 目标不存在 → create
 * - 目标已正确投影 → noop
 * - 目标是其它 symlink → update
 * - 目标是真实目录/文件，或 source/路径不安全 → conflict
 */
export async function planSync(
  config: HubConfig,
  skills: SkillMeta[],
  options: PlanSyncOptions = {},
): Promise<SyncPlan> {
  const canonicalDir = expandUserPath(config.canonical_dir);
  const mode: SyncMode = options.mode ?? config.sync.mode;
  const dryRun = options.dryRun !== false;
  const items: SyncPlanItem[] = [];
  const agentFilter =
    options.agents && options.agents.length > 0
      ? new Set(options.agents.map((agent) => agent.trim()).filter(Boolean))
      : null;
  const replaceReal = options.replaceReal === true && options.createOnly !== true;

  const agents = config.agents.filter((agent) => {
    if (!agent.enabled) return false;
    if (agentFilter && !agentFilter.has(agent.id)) return false;
    return true;
  });

  for (const agent of agents) {
    const agentDir = expandUserPath(agent.skills_dir);
    for (const skill of skills) {
      let item = await planItem(agent.id, agentDir, canonicalDir, skill, mode, replaceReal);
      if (options.createOnly && item.action !== "create_symlink" && item.action !== "create_copy") {
        item = {
          ...item,
          action: "skipped",
          detail: `create-only: 原 action=${item.action}${item.detail ? ` (${item.detail})` : ""}`,
        };
      }
      items.push(item);
    }
  }

  return {
    dryRun,
    generatedAt: new Date().toISOString(),
    mode,
    canonicalDir,
    items,
    summary: summarizeItems(items),
  };
}

export function summarizeItems(items: SyncPlanItem[]): SyncPlan["summary"] {
  return {
    create: items.filter(
      (item) => item.action === "create_symlink" || item.action === "create_copy",
    ).length,
    update: items.filter(
      (item) => item.action === "update_symlink" || item.action === "update_copy",
    ).length,
    replace: items.filter(
      (item) => item.action === "replace_real" || item.action === "replace_real_copy",
    ).length,
    conflict: items.filter((item) => item.action === "conflict").length,
    noop: items.filter((item) => item.action === "noop").length,
  };
}

async function planItem(
  agentId: string,
  agentDir: string,
  canonicalDir: string,
  skill: SkillMeta,
  mode: SyncMode,
  replaceReal: boolean,
): Promise<SyncPlanItem> {
  let source: string;
  try {
    source = resolveAbsolutePath(skill.path);
  } catch (err) {
    return unsafeItem(agentId, skill.name, agentDir, String(skill.path), err);
  }

  let target = agentDir;
  try {
    assertSafeSkillName(skill.name);
    target = path.join(agentDir, skill.name);
  } catch (err) {
    return unsafeItem(agentId, skill.name, target, source, err);
  }

  const base: Omit<SyncPlanItem, "action" | "detail"> = {
    agentId,
    skillName: skill.name,
    target,
    source,
    expectedSkillHash: skill.hash,
  };

  let integrity;
  try {
    integrity = await inspectProjectionIntegrity({
      canonicalDir,
      source,
      target,
      skillName: skill.name,
      expectedSkillHash: skill.hash,
      requireTreeHash: mode === "copy",
    });
  } catch (err) {
    return {
      ...base,
      action: "conflict",
      detail: `拒绝不安全的同步投影: ${errorMessage(err)}`,
    };
  }

  let targetInfo;
  try {
    targetInfo = await lstat(target);
  } catch (err) {
    if (isErrno(err, "ENOENT")) {
      return createItem(base, mode);
    }
    return {
      ...base,
      action: "conflict",
      detail: `无法检查同步目标: ${errorMessage(err)}`,
    };
  }

  if (targetInfo.isSymbolicLink()) {
    if (mode === "copy") {
      return {
        ...base,
        action: "update_copy",
        detail: "目标是 symlink，copy 模式将替换为实体目录",
      };
    }

    let current: string;
    try {
      current = await realpath(target);
    } catch (err) {
      if (isErrno(err, "ENOENT")) {
        return { ...base, action: "update_symlink", detail: "死链，需重建" };
      }
      return {
        ...base,
        action: "conflict",
        detail: `无法读取现有 symlink: ${errorMessage(err)}`,
      };
    }
    if (path.resolve(current) === path.resolve(integrity.sourceReal)) {
      return { ...base, action: "noop", detail: "已指向 canonical" };
    }
    return {
      ...base,
      action: "update_symlink",
      detail: `当前指向 ${current}`,
    };
  }

  if (mode === "copy" && targetInfo.isDirectory()) {
    const comparison = await compareCopyTree(integrity, target, skill.hash);
    if (comparison.matches) {
      return { ...base, action: "noop", detail: "copy 目录内容已是最新" };
    }
    if (replaceReal) {
      return {
        ...base,
        action: "replace_real_copy",
        detail: `copy 内容不同：将 stash 后重新复制目录${comparison.detail ? `（${comparison.detail}）` : ""}`,
      };
    }
    return {
      ...base,
      action: "conflict",
      detail: `copy 目录内容不同，禁止静默覆盖${comparison.detail ? `（${comparison.detail}）` : ""}`,
    };
  }

  if (targetInfo.isDirectory() || targetInfo.isFile()) {
    if (replaceReal) {
      return {
        ...base,
        action: mode === "copy" ? "replace_real_copy" : "replace_real",
        detail: targetInfo.isDirectory()
          ? mode === "copy"
            ? "真实目录：将 stash 后复制 canonical 内容"
            : "真实目录：将 stash 后换成 symlink"
          : mode === "copy"
            ? "真实文件：将 stash 后复制 canonical 内容"
            : "真实文件：将 stash 后换成 symlink",
      };
    }
    return {
      ...base,
      action: "conflict",
      detail: "目标已是真实文件/目录，非 symlink，禁止静默覆盖",
    };
  }

  return {
    ...base,
    action: "conflict",
    detail: "目标类型不支持，禁止覆盖",
  };
}

function createItem(base: Omit<SyncPlanItem, "action" | "detail">, mode: SyncMode): SyncPlanItem {
  return {
    ...base,
    action: mode === "copy" ? "create_copy" : "create_symlink",
    detail: mode === "copy" ? "目标不存在，将复制目录" : "目标不存在",
  };
}

function unsafeItem(
  agentId: string,
  skillName: string,
  target: string,
  source: string,
  err: unknown,
): SyncPlanItem {
  return {
    agentId,
    skillName,
    target,
    source,
    action: "conflict",
    detail: `拒绝不安全的同步投影: ${errorMessage(err)}`,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
