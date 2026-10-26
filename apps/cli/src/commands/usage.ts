import path from "node:path";
import { readUsageReport, type UsageOrigin } from "@skill-hub/core";
import { skillContextCost } from "@skill-hub/router";
import { SkillHubError, getDefaultHubHome } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

function integer(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    throw new SkillHubError({ code: "E_CONFIG", message: "数值参数须为非负安全整数" });
  return Number(value);
}
export async function runUsage(options: {
  json: boolean;
  name?: string;
  file?: string;
  days?: string;
  origin?: string;
}) {
  const file =
    options.file ??
    process.env.SKILL_HUB_USAGE_LOG ??
    path.join(getDefaultHubHome(), "usage.jsonl");
  const report = {
    ...(await readUsageReport({
      file,
      days: integer(options.days),
      name: options.name,
      origin: options.origin as UsageOrigin | undefined,
    })),
    recordingEnabled: Boolean(process.env.SKILL_HUB_USAGE_LOG),
  };
  if (options.json) printJson(report);
  else
    printLines([
      `Hub使用观测 complete=${report.complete} exists=${report.exists} recordingEnabled=${report.recordingEnabled}`,
      `日志: ${report.file}；最早可见记录: ${report.recordedSince ?? "未知"}`,
      `search=${report.searchCalls} read=${report.readCalls} errors=${report.errors}`,
      ...report.skills.map(
        (s) =>
          `${s.name} [${s.origin}] 候选出现=${s.appearances} 正文首段=${s.initialBodyReads} 续读=${s.continuationBodyReads} 附件=${s.attachmentReads} 错误=${s.errors} 返回文本粗估tokens=${s.estimatedReturnedTokens} 最近读取=${s.lastReadAt ?? "未知"}`,
      ),
      ...report.issues.map((i) => `日志第${i.line}行 ${i.code}`),
      "仅代表Hub服务调用；未记录历史未知，首段次数不等于唯一任务数。Token为启发式估算，模型真实Token和费用未知。",
    ]);
  return report.complete ? 0 : 3;
}
export async function runContextCost(options: {
  json: boolean;
  name?: string;
  catalogPath?: string;
  configPath?: string;
  maxChars?: string;
  contextWindow?: string;
}) {
  const report = await skillContextCost({
    ...options,
    maxChars: integer(options.maxChars),
    contextWindow: integer(options.contextWindow),
  });
  if (options.json) printJson(report);
  else
    printLines([
      `静态上下文粗估 (${report.method}) complete=${report.complete}`,
      `元数据合计≈${report.metadataTotalEstimatedTokens} tokens；首段maxChars=${report.maxChars}；contextWindow=${report.contextWindow ?? "未指定"}`,
      ...report.items.map(
        (s) =>
          `${s.name} 元数据≈${s.metadata.estimatedTokens} 正文全文≈${s.fullBody?.estimatedTokens ?? "未知"} 首段≈${s.initialPage?.estimatedTokens ?? "未知"} tokens${s.initialPageContextPercent === null ? "" : ` 首段占窗口≈${s.initialPageContextPercent}%`}${s.errorCode ? ` ${s.errorCode}` : ""}`,
      ),
      "粗略比较值，不是tokenizer/模型账单。附件、工具定义、封装、历史与缓存不计；不代表全库会被注入。",
    ]);
  return report.complete ? 0 : 3;
}
