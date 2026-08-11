import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  SkillHubError,
  normalizeSkillName,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { asString, asStringArray, splitFrontmatter } from "./frontmatter.js";
import { sha256Content } from "./hash.js";
import type { SkillMeta } from "./types.js";

export interface ParseSkillOptions {
  source?: string;
  agentId?: string;
  /** 缺省 name 时可用目录名回退 */
  fallbackName?: string;
}

/**
 * 解析单个 SKILL.md 文件为 SkillMeta。
 */
export async function parseSkillMd(
  filePath: string,
  options: ParseSkillOptions = {},
): Promise<SkillMeta> {
  const absFile = resolveAbsolutePath(filePath);
  let content: string;
  let st;
  try {
    content = await readFile(absFile, "utf8");
    st = await stat(absFile);
  } catch (err) {
    throw new SkillHubError({
      code: "E_PATH",
      message: `无法读取 SKILL.md: ${absFile}`,
      details: { path: absFile },
      cause: err,
    });
  }

  const base = path.basename(absFile);
  if (base !== "SKILL.md" && base !== "skill.md") {
    // 仍允许解析，但 path 按目录
  }

  const skillDir = path.dirname(absFile);
  const { data } = splitFrontmatter(content);

  const rawName =
    asString(data.name) ??
    options.fallbackName ??
    path.basename(skillDir);

  let name: string;
  try {
    name = normalizeSkillName(rawName);
  } catch (err) {
    if (err instanceof SkillHubError) {
      throw new SkillHubError({
        code: "E_PARSE",
        message: `SKILL.md name 无效: ${rawName}`,
        details: { path: absFile },
        cause: err,
      });
    }
    throw err;
  }

  const description = (asString(data.description) ?? "").trim();
  if (!description) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "SKILL.md 缺少 description",
      details: { path: absFile, name },
    });
  }

  const keywords = asStringArray(data.keywords);
  const hash = sha256Content(content);

  const meta: SkillMeta = {
    name,
    description,
    path: skillDir,
    hash,
    mtimeMs: st.mtimeMs,
  };
  if (keywords) meta.keywords = keywords;
  if (options.source) meta.source = options.source;
  if (options.agentId) meta.agentsPresent = [options.agentId];

  return meta;
}
