import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { skillList } from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

const PAGE_SIZE = 100;

export async function runManifest(options: {
  json: boolean;
  outputPath?: string;
  apply?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  catalogPath?: string;
  configPath?: string;
}): Promise<number> {
  const apply = options.apply === true && options.dryRun !== true;
  const outputPath = options.outputPath?.trim() ? path.resolve(options.outputPath) : undefined;
  if (apply && !options.yes) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "写入 manifest 需要同时指定 --apply --yes",
    });
  }
  if (apply && !outputPath) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "写入 manifest 需要 --out <path>",
    });
  }

  const skills: Array<{ name: string; description: string }> = [];
  let offset = 0;
  while (true) {
    const page = await skillList({
      offset,
      limit: PAGE_SIZE,
      catalogPath: options.catalogPath,
      configPath: options.configPath,
    });
    skills.push(...page.skills);
    if (page.nextOffset === null) break;
    offset = page.nextOffset;
  }

  const content = renderAvailableSkillsManifest(skills);
  if (apply) await writeManifestAtomically(outputPath!, content);

  if (options.json) {
    printJson({
      skillCount: skills.length,
      outputPath: outputPath ?? null,
      dryRun: !apply,
      ...(outputPath ? {} : { content }),
    });
  } else if (!outputPath) {
    process.stdout.write(content);
  } else {
    printLines([
      `manifest skills=${skills.length} ${apply ? "written" : "dry-run"}`,
      `path: ${outputPath}`,
    ]);
  }
  return 0;
}

export function renderAvailableSkillsManifest(
  skills: Array<{ name: string; description: string }>,
): string {
  const entries = skills
    .slice()
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((skill) =>
      [
        "  <skill>",
        `    <name>${escapeXml(skill.name)}</name>`,
        `    <description>${escapeXml(skill.description)}</description>`,
        "  </skill>",
      ].join("\n"),
    );

  return [
    '<skills_system priority="1">',
    "",
    "## Available Skills",
    "",
    "<usage>",
    "For an unknown task, use Skill Hub `skill_search`; for a known name, use `skill_read` directly.",
    "Use `skill_files` and `skill_read` to load attachments. Read the selected skill before following it.",
    "</usage>",
    "",
    "<available_skills>",
    ...entries,
    "</available_skills>",
    "",
    "</skills_system>",
    "",
  ].join("\n");
}

function escapeXml(value: string): string {
  const validXmlText = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x0d ||
        (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
        (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
        (codePoint >= 0x10000 && codePoint <= 0x10ffff)
      );
    })
    .join("");
  return validXmlText.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function writeManifestAtomically(filePath: string, content: string): Promise<void> {
  try {
    const target = await lstat(filePath);
    if (!target.isFile()) {
      throw new SkillHubError({
        code: "E_PATH",
        message: "manifest 输出目标必须是普通文件，不能是目录或符号链接",
        details: { path: filePath },
      });
    }
  } catch (err) {
    if (!err || typeof err !== "object" || !("code" in err) || err.code !== "ENOENT") {
      throw err;
    }
  }

  const directory = path.dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.skill-hub-manifest-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}
