import { lstat, rename, rm } from "node:fs/promises";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";
import {
  assertPathAbsent,
  atomicSymlink,
  copyPathToEmpty,
  movePathToEmpty,
  uniqueSiblingPath,
} from "./fs-utils.js";
import { assertSafeSkillName, inspectProjectionIntegrity } from "./integrity.js";
import type { ApplyOptions, ApplyResult, SyncPlan, SyncPlanItem } from "./types.js";

/**
 * 执行 sync plan：symlink 或 copy 模式的 create / update / replace。
 * conflict / noop / skipped 跳过；create 动作只接受仍不存在的目标。
 */
export async function applySync(plan: SyncPlan, options: ApplyOptions = {}): Promise<ApplyResult> {
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
      (item.action === "update_symlink" ||
        item.action === "replace_real" ||
        item.action === "update_copy" ||
        item.action === "replace_real_copy")
    ) {
      results.push({
        ...item,
        result: "skipped",
        detail: item.detail ?? `create-only: 跳过 ${item.action}`,
      });
      skipped += 1;
      continue;
    }
    if (!isWritableAction(item.action)) {
      results.push({ ...item, result: "skipped" });
      skipped += 1;
      continue;
    }

    if (isReplaceAction(item.action) && !dryRun && !options.replaceStashDir) {
      results.push({
        ...item,
        result: "failed",
        error:
          "replace_real/replace_real_copy 需要 replaceStashDir（CLI 由 --backup-dir/replaced-real 提供）",
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
      await applyOne(item, options.replaceStashDir, plan.canonicalDir);
      results.push({ ...item, result: "applied" });
      applied += 1;
    } catch (err) {
      results.push({
        ...item,
        result: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      failed += 1;
    }
  }

  return { dryRun, applied, skipped, failed, items: results };
}

async function applyOne(
  item: SyncPlanItem,
  replaceStashDir: string | undefined,
  canonicalDir: string | undefined,
): Promise<void> {
  const copyMode =
    item.action === "create_copy" ||
    item.action === "update_copy" ||
    item.action === "replace_real_copy";
  const integrity = await inspectProjectionIntegrity({
    canonicalDir,
    source: item.source,
    target: item.target,
    skillName: item.skillName,
    expectedSkillHash: item.expectedSkillHash,
    requireTreeHash: copyMode,
  });
  const safeItem = { ...item, source: integrity.source, target: integrity.target };

  if (isReplaceAction(safeItem.action)) {
    if (!replaceStashDir) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: "replace_real/replace_real_copy 缺少 stash 目录",
        details: { target: safeItem.target },
      });
    }
    await replaceRealProjection(safeItem, replaceStashDir);
    return;
  }

  if (safeItem.action === "create_copy" || safeItem.action === "create_symlink") {
    // 两个 helper 都会二次 lstat，并且只把 ENOENT 视作可创建。
    await createProjection(safeItem);
    return;
  }

  if (safeItem.action === "update_copy" || safeItem.action === "update_symlink") {
    await replaceSymlinkProjection(safeItem);
    return;
  }

  throw new SkillHubError({
    code: "E_SYNC",
    message: `未知同步 action: ${safeItem.action}`,
    details: { action: safeItem.action, target: safeItem.target },
  });
}

async function replaceRealProjection(item: SyncPlanItem, replaceStashDir: string): Promise<void> {
  const targetInfo = await lstat(item.target);
  if (targetInfo.isSymbolicLink()) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `replace_real 目标是 symlink，请使用 update action: ${item.target}`,
      details: { target: item.target },
    });
  }
  if (!targetInfo.isDirectory() && !targetInfo.isFile()) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `replace_real 目标类型不支持: ${item.target}`,
      details: { target: item.target },
    });
  }

  assertSafeStashSegment(item.agentId, "agent id");
  assertSafeSkillName(item.skillName);
  const stashPath = path.join(replaceStashDir, item.agentId, item.skillName);
  // 不覆盖任何既存 stash（包括坏链）；保留可追溯历史备份。
  await assertPathAbsent(stashPath);
  await movePathToEmpty(item.target, stashPath);

  try {
    await createProjection(item);
  } catch (projectionError) {
    try {
      // 投影未创建时原目标必须回到原路径；若此时有第三方新建 target，宁可失败也不覆盖。
      await movePathToEmpty(stashPath, item.target);
    } catch (restoreError) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `创建投影失败，且无法恢复原目标: ${item.target}`,
        details: { target: item.target, stashPath },
        cause: new AggregateError([projectionError, restoreError]),
      });
    }
    throw projectionError;
  }
}

/** update 只替换计划中已观察到的 symlink；失败时恢复旧链。 */
async function replaceSymlinkProjection(item: SyncPlanItem): Promise<void> {
  const targetInfo = await lstat(item.target);
  if (!targetInfo.isSymbolicLink()) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `目标不再是 symlink，拒绝 update: ${item.target}`,
      details: { target: item.target },
    });
  }

  const rollbackPath = uniqueSiblingPath(item.target, "rollback");
  await assertPathAbsent(rollbackPath);
  await rename(item.target, rollbackPath);
  try {
    await createProjection(item);
  } catch (projectionError) {
    try {
      await assertPathAbsent(item.target);
      await rename(rollbackPath, item.target);
    } catch (restoreError) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `更新投影失败，且无法恢复旧 symlink: ${item.target}`,
        details: { target: item.target, rollbackPath },
        cause: new AggregateError([projectionError, restoreError]),
      });
    }
    throw projectionError;
  }

  try {
    await rm(rollbackPath, { force: false });
  } catch (err) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `投影已更新，但无法清理旧 symlink: ${rollbackPath}`,
      details: { target: item.target, rollbackPath },
      cause: err,
    });
  }
}

async function createProjection(item: SyncPlanItem): Promise<void> {
  if (
    item.action === "create_copy" ||
    item.action === "update_copy" ||
    item.action === "replace_real_copy"
  ) {
    await copyPathToEmpty(item.source, item.target);
    return;
  }
  await atomicSymlink(item.source, item.target);
}

function isWritableAction(action: SyncPlanItem["action"]): boolean {
  return (
    action === "create_symlink" ||
    action === "update_symlink" ||
    action === "replace_real" ||
    action === "create_copy" ||
    action === "update_copy" ||
    action === "replace_real_copy"
  );
}

function isReplaceAction(action: SyncPlanItem["action"]): boolean {
  return action === "replace_real" || action === "replace_real_copy";
}

function assertSafeStashSegment(value: string, label: string): void {
  if (
    !value ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `非法 ${label}，拒绝构造 stash 路径: ${JSON.stringify(value)}`,
      details: { value, label },
    });
  }
}
