import { skillAudit } from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

const SEVERITIES = ["info", "warning", "high", "critical"] as const;
type FailOn = (typeof SEVERITIES)[number];

export async function runAudit(options: {
  json: boolean;
  name?: string;
  catalogPath?: string;
  configPath?: string;
  failOn?: string;
}): Promise<number> {
  const failOn = parseFailOn(options.failOn);
  const report = await skillAudit({
    name: options.name,
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  const failedByPolicy = report.skills.some((skill) =>
    !skill.complete || skill.findings.some(
      (finding) => SEVERITIES.indexOf(finding.severity) >= SEVERITIES.indexOf(failOn),
    ),
  );
  const payload = { ...report, fail_on: failOn, failed_by_policy: failedByPolicy };
  if (options.json) {
    printJson(payload);
  } else {
    printLines([
      `audit ${options.name ?? "(all skills)"}  passed=${report.summary.passed} failed=${report.summary.failed}`,
      `  findings critical=${report.summary.critical} high=${report.summary.high} warning=${report.summary.warning} info=${report.summary.info}`,
      ...report.skills.flatMap((skill) => [
        `  ${skill.passed ? "PASS" : "FAIL"} ${skill.name} files=${skill.summary.filesScanned}`,
        ...skill.findings.map(
          (finding) =>
            `    [${finding.severity}] ${finding.file}:${finding.line} ${finding.ruleId} — ${finding.message}`,
        ),
      ]),
    ]);
  }
  return failedByPolicy ? 2 : 0;
}

function parseFailOn(raw: string | undefined): FailOn {
  const value = raw?.trim() || "high";
  if (!SEVERITIES.includes(value as FailOn)) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `--fail-on 无效: ${value}（应为 info|warning|high|critical）`,
    });
  }
  return value as FailOn;
}
