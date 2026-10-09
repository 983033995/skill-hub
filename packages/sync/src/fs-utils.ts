import {
  cp,
  lstat,
  mkdir,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";

/** 统计目录下一层 entry 数；不存在返回 0。 */
export async function countEntries(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    return entries.length;
  } catch (err) {
    if (isErrno(err, "ENOENT")) return 0;
    throw err;
  }
}

/**
 * 递归复制目录/文件到 dest。
 * - 跟随源 symlink 复制内容（备份要快照内容，而非链接）
 */
export async function copyPathRecursive(src: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await cp(src, dest, {
      recursive: true,
      force: true,
      errorOnExist: false,
      // Node 的 cp 默认 dereference? 对 symlink 用 dereference 保内容
      dereference: true,
    });
  } catch (err) {
    throw new SkillHubError({
      code: "E_BACKUP",
      message: `复制失败: ${src} → ${dest}`,
      details: { src, dest },
      cause: err,
    });
  }
}

/**
 * 仅在 target 不存在时创建 symlink。symlink(2) 的 EEXIST 语义避免 create
 * 操作覆盖 dry-run 后新出现的文件、目录或链。
 */
export async function atomicSymlink(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  await assertPathAbsent(target);
  try {
    await symlink(source, target);
  } catch (err) {
    if (err instanceof SkillHubError) throw err;
    throw new SkillHubError({
      code: "E_SYNC",
      message: `创建 symlink 失败: ${target} → ${source}`,
      details: { target, source },
      cause: err,
    });
  }
}

/** 将 source 复制到不存在的 dest；先落在同目录临时路径，避免留下半成品投影。 */
export async function copyPathToEmpty(source: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await assertPathAbsent(dest);
  const temporary = uniqueSiblingPath(dest, "copy");
  try {
    await cp(source, temporary, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: true,
    });
    await assertPathAbsent(dest);
    await rename(temporary, dest);
  } catch (err) {
    try {
      await rm(temporary, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: "复制失败且临时目录清理失败",
        details: { temporary },
        cause: new AggregateError([err, cleanupError]),
      });
    }
    if (err instanceof SkillHubError) throw err;
    throw new SkillHubError({
      code: "E_SYNC",
      message: `复制同步投影失败: ${source} → ${dest}`,
      details: { source, dest },
      cause: err,
    });
  }
}

/**
 * 不覆盖 destination 地迁移 source；跨卷时先完整 copy，copy 成功后才移除 source。
 * 因此 copy 失败时原数据保持不变。
 */
export async function movePathToEmpty(source: string, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await assertPathAbsent(dest);
  try {
    await rename(source, dest);
    return;
  } catch (err) {
    if (!isErrno(err, "EXDEV")) {
      throw new SkillHubError({
        code: "E_SYNC",
        message: `迁移同步备份失败: ${source} → ${dest}`,
        details: { source, dest },
        cause: err,
      });
    }
  }

  await copyPathToEmpty(source, dest);
  try {
    await rm(source, { recursive: true, force: false });
  } catch (err) {
    throw new SkillHubError({
      code: "E_SYNC",
      message: `跨卷备份复制完成，但无法移除原路径: ${source}`,
      details: { source, dest },
      cause: err,
    });
  }
}

/** target 只能不存在；任何非 ENOENT 的检查错误必须显式失败。 */
export async function assertPathAbsent(target: string): Promise<void> {
  try {
    await lstat(target);
  } catch (err) {
    if (isErrno(err, "ENOENT")) return;
    throw new SkillHubError({
      code: "E_SYNC",
      message: `无法检查同步目标是否存在: ${target}`,
      details: { target },
      cause: err,
    });
  }
  throw new SkillHubError({
    code: "E_SYNC",
    message: `同步目标已存在，拒绝覆盖: ${target}`,
    details: { target },
  });
}

export function uniqueSiblingPath(target: string, purpose: string): string {
  return `${target}.skill-hub-${purpose}-${process.pid}-${randomUUID()}`;
}

export async function readLinkTarget(linkPath: string): Promise<string | null> {
  try {
    return await readlink(linkPath);
  } catch {
    return null;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch (err) {
    if (isErrno(err, "ENOENT")) return false;
    throw err;
  }
}

function isErrno(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
}

/** 生成备份时间戳目录名。 */
export function backupTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
