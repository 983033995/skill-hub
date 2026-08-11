/**
 * 统一错误码与 SkillHubError。
 * 对齐 `docs/architecture/API.md` §5。
 */

/** API 约定的错误码集合。 */
export const ERROR_CODES = [
  "E_CONFIG",
  "E_PATH",
  "E_PARSE",
  "E_CONFLICT",
  "E_INDEX",
  "E_SYNC",
  "E_BACKUP",
  "E_NOT_FOUND",
  "E_INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** CLI 退出码（与 API.md 头部约定一致）。 */
export type ExitCode = 0 | 1 | 2 | 3;

const EXIT_BY_CODE: Record<ErrorCode, ExitCode> = {
  E_CONFIG: 3,
  E_PATH: 3,
  E_PARSE: 1,
  E_CONFLICT: 2,
  E_INDEX: 1,
  E_SYNC: 1,
  E_BACKUP: 1,
  E_NOT_FOUND: 1,
  E_INTERNAL: 1,
};

export interface SkillHubErrorOptions {
  code: ErrorCode;
  message: string;
  /** 附加上下文（路径、skill 名等），可 JSON 序列化。 */
  details?: Record<string, unknown>;
  cause?: unknown;
  /** 覆盖默认退出码映射。 */
  exitCode?: ExitCode;
}

/**
 * 可分类业务错误：禁止静默吞掉，CLI/MCP 应打印 `code` + 可操作信息。
 */
export class SkillHubError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly exitCode: ExitCode;
  override readonly cause?: unknown;

  constructor(options: SkillHubErrorOptions) {
    super(options.message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "SkillHubError";
    this.code = options.code;
    this.details = options.details;
    this.exitCode = options.exitCode ?? EXIT_BY_CODE[options.code];
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** 人类可读：一行摘要。 */
  toDisplayString(): string {
    const detail =
      this.details && Object.keys(this.details).length > 0
        ? ` ${JSON.stringify(this.details)}`
        : "";
    return `[${this.code}] ${this.message}${detail}`;
  }

  /** 结构化序列化，便于 `--json`。 */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      exitCode: this.exitCode,
      details: this.details ?? null,
    };
  }
}

/** 按错误码创建错误的快捷工厂。 */
export function createError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  cause?: unknown,
): SkillHubError {
  return new SkillHubError({ code, message, details, cause });
}

/** 将任意抛出值规范为 SkillHubError（未知错误 → E_INTERNAL）。 */
export function toSkillHubError(err: unknown, fallbackMessage = "内部错误"): SkillHubError {
  if (err instanceof SkillHubError) {
    return err;
  }
  if (err instanceof Error) {
    return new SkillHubError({
      code: "E_INTERNAL",
      message: err.message || fallbackMessage,
      cause: err,
    });
  }
  return new SkillHubError({
    code: "E_INTERNAL",
    message: fallbackMessage,
    details: { value: String(err) },
  });
}

/** 错误码 → CLI 退出码。 */
export function exitCodeFor(code: ErrorCode): ExitCode {
  return EXIT_BY_CODE[code];
}

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
