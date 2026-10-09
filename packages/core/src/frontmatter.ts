/**
 * 极简 YAML frontmatter 解析（仅支持 name/description/keywords 所需键值）。
 * 不引入外部 yaml 依赖，降低 MVP 复杂度。
 */

import { SkillHubError } from "@skill-hub/shared";

export interface FrontmatterResult {
  data: Record<string, unknown>;
  body: string;
}

/**
 * 解析 `---\n...\n---\nbody`；无 frontmatter 时返回空 data。
 */
export function splitFrontmatter(raw: string): FrontmatterResult {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) {
    return { data: {}, body: text };
  }

  const rest = text.slice(3);
  // 允许首行 --- 后立刻换行
  const nl = rest.match(/^\r?\n/);
  const afterOpen = nl ? rest.slice(nl[0].length) : rest;

  const closeMatch = afterOpen.match(/\r?\n---\s*(?:\r?\n|$)/);
  if (!closeMatch || closeMatch.index === undefined) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "SKILL.md frontmatter 未正确闭合",
    });
  }

  const yamlBlock = afterOpen.slice(0, closeMatch.index);
  const body = afterOpen.slice(closeMatch.index + closeMatch[0].length);
  return { data: parseSimpleYaml(yamlBlock), body };
}

function parseSimpleYaml(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lines = block.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      i += 1;
      continue;
    }
    // 只读取顶层元数据，避免 metadata.name 覆盖 Skill 名称。
    if (/^\s/.test(line)) {
      i += 1;
      continue;
    }

    const multiline = line.match(/^([A-Za-z0-9_-]+):\s*([>|][-+]?)?\s*$/);
    if (multiline && (multiline[1] === "description" || multiline[2])) {
      const parts: string[] = [];
      i += 1;
      while (i < lines.length && (!lines[i]!.trim() || /^\s/.test(lines[i]!))) {
        parts.push(lines[i]!.trim());
        i += 1;
      }
      data[multiline[1]!] = parts.join(multiline[2]?.startsWith("|") ? "\n" : " ").trim();
      continue;
    }

    // keywords:
    //   - a
    //   - b
    const keyOnly = trimmed.match(/^([A-Za-z0-9_-]+):\s*$/);
    if (keyOnly) {
      const key = keyOnly[1]!;
      const items: string[] = [];
      i += 1;
      while (i < lines.length) {
        const next = lines[i] ?? "";
        const item = next.match(/^\s+-\s+(.+)$/);
        if (!item) break;
        items.push(unquote(item[1]!.trim()));
        i += 1;
      }
      data[key] = items;
      continue;
    }

    const kv = trimmed.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1]!;
    const value = kv[2]!.trim();
    // 行内数组: [a, b]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner ? inner.split(",").map((s) => unquote(s.trim())) : [];
    } else if (value === "" || value === "null" || value === "~") {
      data[key] = null;
    } else if (value === "true" || value === "false") {
      data[key] = value === "true";
    } else {
      data[key] = unquote(value);
    }
    i += 1;
  }

  return data;
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map((v) => asString(v)).filter((v): v is string => Boolean(v));
  return out.length > 0 ? out : undefined;
}
