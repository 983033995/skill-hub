import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { SkillHubError } from "@skill-hub/shared";

/** 与 dereference 复制后的目录语义一致；不含时间戳，包含附件、空目录和执行位。 */
export async function hashSkillTree(root: string): Promise<string> {
  const base = await realpath(root);
  if (!(await stat(base)).isDirectory()) {
    throw new SkillHubError({ code: "E_PATH", message: `Skill 根不是目录: ${root}` });
  }
  const hash = createHash("sha256");
  async function visit(file: string, relative: string, ancestors: Set<string>): Promise<void> {
    const resolved = await realpath(file);
    const rel = path.relative(base, resolved);
    if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
      throw new SkillHubError({ code: "E_PATH", message: `Skill 内部链接越界: ${file}` });
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      if (ancestors.has(resolved)) {
        throw new SkillHubError({ code: "E_PATH", message: `Skill 内部链接环路: ${file}` });
      }
      hash.update(JSON.stringify(["directory", relative]));
      const next = new Set(ancestors).add(resolved);
      for (const name of (await readdir(file)).sort()) {
        // Git 元数据不属于分发包；安装器也必须排除它。
        if (name === ".git") continue;
        await visit(path.join(file, name), relative ? `${relative}/${name}` : name, next);
      }
    } else if (info.isFile()) {
      hash.update(JSON.stringify(["file", relative, info.mode & 0o111, info.size]));
      hash.update(await readFile(file));
    } else {
      throw new SkillHubError({ code: "E_PATH", message: `不支持的 Skill 文件类型: ${file}` });
    }
  }
  await visit(base, "", new Set());
  return `sha256:${hash.digest("hex")}`;
}
