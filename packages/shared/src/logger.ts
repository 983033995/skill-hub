/**
 * 轻量日志：人类可读 + 可选 JSON 行。
 * 级别可由 `SKILL_HUB_LOG_LEVEL` 或构造参数控制。
 */

import { ENV_LOG_LEVEL } from "./constants.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LoggerOptions {
  level?: LogLevel;
  /** true 时每行输出 JSON。 */
  json?: boolean;
  /** 默认 `skill-hub`。 */
  name?: string;
  /** 可注入，便于测试。 */
  stdout?: { write(chunk: string): void };
  stderr?: { write(chunk: string): void };
  now?: () => Date;
}

export interface Logger {
  readonly level: LogLevel;
  readonly json: boolean;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

function parseLogLevel(raw: string | undefined, fallback: LogLevel): LogLevel {
  if (!raw) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") {
    return v;
  }
  return fallback;
}

function formatHuman(
  level: LogLevel,
  name: string,
  message: string,
  fields?: Record<string, unknown>,
): string {
  const base = `${level.toUpperCase().padEnd(5)} [${name}] ${message}`;
  if (!fields || Object.keys(fields).length === 0) {
    return `${base}\n`;
  }
  return `${base} ${JSON.stringify(fields)}\n`;
}

function formatJson(
  level: LogLevel,
  name: string,
  message: string,
  fields: Record<string, unknown> | undefined,
  ts: string,
): string {
  return `${JSON.stringify({
    ts,
    level,
    name,
    message,
    ...(fields ?? {}),
  })}\n`;
}

class LoggerImpl implements Logger {
  readonly level: LogLevel;
  readonly json: boolean;
  private readonly name: string;
  private readonly baseFields: Record<string, unknown>;
  private readonly stdout: { write(chunk: string): void };
  private readonly stderr: { write(chunk: string): void };
  private readonly now: () => Date;

  constructor(
    options: LoggerOptions = {},
    baseFields: Record<string, unknown> = {},
  ) {
    this.level = options.level ?? parseLogLevel(process.env[ENV_LOG_LEVEL], "info");
    this.json = options.json ?? false;
    this.name = options.name ?? "skill-hub";
    this.baseFields = baseFields;
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.now = options.now ?? (() => new Date());
  }

  private enabled(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (!this.enabled(level)) return;
    const merged = { ...this.baseFields, ...fields };
    const stream = level === "error" || level === "warn" ? this.stderr : this.stdout;
    const line = this.json
      ? formatJson(level, this.name, message, merged, this.now().toISOString())
      : formatHuman(level, this.name, message, merged);
    stream.write(line);
  }

  debug(message: string, fields?: Record<string, unknown>): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: Record<string, unknown>): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: Record<string, unknown>): void {
    this.write("warn", message, fields);
  }

  error(message: string, fields?: Record<string, unknown>): void {
    this.write("error", message, fields);
  }

  child(fields: Record<string, unknown>): Logger {
    return new LoggerImpl(
      {
        level: this.level,
        json: this.json,
        name: this.name,
        stdout: this.stdout,
        stderr: this.stderr,
        now: this.now,
      },
      { ...this.baseFields, ...fields },
    );
  }
}

/** 创建 logger 实例。 */
export function createLogger(options?: LoggerOptions): Logger {
  return new LoggerImpl(options);
}

/** 进程级默认 logger（惰性按需可再建）。 */
export const defaultLogger: Logger = createLogger();
