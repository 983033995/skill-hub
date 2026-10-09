import { lstat } from "node:fs/promises";
import {
  catalogToSkillMetas,
  loadHubConfig,
  readCatalog,
  resolveHubConfigPaths,
  scanSkills,
  type SkillMeta,
} from "@skill-hub/core";
import { verifySync } from "@skill-hub/sync";
import {
  SkillHubError,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runVerify(options: {
  json: boolean;
  configPath?: string;
  catalogPath?: string;
}): Promise<number> {
  const config = resolveHubConfigPaths(
    options.configPath ? await loadHubConfig(options.configPath) : await loadHubConfig(),
  );
  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;

  let skills: SkillMeta[] = [];
  try {
    skills = catalogToSkillMetas(await readCatalog(catalogPath));
  } catch (err) {
    const exists = await lstat(catalogPath).catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return null;
      throw e;
    });
    if (exists) throw err;
    const issues: Array<{ path: string; message: string }> = [];
    skills = await scanSkills(config.canonical_dir, { onIssue: (issue) => issues.push(issue) });
    if (issues.length)
      throw new SkillHubError({
        code: "E_SYNC",
        message: `canonical 扫描不完整: ${JSON.stringify(issues)}`,
      });
  }

  const report = await verifySync(config, skills);
  if (options.json) printJson(report);
  else {
    const s = report.summary;
    printLines(
      [
        `verify ${report.ok ? "OK" : "ISSUES"}  mode=${config.sync.mode}  skills×agents=${report.items.length}`,
        `  ok=${s.ok} missing=${s.missing} not_symlink=${s.not_symlink} not_copy=${s.not_copy} broken=${s.broken_symlink} wrong=${s.wrong_target} mismatch=${s.content_mismatch}`,
        ...report.items
          .filter((i) => i.kind !== "ok")
          .slice(0, 40)
          .map(
            (i) =>
              `  [${i.kind}] ${i.agentId}:${i.skillName} ${i.detail ?? ""}${i.suggestion ? ` → ${i.suggestion}` : ""}`,
          ),
        report.items.filter((i) => i.kind !== "ok").length > 40 ? `  ... more issues` : "",
      ].filter(Boolean),
    );
  }
  return report.ok ? 0 : 1;
}
