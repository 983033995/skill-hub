export interface ParsedArgs {
  json: boolean;
  verbose: boolean;
  config?: string;
  command: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

/**
 * 轻量 argv 解析：
 * skill-hub [--json] [--verbose] [--config path] <command> [args] [--flag value]
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let json = false;
  let verbose = false;
  let config: string | undefined;
  let command = "";

  let i = 0;
  const takeValue = (cur: string, next?: string): string | true => {
    if (next && !next.startsWith("-")) return next;
    return true;
  };

  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--json") {
      json = true;
      i += 1;
      continue;
    }
    if (a === "--verbose" || a === "-v") {
      verbose = true;
      i += 1;
      continue;
    }
    if (a === "--config") {
      const v = argv[i + 1];
      if (!v || v.startsWith("-")) {
        throw new Error("--config 需要路径参数");
      }
      config = v;
      i += 2;
      continue;
    }
    if (a === "--version" || a === "-V") {
      command = "version";
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") {
      command = command || "help";
      i += 1;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 2) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        i += 1;
        continue;
      }
      const key = a.slice(2);
      const val = takeValue(a, argv[i + 1]);
      if (val === true) {
        flags[key] = true;
        i += 1;
      } else {
        flags[key] = val;
        i += 2;
      }
      continue;
    }
    if (!command) {
      command = a;
      i += 1;
      continue;
    }
    positionals.push(a);
    i += 1;
  }

  if (!command) command = "help";

  return { json, verbose, config, command, positionals, flags };
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  const v = flags[key];
  if (v === true || v === "true" || v === "1") return true;
  return false;
}

export function flagString(
  flags: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const v = flags[key];
  if (typeof v === "string") return v;
  return undefined;
}
