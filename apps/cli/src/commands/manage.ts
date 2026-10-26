import { lstat, stat } from "node:fs/promises";
import {
  appendHistoryBatch,
  createEmptyCatalog,
  loadHubConfig,
  manageSkills,
  readCatalog,
  resolveHubConfigPaths,
  upsertSkills,
  writeCatalog,
  type ManagedAction,
} from "@skill-hub/core";
import { SkillHubError, getDefaultHubHome, hubLayout } from "@skill-hub/shared";
import { runIndex } from "./index-cmd.js";
import { printJson, printLines } from "../output.js";

export async function runManage(options: {
  action: ManagedAction;
  source?: string;
  names?: string[];
  ref?: string;
  overlayOf?: string;
  backupPath?: string;
  planToken?: string;
  json: boolean;
  configPath?: string;
  apply: boolean;
  yes: boolean;
  dryRun: boolean;
}): Promise<number> {
  if (options.action === "check-updates" && (options.apply || options.yes)) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "check-updates 是只读检查，不接受 --apply 或 --yes",
    });
  }
  const dryRun = options.dryRun || !options.apply || options.action === "list";
  if (!dryRun && !options.yes)
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "写入 Hub 需要 --apply --yes；先运行默认预览",
    });
  const layout = hubLayout(getDefaultHubHome());
  const config = resolveHubConfigPaths(await loadHubConfig(options.configPath));
  // 在任何文件写入前检查 catalog；损坏文件不能被当作空库覆盖。
  let catalog = createEmptyCatalog();
  if (options.action !== "list" && options.action !== "check-updates") {
    const exists = await lstat(layout.catalog).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (exists) catalog = await readCatalog(layout.catalog);
  }
  let overlayOf: string | undefined;
  if (options.overlayOf !== undefined) {
    overlayOf = options.overlayOf.trim();
    if (!overlayOf) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: "--overlay-of 需要 base Skill 名称",
      });
    }
    if (options.action !== "install" && options.action !== "adopt") {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: "--overlay-of 仅适用于 install/adopt",
      });
    }
    const base = catalog.skills[overlayOf];
    if (!base) {
      throw new SkillHubError({
        code: "E_NOT_FOUND",
        message: `overlay base 不在当前 catalog 中: ${overlayOf}`,
        details: { overlayOf },
      });
    }
    try {
      if (!(await stat(base.path)).isDirectory()) {
        throw new SkillHubError({
          code: "E_PATH",
          message: `overlay base 路径不是目录: ${overlayOf}`,
          details: { name: overlayOf, path: base.path },
        });
      }
    } catch (err) {
      if (err instanceof SkillHubError) throw err;
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new SkillHubError({
          code: "E_NOT_FOUND",
          message: `overlay base 路径不存在: ${overlayOf}`,
          details: { name: overlayOf, path: base.path },
          cause: err,
        });
      }
      throw err;
    }
  }
  const result = await manageSkills({
    action: options.action,
    source: options.source,
    names: options.names,
    ref: options.ref,
    overlayOf,
    backupPath: options.backupPath,
    planToken: options.planToken,
    canonicalDir: config.canonical_dir,
    stateDir: layout.home,
    dryRun,
  });
  if (!dryRun && result.skills.length) {
    const next = upsertSkills(catalog, result.skills).catalog;
    await writeCatalog(layout.catalog, next);
    await appendHistoryBatch(
      layout.history,
      result.items
        .filter((i) => i.status === "applied")
        .map((item) => ({
          at: new Date().toISOString(),
          type: next.skills[item.name]?.provenance?.overlayOf
            ? ("overlay" as const)
            : ("ingest" as const),
          name: item.name,
          action: item.action,
          source: item.source,
          path: next.skills[item.name]?.path,
          hash: next.skills[item.name]?.hash,
          detail: { managed: true, backupPath: item.backupPath },
        })),
    );
    await runIndex({ json: true, rebuild: false, configPath: options.configPath, quiet: true });
  }
  if (options.json)
    printJson({
      ...result,
      indexUpdated: !dryRun && result.skills.length > 0,
      next:
        options.action === "list"
          ? null
          : options.action === "check-updates"
            ? "仅检查 managed 来源锁；Hub 和 Agent 未写入。未知状态不代表已是最新。"
            : dryRun
              ? options.action === "update" || options.action === "migrate-source"
                ? "仅生成预览；核对差异及来源后，用 --plan-token <planToken> --apply --yes 确认同一计划。"
                : "仅生成预览；Hub 和 Agent 未写入。核对后才可使用 --apply --yes。"
              : "Hub 处理完成；Agent 可通过 MCP 按需搜索并精确读取 Skill，无需默认 sync",
    });
  else {
    const descriptions = new Map(result.skills.map((skill) => [skill.name, skill.description]));
    printLines([
      `${options.action} ${dryRun ? "(dry-run / 只读)" : "完成"}`,
      ...result.items.map(
        (item) =>
          `  ${item.action} ${item.name}${descriptions.get(item.name) ? ` — ${descriptions.get(item.name)}` : ""} [${item.status}]${item.localStatus ? ` local=${item.localStatus} upstream=${item.upstreamStatus} update=${item.updateAvailable ?? "unknown"}` : ""}${item.message ? ` ${item.message}` : ""}${item.backupPath ? ` backup=${item.backupPath}` : ""}`,
      ),
      ...result.items.flatMap((item) =>
        (item.changes ?? []).map(
          (change) =>
            `    ${change.change} ${change.path} (${change.before?.kind ?? "absent"} → ${change.after?.kind ?? "absent"})`,
        ),
      ),
      ...result.items.flatMap((item) =>
        item.previousSource && item.nextSource
          ? [
              `    来源迁移: ${JSON.stringify(item.previousSource)} → ${JSON.stringify(item.nextSource)}`,
            ]
          : [],
      ),
      ...(result.planToken
        ? [
            `更新确认指纹: ${result.planToken}`,
            ...(dryRun
              ? ["确认写入需 --plan-token <指纹> --apply --yes；token 不代替用户授权"]
              : []),
          ]
        : []),
      ...(result.issues ?? []).map(
        (issue) =>
          `  issue [${issue.phase}/${issue.code}]${issue.name ? ` ${issue.name}` : ""}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}${issue.hint ? `；${issue.hint}` : ""}`,
      ),
      ...(result.complete !== undefined ? [`检查完整: ${result.complete}`] : []),
      `来源锁: ${result.lockPath}`,
      ...(!dryRun ? ["catalog/index 已更新；可通过 MCP 按需加载，无需默认 sync"] : []),
    ]);
  }
  return result.complete === false ? 3 : 0;
}
