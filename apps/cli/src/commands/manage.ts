import { lstat } from "node:fs/promises";
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
  json: boolean;
  configPath?: string;
  apply: boolean;
  yes: boolean;
  dryRun: boolean;
}): Promise<number> {
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
  if (options.action !== "list") {
    const exists = await lstat(layout.catalog).catch((err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") return null;
      throw err;
    });
    if (exists) catalog = await readCatalog(layout.catalog);
  }
  const result = await manageSkills({
    action: options.action,
    source: options.source,
    names: options.names,
    ref: options.ref,
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
          type: "ingest" as const,
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
          : "Hub 已更新；Agent 可通过 MCP 按需搜索并精确读取 Skill，无需默认 sync",
    });
  else {
    const descriptions = new Map(result.skills.map((skill) => [skill.name, skill.description]));
    printLines([
      `${options.action} ${dryRun ? "(dry-run / 只读)" : "完成"}`,
      ...result.items.map(
        (item) =>
          `  ${item.action} ${item.name}${descriptions.get(item.name) ? ` — ${descriptions.get(item.name)}` : ""} [${item.status}]${item.message ? ` ${item.message}` : ""}${item.backupPath ? ` backup=${item.backupPath}` : ""}`,
      ),
      `来源锁: ${result.lockPath}`,
      ...(!dryRun ? ["catalog/index 已更新；可通过 MCP 按需加载，无需默认 sync"] : []),
    ]);
  }
  return 0;
}
