/**
 * @skill-hub/shared — 公共常量、错误码、路径、日志与共享类型。
 */

export * from "./constants.js";
export * from "./errors.js";
export * from "./paths.js";
export * from "./logger.js";
export * from "./types.js";

/**
 * @deprecated 脚手架占位，保留以免破坏早期烟雾引用；新代码请勿依赖。
 */
export function sharedPlaceholder(): string {
  return "skill-hub/shared";
}
