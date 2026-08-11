import { restoreFromBackup } from "@skill-hub/sync";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

/**
 * 恢复 backup。破坏性操作，要求 --yes。
 * 默认 dry-run；真正写入还需 --apply（与 sync 对称，避免误触）。
 */
export async function runRestore(options: {
  json: boolean;
  from: string;
  yes: boolean;
  apply: boolean;
  dryRun: boolean;
  agents?: string[];
}): Promise<number> {
  if (!options.from) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "restore 需要 --from <backupDir|manifest.json>",
    });
  }

  const wantWrite = options.apply && !options.dryRun;
  if (wantWrite && !options.yes) {
    throw new SkillHubError({
      code: "E_BACKUP",
      message:
        "restore 会覆盖 skills 目录，请同时传入 --yes --apply（建议先 --dry-run）",
    });
  }

  const result = await restoreFromBackup(options.from, {
    dryRun: !wantWrite,
    agents: options.agents,
  });

  if (options.json) printJson(result);
  else {
    printLines([
      `restore ${result.dryRun ? "(dry-run)" : "APPLIED"}`,
      `  from: ${result.manifest.backupDir}`,
      `  restored: ${result.restored.join(", ") || "(none)"}`,
      ...result.skipped.map((s) => `  skip ${s.id}: ${s.reason}`),
    ]);
  }
  return 0;
}
