import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "@skill-hub/core";
import type { HubConfig } from "@skill-hub/shared";
import { expandUserPath, resolveAbsolutePath } from "@skill-hub/shared";
import {
  assertSafeSkillName,
  compareCopyTree,
  inspectProjectionIntegrity,
  isErrno,
} from "./integrity.js";
import type { VerifyItem, VerifyReport } from "./types.js";

/** 按 config.sync.mode 校验 enabled agents 上的 symlink 或实体 copy 目标。 */
export async function verifySync(config: HubConfig, skills: SkillMeta[]): Promise<VerifyReport> {
  const items: VerifyItem[] = [];
  const agents = config.agents.filter((agent) => agent.enabled);

  for (const agent of agents) {
    const agentDir = expandUserPath(agent.skills_dir);
    for (const skill of skills) {
      items.push(await checkSkill(agent.id, agentDir, config, skill));
    }
  }

  const summary = {
    ok: items.filter((item) => item.kind === "ok").length,
    missing: items.filter((item) => item.kind === "missing").length,
    not_symlink: items.filter((item) => item.kind === "not_symlink").length,
    not_copy: items.filter((item) => item.kind === "not_copy").length,
    broken_symlink: items.filter((item) => item.kind === "broken_symlink").length,
    wrong_target: items.filter((item) => item.kind === "wrong_target").length,
    content_mismatch: items.filter((item) => item.kind === "content_mismatch").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    ok:
      summary.missing === 0 &&
      summary.not_symlink === 0 &&
      summary.not_copy === 0 &&
      summary.broken_symlink === 0 &&
      summary.wrong_target === 0 &&
      summary.content_mismatch === 0,
    summary,
    items,
  };
}

async function checkSkill(
  agentId: string,
  agentDir: string,
  config: HubConfig,
  skill: SkillMeta,
): Promise<VerifyItem> {
  let expected: string;
  try {
    expected = resolveAbsolutePath(skill.path);
  } catch (err) {
    return invalidProjectionItem(agentId, skill.name, agentDir, String(skill.path), err);
  }

  let target = agentDir;
  try {
    assertSafeSkillName(skill.name);
    target = path.join(agentDir, skill.name);
  } catch (err) {
    return invalidProjectionItem(agentId, skill.name, target, expected, err);
  }

  const base = { agentId, skillName: skill.name, target, expected };
  let targetInfo;
  try {
    targetInfo = await lstat(target);
  } catch (err) {
    if (isErrno(err, "ENOENT")) {
      return {
        ...base,
        kind: "missing",
        detail: "目标不存在",
        suggestion:
          config.sync.mode === "copy"
            ? "运行 skill-hub sync --apply（授权后）创建实体副本"
            : "运行 skill-hub sync --apply（授权后）创建 symlink",
      };
    }
    return {
      ...base,
      kind: "content_mismatch",
      detail: `无法检查同步目标: ${errorMessage(err)}`,
      suggestion: "检查目标目录权限后重试 verify",
    };
  }

  if (config.sync.mode === "copy") {
    if (targetInfo.isSymbolicLink()) {
      return {
        ...base,
        kind: "not_copy",
        detail: "目标仍是 symlink，copy 模式要求实体目录",
        suggestion: "sync --dry-run 检查后再 apply",
      };
    }
    if (!targetInfo.isDirectory()) {
      return {
        ...base,
        kind: "content_mismatch",
        detail: "copy 目标不是实体目录",
        suggestion: "备份后使用 sync --apply --replace-real 更新",
      };
    }

    try {
      const integrity = await inspectProjectionIntegrity({
        canonicalDir: config.canonical_dir,
        source: expected,
        target,
        skillName: skill.name,
        expectedSkillHash: skill.hash,
        requireTreeHash: true,
      });
      const comparison = await compareCopyTree(integrity, target, skill.hash);
      if (comparison.matches) {
        return { ...base, kind: "ok", detail: "copy 目录内容匹配" };
      }
      return {
        ...base,
        kind: "content_mismatch",
        detail: comparison.detail ?? "copy 目录内容与 canonical 不一致",
        suggestion: "备份后使用 sync --apply --replace-real 更新",
      };
    } catch (err) {
      return {
        ...base,
        kind: "content_mismatch",
        detail: `canonical source 无法安全校验: ${errorMessage(err)}`,
        suggestion: "修复 canonical source 后重新生成 sync 计划",
      };
    }
  }

  if (!targetInfo.isSymbolicLink()) {
    return {
      ...base,
      kind: "not_symlink",
      detail: "目标是真实文件/目录",
      suggestion: "人工合并后删除实体目录，再 sync apply",
    };
  }

  let integrity;
  try {
    integrity = await inspectProjectionIntegrity({
      canonicalDir: config.canonical_dir,
      source: expected,
      target,
      skillName: skill.name,
      expectedSkillHash: skill.hash,
    });
  } catch (err) {
    return {
      ...base,
      kind: "content_mismatch",
      detail: `canonical source 无法安全校验: ${errorMessage(err)}`,
      suggestion: "修复 canonical source 后重新生成 sync 计划",
    };
  }

  try {
    const actual = await realpath(target);
    if (path.resolve(actual) === path.resolve(integrity.sourceReal)) {
      return { ...base, kind: "ok", detail: "指向正确" };
    }
    return {
      ...base,
      kind: "wrong_target",
      detail: `实际指向 ${actual}`,
      suggestion: "sync apply 将更新 symlink",
    };
  } catch (err) {
    if (isErrno(err, "ENOENT")) {
      return {
        ...base,
        kind: "broken_symlink",
        detail: "死链",
        suggestion: "sync apply 重建链接",
      };
    }
    return {
      ...base,
      kind: "wrong_target",
      detail: `无法解析 symlink: ${errorMessage(err)}`,
      suggestion: "检查目标目录权限后重试 verify",
    };
  }
}

function invalidProjectionItem(
  agentId: string,
  skillName: string,
  target: string,
  expected: string,
  err: unknown,
): VerifyItem {
  return {
    agentId,
    skillName,
    target,
    expected,
    kind: "content_mismatch",
    detail: `不安全的同步投影: ${errorMessage(err)}`,
    suggestion: "修复 skill 名称和 canonical 路径后重新生成 sync 计划",
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
