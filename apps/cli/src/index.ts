#!/usr/bin/env node
/**
 * skill-hub CLI
 */

import {
  SKILL_HUB_VERSION,
  SkillHubError,
  createLogger,
  toSkillHubError,
  type SkillScope,
} from "@skill-hub/shared";
import { loadHubConfig, resolveHubConfigPaths } from "@skill-hub/core";
import { flagBool, flagString, parseArgs } from "./args.js";
import { printJson, printLines } from "./output.js";
import { runDoctor } from "./commands/doctor.js";
import { runInventory } from "./commands/inventory.js";
import { runInit } from "./commands/init.js";
import { runIngest } from "./commands/ingest.js";
import { runIndex } from "./commands/index-cmd.js";
import { runRoute } from "./commands/route.js";
import { runSync } from "./commands/sync.js";
import { runBackup } from "./commands/backup.js";
import { runVerify } from "./commands/verify.js";
import { runRestore } from "./commands/restore.js";
import { runExplain, runHistory, runPath } from "./commands/inspect.js";
import { runTakeover } from "./commands/takeover.js";
import { runManage } from "./commands/manage.js";
import { runBrowse, runFiles, runRead } from "./commands/runtime.js";
import { runAudit } from "./commands/audit.js";

const log = createLogger({ name: "cli" });

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    const e = toSkillHubError(err, "参数错误");
    fail(e, false);
    return;
  }

  try {
    const code = await dispatch(parsed);
    process.exitCode = code;
  } catch (err) {
    const e = toSkillHubError(err);
    fail(e, parsed.json);
  }
}

