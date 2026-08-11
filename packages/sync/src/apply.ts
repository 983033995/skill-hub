import { lstat, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";
import { atomicSymlink, copyPathRecursive } from "./fs-utils.js";
import type { ApplyOptions, ApplyResult, SyncPlan, SyncPlanItem } from "./types.js";

/**
 * 执行 sync plan：create_symlink / update_symlink / replace_real。
 * conflict / noop / skipped 跳过；未开 replaceReal 时真实目录永不删除。
 * createOnly=true 时额外跳过 update_symlink / replace_real。
 */
export async function applySync(
  plan: SyncPlan,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const dryRun = options.dryRun === true;
  const createOnly = options.createOnly === true;
  const results: ApplyResult["items"] = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of plan.items) {
    if (item.action === "noop" || item.action === "conflict" || item.action === "skipped") {
      results.push({ ...item, result: "skipped" });
      skipped += 1;
      continue;
    }
    if (
      createOnly &&
      (item.action === "update_symlink" || item.action === "replace_real")
    ) {
      results.push({
        ...item,
        result: "skipped",
        detail: item.detail ?? `create-only: 跳过 ${item.action}`,
      });
      skipped += 1;
      continue;
    }
    if (
      item.action !== "create_symlink" &&
      item.action !== "update_symlink" &&
      item.action !== "replace_real"
    ) {
      results.push({ ...item, result: "skipped" });
      skipped += 1;
      continue;
    }

    if (item.action === "replace_real" && !dryRun && !options.replaceStashDir) {
      results.push({
        ...item,
        result: "failed",
        error: "replace_real 需要 replaceStashDir（CLI 由 --backup-dir/replaced-real 提供）",
      });
      failed += 1;
      continue;
    }

    if (dryRun) {
      results.push({ ...item, result: "applied", detail: item.detail ?? "dry-run apply" });
      applied += 1;
      continue;
    }

    try {
      await applyOne(item, options.replaceStashDir);
      results.push({ ...item, result: "applied" });
      applied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ ...item, result: "failed", error: message });
      failed += 1;
    }
  }

  return { dryRun, applied, skipped, failed, items: results };
}

async function applyOne(item: SyncPlanItem, replaceStashDir?: string): Promise<void> {
  if (item.action === "replace_real") {
    if (!replaceStashDir) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: "replace_real 缺少 stash 目录",
        details: { target: item.target },
      });
    }
    const st = await lstat(item.target);
    if (st.isSymbolicLink()) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `replace_real 目标是 symlink，请用 update_symlink: ${item.target}`,
        details: { target: item.target },
      });
    }
    if (!st.isDirectory() && !st.isFile()) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `replace_real 目标类型不支持: ${item.target}`,
        details: { target: item.target },
      });
    }

    const stashPath = path.join(replaceStashDir, item.agentId, item.skillName);
    await stashRealPath(item.target, stashPath);
    await atomicSymlink(item.source, item.target);
    return;
  }

  // create / update
  try {
    const st = await lstat(item.target);
    if (!st.isSymbolicLink() && (st.isDirectory() || st.isFile())) {
      if (item.action === "update_symlink") {
        throw new SkillHubError({
          code: "E_SYNC",
          message: `目标不是 symlink，拒绝更新: ${item.target}`,
          details: { target: item.target },
        });
      }
      if (st.isDirectory()) {
        throw new SkillHubError({
          code: "E_SYNC",
          message: `目标是真实目录，禁止静默覆盖: ${item.target}`,
          details: { target: item.target },
        });
      }
      if (st.isFile()) {
        await rm(item.target, { force: true });
      }
    } else if (st.isSymbolicLink()) {
      await rm(item.target, { force: true });
    }
  } catch (err) {
    if (err instanceof SkillHubError) throw err;
    // ENOENT: ok for create
  }

  await atomicSymlink(item.source, item.target);
}

/** 先 rename，失败则 copy+rm，确保原路径消失后再建链。 */
async function stashRealPath(target: string, stashPath: string): Promise<void> {
  await mkdir(path.dirname(stashPath), { recursive: true });
  await rm(stashPath, { recursive: true, force: true }).catch(() => undefined);
  try {
    await rename(target, stashPath);
    return;
  } catch {
    // cross-device 等：内容备份后删除源
  }
  await copyPathRecursive(target, stashPath);
  await rm(target, { recursive: true, force: true });
}
