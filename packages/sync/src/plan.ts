import { lstat, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "@skill-hub/core";
import {
  type HubConfig,
  expandUserPath,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import type { PlanSyncOptions, SyncPlan, SyncPlanItem } from "./types.js";

/**
 * 仅生成分发计划，**永不**创建 symlink（apply 留给 Phase 2）。
 *
 * 对每个 enabled agent × each skill：
 * - 目标不存在 → create_symlink
 * - 目标是正确指向 canonical 的 symlink → noop
 * - 目标是指向其它路径的 symlink → update_symlink
 * - 目标是真实目录/文件（非 symlink）→ conflict；若 replaceReal → replace_real
 */
export async function planSync(
  config: HubConfig,
  skills: SkillMeta[],
  options: PlanSyncOptions = {},
): Promise<SyncPlan> {
  const canonicalDir = expandUserPath(config.canonical_dir);
  const dryRun = options.dryRun !== false;
  const items: SyncPlanItem[] = [];
  const agentFilter =
    options.agents && options.agents.length > 0
      ? new Set(options.agents.map((a) => a.trim()).filter(Boolean))
      : null;
  const replaceReal = options.replaceReal === true && options.createOnly !== true;

  const agents = config.agents.filter((a) => {
    if (!a.enabled) return false;
    if (agentFilter && !agentFilter.has(a.id)) return false;
    return true;
  });

  for (const agent of agents) {
    const agentDir = expandUserPath(agent.skills_dir);
    for (const skill of skills) {
      const source = resolveAbsolutePath(skill.path);
      const target = path.join(agentDir, skill.name);
      let item = await classifyItem(
        agent.id,
        skill.name,
        source,
        target,
        canonicalDir,
        replaceReal,
      );
      if (options.createOnly && item.action !== "create_symlink") {
        item = {
          ...item,
          action: "skipped",
          detail: `create-only: 原 action=${item.action}${item.detail ? ` (${item.detail})` : ""}`,
        };
      }
      items.push(item);
    }
  }

  const summary = summarizeItems(items);

  return {
    dryRun,
    generatedAt: new Date().toISOString(),
    items,
    summary,
  };
}

export function summarizeItems(items: SyncPlanItem[]): SyncPlan["summary"] {
  return {
    create: items.filter((i) => i.action === "create_symlink").length,
    update: items.filter((i) => i.action === "update_symlink").length,
    replace: items.filter((i) => i.action === "replace_real").length,
    conflict: items.filter((i) => i.action === "conflict").length,
    noop: items.filter((i) => i.action === "noop").length,
  };
}

async function classifyItem(
  agentId: string,
  skillName: string,
  source: string,
  target: string,
  _canonicalDir: string,
  replaceReal: boolean,
): Promise<SyncPlanItem> {
  const base: Omit<SyncPlanItem, "action" | "detail"> = {
    agentId,
    skillName,
    target,
    source,
  };

  let st;
  try {
    st = await lstat(target);
  } catch {
    return { ...base, action: "create_symlink", detail: "目标不存在" };
  }

  if (st.isSymbolicLink()) {
    let current: string;
    try {
      current = await realpath(target);
    } catch {
      return {
        ...base,
        action: "update_symlink",
        detail: "死链，需重建",
      };
    }
    const desired = await safeRealpath(source);
    if (path.resolve(current) === path.resolve(desired)) {
      return { ...base, action: "noop", detail: "已指向 canonical" };
    }
    return {
      ...base,
      action: "update_symlink",
      detail: `当前指向 ${current}`,
    };
  }

  // 真实目录/文件：默认 conflict；replaceReal 时改为 replace_real
  try {
    await stat(target);
    if (replaceReal) {
      return {
        ...base,
        action: "replace_real",
        detail: st.isDirectory()
          ? "真实目录：将 stash 后换成 symlink"
          : "真实文件：将 stash 后换成 symlink",
      };
    }
    return {
      ...base,
      action: "conflict",
      detail: "目标已是真实文件/目录，非 symlink，禁止静默覆盖",
    };
  } catch {
    return { ...base, action: "create_symlink", detail: "目标异常" };
  }
}

async function safeRealpath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return path.resolve(p);
  }
}
