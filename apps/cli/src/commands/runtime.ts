import { skillFiles, skillList, skillRead } from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runBrowse(options: {
  json: boolean;
  query?: string;
  offset?: number;
  limit?: number;
  catalogPath?: string;
  configPath?: string;
}): Promise<number> {
  const result = await skillList({
    query: options.query,
    offset: options.offset,
    limit: options.limit,
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `browse total=${result.total} offset=${result.offset}`,
    ...(result.skills.length
      ? result.skills.map((skill) => `  ${skill.name}  ${skill.description}`)
      : ["  (无结果)"]),
  ]);
  printNextOffset("browse", options.query, result.nextOffset);
  return 0;
}

export async function runFiles(options: {
  json: boolean;
  name: string;
  path?: string;
  offset?: number;
  limit?: number;
  catalogPath?: string;
  configPath?: string;
}): Promise<number> {
  requireName(options.name, "files");
  const result = await skillFiles({
    name: options.name,
    path: options.path,
    offset: options.offset,
    limit: options.limit,
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  if (options.json) {
    printJson(result);
    return 0;
  }

  printLines([
    `files ${result.name} path=${result.path || "."} total=${result.total} offset=${result.offset}`,
    ...(result.files.length
      ? result.files.map((file) => {
          const size = file.size === undefined ? "" : ` size=${file.size}`;
          const reason = file.reason ? ` ${file.reason}` : "";
          return `  ${file.type.padEnd(9)} ${file.path}${size}${reason}`;
        })
      : ["  (空目录)"]),
  ]);
  printNextOffset("files", options.name, result.nextOffset, options.path);
  return 0;
}

export async function runRead(options: {
  json: boolean;
  name: string;
  file?: string;
  offset?: number;
  maxChars?: number;
  catalogPath?: string;
  configPath?: string;
}): Promise<number> {
  requireName(options.name, "read");
  const result = await skillRead({
    name: options.name,
    file: options.file,
    offset: options.offset,
    maxChars: options.maxChars,
    catalogPath: options.catalogPath,
    configPath: options.configPath,
  });
  if (options.json) {
    printJson(result);
    return 0;
  }

  // 正文可直接管道给 Agent；分页说明始终写 stderr，避免混入正文。
  process.stdout.write(result.body);
  if (result.nextOffset !== null) {
    const file = result.file === "SKILL.md" ? "" : ` --file ${quote(result.file)}`;
    console.error(
      `\n续读: skill-hub read ${quote(result.name)}${file} --offset ${result.nextOffset}`,
    );
  }
  return 0;
}

function requireName(name: string, command: string): void {
  if (!name.trim()) {
    throw new SkillHubError({ code: "E_CONFIG", message: `${command} 需要 skill name` });
  }
}

function printNextOffset(
  command: "browse" | "files",
  nameOrQuery: string | undefined,
  nextOffset: number | null,
  path?: string,
): void {
  if (nextOffset === null) return;
  const target = nameOrQuery?.trim() ? ` ${quote(nameOrQuery)}` : "";
  const pathFlag = path?.trim() ? ` --path ${quote(path)}` : "";
  console.error(`续读: skill-hub ${command}${target}${pathFlag} --offset ${nextOffset}`);
}

function quote(value: string): string {
  // POSIX 单引号可防止 $(), 反引号和空白在复制续读命令时被 shell 解释。
  return `'${value.replaceAll("'", "'\\''")}'`;
}
