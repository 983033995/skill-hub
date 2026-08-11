import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "@skill-hub/core";
import type { HubConfig } from "@skill-hub/shared";
import { expandUserPath, resolveAbsolutePath } from "@skill-hub/shared";
import type { VerifyItem, VerifyReport } from "./types.js";

/**
 * 校验 enabled agents 上各 skill 链接是否正确指向 source。
 */
export async function verifySync(
  config: HubConfig,
  skills: SkillMeta[],
): Promise<VerifyReport> {
  const items: VerifyItem[] = [];
  const agents = config.agents.filter((a) => a.enabled);

  for (const agent of agents) {
    const agentDir = expandUserPath(agent.skills_dir);
    for (const skill of skills) {
      const target = path.join(agentDir, skill.name);
      const expected = resolveAbsolutePath(skill.path);
      items.push(await checkOne(agent.id, skill.name, target, expected));
    }
  }

  const summary = {
    ok: items.filter((i) => i.kind === "ok").length,
    missing: items.filter((i) => i.kind === "missing").length,
    not_symlink: items.filter((i) => i.kind === "not_symlink").length,
    broken_symlink: items.filter((i) => i.kind === "broken_symlink").length,
    wrong_target: items.filter((i) => i.kind === "wrong_target").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    ok:
      summary.missing === 0 &&
      summary.not_symlink === 0 &&
      summary.broken_symlink === 0 &&
      summary.wrong_target === 0,
    summary,
    items,
  };
}

async function checkOne(
  agentId: string,
  skillName: string,
  target: string,
  expected: string,
): Promise<VerifyItem> {
  const base = { agentId, skillName, target, expected };
  let st;
  try {
    st = await lstat(target);
  } catch {
    return {
      ...base,
      kind: "missing",
      detail: "目标不存在",
      suggestion: "运行 skill-hub sync --apply（授权后）创建 symlink",
    };
  }

  if (!st.isSymbolicLink()) {
    return {
      ...base,
      kind: "not_symlink",
      detail: "目标是真实文件/目录",
      suggestion: "人工合并后删除实体目录，再 sync apply",
    };
  }

  try {
    const actual = await realpath(target);
    const want = await safeReal(expected);
    if (path.resolve(actual) === path.resolve(want)) {
      return { ...base, kind: "ok", detail: "指向正确" };
    }
    return {
      ...base,
      kind: "wrong_target",
      detail: `实际指向 ${actual}`,
      suggestion: "sync apply 将更新 symlink",
    };
  } catch {
    return {
      ...base,
      kind: "broken_symlink",
      detail: "死链",
      suggestion: "sync apply 重建链接",
    };
  }
}

async function safeReal(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return path.resolve(p);
  }
}
