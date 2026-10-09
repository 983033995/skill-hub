import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { hashSkillTree, sha256Content } from "@skill-hub/core";
import { isPathInside, resolveAbsolutePath, SkillHubError } from "@skill-hub/shared";

export interface ProjectionIntegrityInput {
  canonicalDir?: string;
  source: string;
  target: string;
  skillName: string;
  /** Catalog 中的 SKILL.md hash；格式正确时必须与 canonical 一致。 */
  expectedSkillHash?: string;
  /** copy 投影需要完整目录 hash，以检测附件漂移。 */
  requireTreeHash?: boolean;
}

export interface ProjectionIntegrity {
  source: string;
  sourceReal: string;
  target: string;
  targetPhysical: string;
  sourceSkillHash: string;
  sourceTreeHash?: string;
}

export interface CopyTreeComparison {
  matches: boolean;
  targetSkillHash?: string;
  targetTreeHash?: string;
  detail?: string;
}

/** 仅接受单一目录名，避免 SkillMeta 被手工构造时穿越 agent skills 目录。 */
export function assertSafeSkillName(skillName: string): void {
  if (
    !skillName ||
    skillName === "." ||
    skillName === ".." ||
    skillName.includes("/") ||
    skillName.includes("\\") ||
    skillName.includes("\0") ||
    path.isAbsolute(skillName)
  ) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `非法 skill 名称，拒绝构造同步路径: ${JSON.stringify(skillName)}`,
      details: { skillName },
    });
  }
}

/** 只把真实的 core sha256 视为可强校验的 catalog hash，兼容早期测试/旧记录。 */
export function isVerifiedSkillHash(value: string | undefined): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/i.test(value);
}

/**
 * 校验计划中的 source/target 边界，并读取 canonical 的当前完整性信息。
 *
 * source 必须实际位于 canonical 根内；target 不得和 source 相同或互为祖先。
 * target 使用其父目录的 realpath 计算物理位置，不会把“正确指向 source 的
 * symlink”误判为自覆盖。
 */
export async function inspectProjectionIntegrity(
  input: ProjectionIntegrityInput,
): Promise<ProjectionIntegrity> {
  assertSafeSkillName(input.skillName);

  const source = resolveAbsolutePath(input.source);
  const target = resolveAbsolutePath(input.target);
  if (path.basename(target) !== input.skillName) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `同步目标与 skill 名称不一致: ${target}`,
      details: { skillName: input.skillName, target },
    });
  }

  let canonicalReal: string | undefined;
  if (input.canonicalDir) {
    const canonicalDir = resolveAbsolutePath(input.canonicalDir);
    canonicalReal = await realDirectory(canonicalDir, "canonical 目录");
  }

  const sourceReal = await realDirectory(source, "同步 source");
  if (canonicalReal && !isPathInside(sourceReal, canonicalReal)) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `同步 source 解析后逃离 canonical 目录: ${source}`,
      details: { source, sourceReal, canonicalDir: input.canonicalDir },
    });
  }

  const targetPhysical = await physicalTargetPath(target);
  if (isPathInside(sourceReal, targetPhysical) || isPathInside(targetPhysical, sourceReal)) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `同步 source 与 target 不能相同或互为祖先: ${source} ↔ ${target}`,
      details: { source, sourceReal, target, targetPhysical },
    });
  }

  const sourceSkillHash = await readSkillFileHash(source);
  if (
    isVerifiedSkillHash(input.expectedSkillHash) &&
    sourceSkillHash.toLowerCase() !== input.expectedSkillHash.toLowerCase()
  ) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `canonical SKILL.md 与 catalog hash 不一致: ${source}`,
      details: {
        source,
        expectedHash: input.expectedSkillHash,
        actualHash: sourceSkillHash,
      },
    });
  }

  const sourceTreeHash = input.requireTreeHash
    ? await hashTree(source, "canonical Skill")
    : undefined;

  return { source, sourceReal, target, targetPhysical, sourceSkillHash, sourceTreeHash };
}

