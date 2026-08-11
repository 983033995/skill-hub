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
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";

/** 统计目录下一层 entry 数；不存在返回 0。 */
export async function countEntries(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir);
    return entries.length;
  } catch {
    return 0;
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

/** 原子 symlink：先写临时链再 rename（同目录）。 */
export async function atomicSymlink(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.skill-hub-tmp-${process.pid}-${Date.now()}`;
  try {
    // 清理可能残留的 tmp
    await rm(tmp, { force: true, recursive: true });
    await symlink(source, tmp);
    // 若目标已存在（应为旧 symlink），先移除
    try {
      const st = await lstat(target);
      if (st.isSymbolicLink() || st.isFile()) {
        await rm(target, { force: true });
      } else if (st.isDirectory()) {
        throw new SkillHubError({
          code: "E_SYNC",
          message: `拒绝覆盖真实目录: ${target}`,
          details: { target },
        });
      }
    } catch (err) {
      if (err instanceof SkillHubError) throw err;
      // ENOENT ok
    }
    await rename(tmp, target);
  } catch (err) {
    await rm(tmp, { force: true, recursive: true }).catch(() => undefined);
    if (err instanceof SkillHubError) throw err;
    throw new SkillHubError({
      code: "E_SYNC",
      message: `创建 symlink 失败: ${target} → ${source}`,
      details: { target, source },
      cause: err,
    });
  }
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
  } catch {
    return false;
  }
}

/** 生成备份时间戳目录名。 */
export function backupTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}