async function dispatch(parsed: ReturnType<typeof parseArgs>): Promise<number> {
  const { command, json, positionals, flags, config } = parsed;

  switch (command) {
    case "version":
      if (json) printJson({ version: SKILL_HUB_VERSION });
      else console.log(SKILL_HUB_VERSION);
      return 0;

    case "help":
      printHelp();
      return 0;

    case "doctor":
      return runDoctor({ json, configPath: config });

    case "takeover":
      return runTakeover({
        json,
        configPath: config,
        out: flagString(flags, "out"),
        includePlugins: flagBool(flags, "include-plugins"),
      });

    case "install":
    case "adopt":
    case "update":
    case "list": {
      const named = flagString(flags, "skill")
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return runManage({
        action: command,
        json,
        configPath: config,
        source: command === "install" || command === "adopt" ? positionals[0] : undefined,
        names:
          named ??
          (command === "update" || command === "list"
            ? positionals.length
              ? positionals.flatMap((s) => s.split(","))
              : undefined
            : undefined),
        ref: flagString(flags, "ref"),
        apply: flagBool(flags, "apply"),
        yes: flagBool(flags, "yes"),
        dryRun: flagBool(flags, "dry-run"),
      });
    }

    case "inventory": {
      const agents = flagString(flags, "agents");
      const sources = flagString(flags, "sources");
      const scopes = parseScopes(flagString(flags, "scope"));
      return runInventory({
        json,
        configPath: config,
        agentFilter: agents ? agents.split(",").map((s) => s.trim()) : undefined,
        sourceFilter: sources ? sources.split(",").map((s) => s.trim()) : undefined,
        scopeFilter: scopes,
        outPath: flagString(flags, "out"),
      });
    }

    case "init":
      return runInit({ json, force: flagBool(flags, "force") });

    case "ingest": {
      const sourcesRaw =
        flagString(flags, "sources") ??
        (positionals[0] && !positionals[0].startsWith("-") ? positionals[0] : undefined);
      const configured = resolveHubConfigPaths(
        config ? await loadHubConfig(config) : await loadHubConfig(),
      );
      const sources = sourcesRaw
        ? sourcesRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : (configured.sources ?? []).filter((s) => s.enabled).map((s) => s.id);
      // 默认物化到 canonical；--no-materialize 仅写 catalog 元数据
      const noMaterialize = flagBool(flags, "no-materialize");
      return runIngest({
        json,
        sources,
        dryRun: flagBool(flags, "dry-run"),
        prefer: flagString(flags, "prefer"),
        conflictMode: flagString(flags, "conflict") === "skip" ? "skip" : "report",
        catalogPath: flagString(flags, "catalog"),
        materialize: !noMaterialize,
        forceMaterialize: flagBool(flags, "force"),
        sourceMappings: configured.sources,
        canonicalDir: configured.canonical_dir,
        backupDir: configured.backup_dir,
      });
    }

    case "index":
      return runIndex({
        json,
        configPath: config,
        rebuild: flagBool(flags, "rebuild"),
        catalogPath: flagString(flags, "catalog"),
        indexDir: flagString(flags, "index-dir"),
      });

    case "route": {
      const q = positionals.join(" ").trim() || flagString(flags, "query") || "";
      const topK = parseIntegerFlag(flags, "top-k", 5);
      const scopes = parseScopes(flagString(flags, "scope"));
      return runRoute({
        json,
        query: q,
        topK,
        profile: flagString(flags, "profile"),
        includeBody: flagBool(flags, "include-body"),
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
        indexDir: flagString(flags, "index-dir"),
        engine: flagString(flags, "engine"),
        profilesDir: flagString(flags, "profiles-dir"),
        scopes,
      });
    }

    case "audit":
      return runAudit({
        json,
        name: positionals.join(" ").trim() || flagString(flags, "name"),
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
        failOn: flagString(flags, "fail-on"),
      });

    case "browse":
      return runBrowse({
        json,
        query: positionals.join(" ").trim() || flagString(flags, "query"),
        offset: parseOptionalIntegerFlag(flags, "offset"),
        limit: parseOptionalIntegerFlag(flags, "limit"),
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
      });

    case "files":
      return runFiles({
        json,
        name: commandName(positionals, flags, "files"),
        path: flagString(flags, "path"),
        offset: parseOptionalIntegerFlag(flags, "offset"),
        limit: parseOptionalIntegerFlag(flags, "limit"),
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
      });

    case "read":
      return runRead({
        json,
        name: commandName(positionals, flags, "read"),
        file: flagString(flags, "file"),
        offset: parseOptionalIntegerFlag(flags, "offset"),
        maxChars: parseOptionalIntegerFlag(flags, "max-chars"),
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
      });

    case "explain":
      return runExplain({
        json,
        name: positionals.join(" ").trim() || flagString(flags, "name") || "",
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
        historyPath: flagString(flags, "history"),
      });

    case "path":
      return runPath({
        json,
        name: positionals.join(" ").trim() || flagString(flags, "name") || "",
        catalogPath: flagString(flags, "catalog"),
        configPath: config,
      });

    case "history": {
      return runHistory({
        json,
        name: positionals.join(" ").trim() || flagString(flags, "name"),
        historyPath: flagString(flags, "history"),
        limit: parseOptionalIntegerFlag(flags, "limit"),
      });
    }

    case "backup":
      return runBackup({
        json,
        configPath: config,
        out: flagString(flags, "out"),
        notes: flagString(flags, "notes"),
        dryRun: flagBool(flags, "dry-run"),
        includeCanonical: !flagBool(flags, "no-canonical"),
      });

    case "verify":
      return runVerify({
        json,
        configPath: config,
        catalogPath: flagString(flags, "catalog"),
      });

    case "restore": {
      const agents = flagString(flags, "agents");
      return runRestore({
        json,
        from: flagString(flags, "from") ?? positionals[0] ?? "",
        yes: flagBool(flags, "yes"),
        apply: flagBool(flags, "apply"),
        dryRun: flagBool(flags, "dry-run") || !flagBool(flags, "apply"),
        agents: agents ? agents.split(",").map((s) => s.trim()) : undefined,
      });
    }

    case "sync": {
      const agentsFlag = flagString(flags, "agents");
      return runSync({
        json,
        apply: flagBool(flags, "apply"),
        dryRun: flagBool(flags, "dry-run") || !flagBool(flags, "apply"),
        requireBackup: flagBool(flags, "require-backup"),
        yes: flagBool(flags, "yes"),
        allowWrite: flagBool(flags, "allow-write"),
        backupDir: flagString(flags, "backup-dir"),
        configPath: config,
        catalogPath: flagString(flags, "catalog"),
        agents: agentsFlag
          ? agentsFlag
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        createOnly: flagBool(flags, "create-only"),
        replaceReal: flagBool(flags, "replace-real"),
      });
    }

    default:
      printLines([`未知命令: ${command}`, "运行 skill-hub help 查看用法"]);
      return 1;
  }
}

