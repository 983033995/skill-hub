#!/usr/bin/env node
/**
 * skill-hub CLI
 */

import {
  SKILL_HUB_VERSION,
  SkillHubError,
  createLogger,
  toSkillHubError,
} from "@skill-hub/shared";
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

    case "inventory": {
      const agents = flagString(flags, "agents");
      return runInventory({
        json,
        configPath: config,
        agentFilter: agents ? agents.split(",").map((s) => s.trim()) : undefined,
        outPath: flagString(flags, "out"),
      });
    }

    case "init":
      return runInit({ json, force: flagBool(flags, "force") });

    case "ingest": {
      const sourcesRaw =
        flagString(flags, "sources") ??
        (positionals[0] && !positionals[0].startsWith("-") ? positionals[0] : undefined);
      const sources = sourcesRaw
        ? sourcesRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
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
      });
    }

    case "index":
      return runIndex({
        json,
        rebuild: flagBool(flags, "rebuild"),
        catalogPath: flagString(flags, "catalog"),
        indexDir: flagString(flags, "index-dir"),
      });

    case "route": {
      const q = positionals.join(" ").trim() || flagString(flags, "query") || "";
      const topK = Number(flagString(flags, "top-k") ?? "5") || 5;
      return runRoute({
        json,
        query: q,
        topK,
        profile: flagString(flags, "profile"),
        includeBody: flagBool(flags, "include-body"),
        catalogPath: flagString(flags, "catalog"),
        engine: flagString(flags, "engine"),
        profilesDir: flagString(flags, "profiles-dir"),
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
          ? agentsFlag.split(",").map((s) => s.trim()).filter(Boolean)
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
    "  inventory              多端 skill 盘点（只读）",
    "  init [--force]         初始化 ~/.skill-hub 骨架",
    "  ingest --sources <dirs> [--dry-run] [--conflict report|skip]",
    "  index [--rebuild]      构建路由索引元数据",
    "  route \"<query>\" [--top-k 5]",
    "  backup [--out dir] [--dry-run] [--notes ...]",
    "  sync --dry-run [--agents id,...] [--create-only | --replace-real]",
    "  sync --apply --yes --allow-write --backup-dir <dir> [--agents id] [--create-only | --replace-real]",
    "  verify                 检查 symlink 健康",
    "  restore --from <dir> [--dry-run | --apply --yes]",
    "  version | help",
    "",
    "安全闸门:",
    "  - 默认 dry-run；真实目录冲突永不静默覆盖（除非 --replace-real）",
    "  - 写 Agent skills 必须 --yes --allow-write",
    "  - apply 默认 require_backup（需 --backup-dir）",
    "  - --create-only 仅建缺失 symlink，不 update、不碰真实目录",
    "  - --replace-real 将真实目录/文件先 stash 到 backup-dir/replaced-real 再 symlink",
  ]);
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