/** 比较 copy 投影的 SKILL.md 与整个目录内容；附件变化也会失配。 */
export async function compareCopyTree(
  source: ProjectionIntegrity,
  target: string,
  expectedSkillHash?: string,
): Promise<CopyTreeComparison> {
  const targetPath = resolveAbsolutePath(target);
  try {
    const targetInfo = await stat(targetPath);
    if (!targetInfo.isDirectory()) {
      return { matches: false, detail: "copy 目标不是目录" };
    }
    const targetSkillHash = await readSkillFileHash(targetPath);
    const sourceTreeHash =
      source.sourceTreeHash ?? (await hashTree(source.source, "canonical Skill"));
    const targetTreeHash = await hashTree(targetPath, "copy 目标");
    const metaMatches =
      !isVerifiedSkillHash(expectedSkillHash) ||
      targetSkillHash.toLowerCase() === expectedSkillHash.toLowerCase();
    const matches =
      metaMatches &&
      targetSkillHash === source.sourceSkillHash &&
      targetTreeHash === sourceTreeHash;
    return {
      matches,
      targetSkillHash,
      targetTreeHash,
      detail: matches ? undefined : "SKILL.md 或附件目录 hash 与 canonical 不一致",
    };
  } catch (err) {
    return {
      matches: false,
      detail: `无法校验 copy 目录: ${errorMessage(err)}`,
    };
  }
}

/** 读取 SKILL.md（兼容旧的 skill.md），非 ENOENT 错误必须向上报告。 */
export async function readSkillFileHash(dir: string): Promise<string> {
  const absoluteDir = resolveAbsolutePath(dir);
  for (const filename of ["SKILL.md", "skill.md"]) {
    try {
      return sha256Content(await readFile(path.join(absoluteDir, filename), "utf8"));
    } catch (err) {
      if (isErrno(err, "ENOENT")) continue;
      throw new SkillHubError({
        code: "E_SYNC",
        message: `无法读取 ${filename}: ${absoluteDir}`,
        details: { dir: absoluteDir, filename },
        cause: err,
      });
    }
  }
  throw new SkillHubError({
    code: "E_SYNC",
    message: `同步 source 缺少 SKILL.md: ${absoluteDir}`,
    details: { dir: absoluteDir },
  });
}

export function isErrno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function hashTree(root: string, label: string): Promise<string> {
  try {
    return await hashSkillTree(root);
  } catch (err) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `${label} 目录 hash 失败: ${root}`,
      details: { root },
      cause: err,
    });
  }
}

async function realDirectory(target: string, label: string): Promise<string> {
  let info;
  try {
    info = await stat(target);
  } catch (err) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `${label} 不存在或无法访问: ${target}`,
      details: { target },
      cause: err,
    });
  }
  if (!info.isDirectory()) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `${label} 不是目录: ${target}`,
      details: { target },
    });
  }
  try {
    return await realpath(target);
  } catch (err) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `${label} 无法解析真实路径: ${target}`,
      details: { target },
      cause: err,
    });
  }
}

/** 仅解析 target 的父链，保留 target 本身作为将写入的位置。 */
async function physicalTargetPath(target: string): Promise<string> {
  let parent = path.dirname(target);
  const missing: string[] = [];

  for (;;) {
    let info;
    try {
      info = await stat(parent);
    } catch (err) {
      if (!isErrno(err, "ENOENT")) {
        throw new SkillHubError({
          code: "E_SYNC",
          message: `同步 target 父目录无法访问: ${parent}`,
          details: { target, parent },
          cause: err,
        });
      }
      const next = path.dirname(parent);
      if (next === parent) {
        throw new SkillHubError({
          code: "E_SYNC",
          message: `无法定位同步 target 父目录: ${target}`,
          details: { target },
        });
      }
      missing.unshift(path.basename(parent));
      parent = next;
      continue;
    }

    if (!info.isDirectory()) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `同步 target 父路径不是目录: ${parent}`,
        details: { target, parent },
      });
    }
    let physicalParent: string;
    try {
      physicalParent = await realpath(parent);
    } catch (err) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `同步 target 父目录无法解析真实路径: ${parent}`,
        details: { target, parent },
        cause: err,
      });
    }
    return path.join(physicalParent, ...missing, path.basename(target));
  }
}