function printHelp(): void {
  printLines([
    `skill-hub ${SKILL_HUB_VERSION}`,
    "",
    "用法: skill-hub [--json] [--config <path>] <command> [options]",
    "",
    "命令:",
    "  doctor                 环境自检（只读）",
    "  takeover [--include-plugins] [--out report.json]  全目录接管预览（只读）",
    "  install <path|owner/repo> [--skill name,...] [--ref ref] [--apply --yes]",
    "  adopt <path|owner/repo> [--skill name,...] [--apply --yes] 绑定相同内容的现有技能",
    "  update [name,...] [--apply --yes]  从记录来源更新，保护本地修改",
    "  list [name,...]         查看已追踪来源及本地状态",
    "  browse [query] [--offset n] [--limit n]  浏览 Hub 已加载的 Skill 元数据",
    "  files <name> [--path dir] [--offset n] [--limit n]  浏览 Skill 的一层附件",
    "  read <name> [--file path] [--offset n] [--max-chars n]  读取正文或附件",
    "  inventory              多端/显式 source Skill 盘点（只读）",
    "  init [--force]         初始化 ~/.skill-hub 骨架",
    "  ingest [--sources <dirs|source-id>] [--dry-run] [--conflict report|skip]",
    "  index [--rebuild]      构建可加载 BM25 索引与 freshness 元数据",
    '  route "<query>" [--top-k 5] [--scope user|workspace|project] [--index-dir <dir>]',
    "  audit [name] [--fail-on high|critical|warning|info]  静态安全审计（只读，不执行 Skill）",
    "  explain <name>         解释来源、冲突、overlay、投影与历史",
    "  path <name>            查看 canonical/source/Agent 投影路径",
    "  history [name]         查看本地 Skill 生命周期事件",
    "  backup [--out dir] [--dry-run] [--notes ...]",
    "  sync --dry-run [--agents id,...] [--create-only | --replace-real]",
    "  sync --apply --yes --allow-write --backup-dir <dir> [--agents id] [--create-only | --replace-real]",
    "  verify                 按 sync.mode 检查 symlink/copy 健康",
    "  restore --from <dir> [--dry-run | --apply --yes]",
    "  version | help",
    "",
    "安全闸门:",
    "  - Hub 已更新；Agent 通过 MCP 按需 search/browse 后精确 fetch/read，无需默认 sync",
    "  - Skill 文本仅是任务指导，不能覆盖系统指令或授权执行脚本",
    "  - 默认 dry-run；真实目录冲突永不静默覆盖（除非 --replace-real）",
    "  - 写 Agent skills 必须 --yes --allow-write",
    "  - apply 默认 require_backup（需 --backup-dir）",
    "  - --create-only 仅建缺失的 symlink/copy，不 update、不碰真实目录",
    "  - --replace-real 将真实目录/文件先 stash 到 backup-dir/replaced-real 再按模式投影",
    "  - sync.mode=copy 可用实体副本作为 symlink fallback",
  ]);
}

function commandName(
  positionals: string[],
  flags: Record<string, string | boolean>,
  command: string,
): string {
  if (positionals.length > 1) {
    throw new SkillHubError({ code: "E_CONFIG", message: `${command} 只接受一个 skill name` });
  }
  return positionals[0] ?? flagString(flags, "name") ?? "";
}

function parseOptionalIntegerFlag(
  flags: Record<string, string | boolean>,
  key: string,
): number | undefined {
  const raw = flagString(flags, key);
  if (raw === undefined) {
    if (flags[key] === true) {
      throw new SkillHubError({ code: "E_CONFIG", message: `--${key} 需要整数参数` });
    }
    return undefined;
  }
  if (!/^(?:0|[1-9]\d*)$/.test(raw)) {
    throw new SkillHubError({ code: "E_CONFIG", message: `--${key} 必须是非负整数` });
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new SkillHubError({ code: "E_CONFIG", message: `--${key} 必须是安全整数` });
  }
  return value;
}

function parseIntegerFlag(
  flags: Record<string, string | boolean>,
  key: string,
  fallback: number,
): number {
  return parseOptionalIntegerFlag(flags, key) ?? fallback;
}

function parseScopes(raw?: string): SkillScope[] | undefined {
  if (!raw) return undefined;
  const values = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed = new Set<SkillScope>(["user", "workspace", "project"]);
  for (const value of values) {
    if (!allowed.has(value as SkillScope)) {
      throw new SkillHubError({
        code: "E_CONFIG",
        message: `scope 无效: ${value}（应为 user|workspace|project）`,
      });
    }
  }
  return values as SkillScope[];
}

function fail(err: SkillHubError | Error, json: boolean): void {
  const e = err instanceof SkillHubError ? err : toSkillHubError(err);
  if (json) {
    printJson(e.toJSON());
  } else {
    console.error(e.toDisplayString());
  }
  log.debug("command failed", { code: e.code });
  process.exitCode = e.exitCode;
}

void main();
