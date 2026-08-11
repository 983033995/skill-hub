import {
  catalogToSkillMetas,
  defaultHubConfig,
  loadHubConfig,
  readCatalog,
  resolveHubConfigPaths,
  scanSkills,
  type SkillMeta,
} from "@skill-hub/core";
import { verifySync } from "@skill-hub/sync";
import {
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
    options.configPath
      ? await loadHubConfig(options.configPath)
      : await loadHubConfig().catch(() => defaultHubConfig()),
  );
  const layout = hubLayout(getDefaultHubHome());
  const catalogPath = options.catalogPath
    ? resolveAbsolutePath(options.catalogPath)
    : layout.catalog;

  let skills: SkillMeta[] = [];
  try {
    skills = catalogToSkillMetas(await readCatalog(catalogPath));
  } catch {
    try {
      skills = await scanSkills(layout.skills);
    } catch {
      skills = [];
    }
  }

  const report = await verifySync(config, skills);
  if (options.json) printJson(report);
  else {
    const s = report.summary;
    printLines([
      `verify ${report.ok ? "OK" : "ISSUES"}  skills×agents=${report.items.length}`,
      `  ok=${s.ok} missing=${s.missing} not_symlink=${s.not_symlink} broken=${s.broken_symlink} wrong=${s.wrong_target}`,
      ...report.items
        .filter((i) => i.kind !== "ok")
        .slice(0, 40)
        .map(
          (i) =>
            `  [${i.kind}] ${i.agentId}:${i.skillName} ${i.detail ?? ""}${i.suggestion ? ` → ${i.suggestion}` : ""}`,
        ),
      report.items.filter((i) => i.kind !== "ok").length > 40
        ? `  ... more issues`
        : "",
    ].filter(Boolean));
  }
  return report.ok ? 0 : 1;
}
