/** skill-hub 库/CLI 版本号（与根 package.json 对齐，发版时同步）。 */
export const SKILL_HUB_VERSION = "0.1.0" as const;

/** 默认用户运行时目录名（位于 `$HOME` 下）。 */
export const DEFAULT_HUB_DIRNAME = ".skill-hub" as const;

/** 环境变量：覆盖 hub 根目录。 */
export const ENV_HUB_HOME = "SKILL_HUB_HOME" as const;

/** 环境变量：覆盖配置文件路径。 */
export const ENV_HUB_CONFIG = "SKILL_HUB_CONFIG" as const;

/** 环境变量：日志级别。 */
export const ENV_LOG_LEVEL = "SKILL_HUB_LOG_LEVEL" as const;

/** 默认 catalog 文件名。 */
export const CATALOG_FILENAME = "catalog.json" as const;

/** 默认配置文件名。 */
export const CONFIG_FILENAME = "config.yaml" as const;
