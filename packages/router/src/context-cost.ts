import { estimateContext } from "@skill-hub/core";
import { lstat } from "node:fs/promises";
import { SkillHubError } from "@skill-hub/shared";
import { loadHubSkills } from "./hub-service.js";
import { inspectSkillText } from "./runtime.js";
import { withUsageScope } from "./usage.js";

/** Explicit inventory only: it must never count its own file reads as usage. */
export async function skillContextCost(
  options: {
    name?: string;
    catalogPath?: string;
    configPath?: string;
    maxChars?: number;
    contextWindow?: number;
  } = {},
) {
  const maxChars = options.maxChars ?? 8000;
  if (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 100000)
    throw new SkillHubError({ code: "E_CONFIG", message: "maxChars须为1到100000的整数" });
  if (
    options.contextWindow !== undefined &&
    (!Number.isSafeInteger(options.contextWindow) || options.contextWindow < 1)
  )
    throw new SkillHubError({ code: "E_CONFIG", message: "contextWindow须为正整数" });
  return withUsageScope(
    "library",
    async () => {
      const { skills, catalogPath } = await loadHubSkills(options);
      const issues: Array<{ code: string; message: string }> = [];
      try {
        await lstat(catalogPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        issues.push({
          code: "E_INDEX",
          message: "catalog缺失，扫描回退结果不能视为完整清单；请先建立catalog",
        });
      }
      const selected = options.name ? skills.filter((s) => s.name === options.name) : skills;
      if (options.name && !selected.length)
        throw new SkillHubError({ code: "E_NOT_FOUND", message: "Skill不存在" });
      const items = [];
      for (const meta of selected.slice().sort((a, b) => a.name.localeCompare(b.name))) {
        const metadata = estimateContext(`${meta.name}\n${meta.description}`);
        try {
          const { body, hash: expectedHash } = await inspectSkillText({
            name: meta.name,
            catalogPath: options.catalogPath,
            configPath: options.configPath,
          });
          const fullBody = estimateContext(body);
          const initialPage = estimateContext(body.slice(0, maxChars));
          items.push({
            name: meta.name,
            metadata,
            fullBody,
            initialPage,
            contentHash: expectedHash,
            initialPageContextPercent: options.contextWindow
              ? Number(((100 * initialPage.estimatedTokens) / options.contextWindow).toFixed(2))
              : null,
            errorCode: null,
          });
        } catch (error) {
          items.push({
            name: meta.name,
            metadata,
            fullBody: null,
            initialPage: null,
            contentHash: null,
            initialPageContextPercent: null,
            errorCode: error instanceof SkillHubError ? error.code : "E_PATH",
          });
        }
      }
      return {
        method: "utf8-heuristic-v1",
        estimated: true,
        model: null,
        actualModelTokens: null,
        actualCost: null,
        complete: issues.length === 0 && items.every((i) => i.errorCode === null),
        issues,
        maxChars,
        contextWindow: options.contextWindow ?? null,
        metadataTotalEstimatedTokens: items.reduce(
          (sum, item) => sum + item.metadata.estimatedTokens,
          0,
        ),
        scope:
          "Metadata=name+newline+description; body=SKILL.md including frontmatter; initialPage uses UTF-16 maxChars. Attachments excluded. Heuristic, not a tokenizer/billing measurement; excludes envelopes, tool definitions, history and cache effects. No automatic full-library injection is assumed.",
        items,
      };
    },
    false,
  );
}
