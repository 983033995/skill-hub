/**
 * 路径展开与规范化。
 * 原则：写 symlink / 配置落地前一律转为绝对路径。
 */

import { homedir } from "node:os";
import path from "node:path";
import {
  CATALOG_FILENAME,
  CONFIG_FILENAME,
  DEFAULT_HUB_DIRNAME,
  ENV_HUB_CONFIG,
  ENV_HUB_HOME,
} from "./constants.js";
import { SkillHubError } from "./errors.js";

/**
 * 展开 `~` / `~/...` 为绝对 home 路径，再 `path.resolve`。
 * - 空串 → E_PATH
 * - 不自动检查存在性（存在性由调用方 fs 层判断）
 */
export function expandUserPath(input: string, home: string = homedir()): string {
  const raw = input.trim();
  if (!raw) {
    throw new SkillHubError({
      code: "E_PATH",
      message: "路径不能为空",
    });
  }

  let expanded = raw;
  if (raw === "~") {
    expanded = home;
  } else if (raw.startsWith("~/") || raw.startsWith("~\\")) {
    expanded = path.join(home, raw.slice(2));
  }

  return path.resolve(expanded);
}

/**
 * 确保得到绝对路径：相对路径相对 `cwd`（默认 process.cwd()）。
 * 若含 `~`，先 expand。
 */
export function resolveAbsolutePath(
  input: string,
  options?: { cwd?: string; home?: string },
): string {
  const home = options?.home ?? homedir();
  const cwd = options?.cwd ?? process.cwd();
  const trimmed = input.trim();
  if (!trimmed) {
    throw new SkillHubError({
      code: "E_PATH",
      message: "路径不能为空",
    });
  }

  if (trimmed === "~" || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return expandUserPath(trimmed, home);
  }

  if (path.isAbsolute(trimmed)) {
    return path.normalize(trimmed);
  }

  return path.resolve(cwd, trimmed);
}

/** 默认 `~/.skill-hub`，可被 `SKILL_HUB_HOME` 覆盖。 */
export function getDefaultHubHome(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[ENV_HUB_HOME]?.trim();
  if (override) {
    return expandUserPath(override);
  }
  return path.join(homedir(), DEFAULT_HUB_DIRNAME);
}

/** 默认配置路径：`SKILL_HUB_CONFIG` 或 `$HUB/config.yaml`。 */
export function getDefaultConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[ENV_HUB_CONFIG]?.trim();
  if (override) {
    return expandUserPath(override);
  }
  return path.join(getDefaultHubHome(env), CONFIG_FILENAME);
}

/** hub 子路径约定。 */
export function hubLayout(hubHome: string = getDefaultHubHome()): {
  home: string;
  skills: string;
  index: string;
  backups: string;
  config: string;
  catalog: string;
  history: string;
} {
  const home = expandUserPath(hubHome);
  return {
    home,
    skills: path.join(home, "skills"),
    index: path.join(home, "index"),
    backups: path.join(home, "backups"),
    config: path.join(home, CONFIG_FILENAME),
    catalog: path.join(home, CATALOG_FILENAME),
    history: path.join(home, "history.jsonl"),
  };
}

/**
 * Skill 名称规范化（DATA_MODEL §3）：
 * 1. trim + lower case
 * 2. 空白 → `-`
 * 3. 仅保留 `[a-z0-9._-]`，其余剔除
 * 4. 折叠连续 `-`，去掉首尾 `-`
 * 5. 空名 → E_PARSE
 */
export function normalizeSkillName(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  if (!lowered) {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "skill 名称不能为空",
    });
  }

  const spaced = lowered.replace(/[\s_]+/g, "-");
  const cleaned = spaced
    .replace(/[^a-z0-9._-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new SkillHubError({
      code: "E_PARSE",
      message: "skill 名称规范化后为空",
      details: { raw },
    });
  }

  return cleaned;
}

/** 判断路径是否落在 `root` 之下（解析后的绝对路径）。 */
export function isPathInside(child: string, root: string): boolean {
  const absChild = resolveAbsolutePath(child);
  const absRoot = resolveAbsolutePath(root);
  const rel = path.relative(absRoot, absChild);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
