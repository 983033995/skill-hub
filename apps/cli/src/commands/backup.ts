import { loadHubConfig, resolveHubConfigPaths } from "@skill-hub/core";
import { createBackup } from "@skill-hub/sync";
import { getDefaultHubHome, hubLayout } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runBackup(options: {
  json: boolean;
  configPath?: string;
  out?: string;
  notes?: string;
  dryRun: boolean;
  includeCanonical: boolean;
}): Promise<number> {
  const config = resolveHubConfigPaths(
    options.configPath ? await loadHubConfig(options.configPath) : await loadHubConfig(),
  );

  if (options.out) {
    config.backup_dir = options.out;
  }

  const layout = hubLayout(getDefaultHubHome());
  const manifest = await createBackup(config, {
    notes: options.notes ?? "skill-hub backup",
    includeCanonical: options.includeCanonical,
    dryRun: options.dryRun,
    hubMeta: { catalogPath: layout.catalog, configPath: layout.config },
  });

  if (options.json) {
    printJson(manifest);
  } else {
    printLines(
      [
        `backup ${options.dryRun ? "(dry-run)" : "written"}`,
        `  dir: ${manifest.backupDir}`,
        ...manifest.agents.map(
          (a) =>
            `  agent ${a.id.padEnd(12)} ${a.skipped ? "SKIP" : "OK"}  entries=${a.entryCount}  ${a.path}`,
        ),
        manifest.canonical
          ? `  canonical ${manifest.canonical.exists ? "OK" : "MISS"}  ${manifest.canonical.path}`
          : "",
        options.dryRun
          ? "  note: dry-run 未复制文件"
          : `  manifest: ${manifest.backupDir}/manifest.json`,
      ].filter(Boolean),
    );
  }

  return 0;
}
