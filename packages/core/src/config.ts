/**
 * 加载 HubConfig：支持极简 YAML（与 configs/agents/default.yaml 同结构）。
 */

import { readFile } from "node:fs/promises";
import {
  type AgentMapping,
  type HubConfig,
  type PrivacyConfig,
  type RouterConfig,
  type RouterEngineId,
  type SkillProvenance,
  type SkillScope,
  type SkillSourceMapping,
  type SkillSourceType,
  type SkillStatus,
  type SyncConfig,
  SkillHubError,
  expandUserPath,
  getDefaultConfigPath,
  getDefaultHubHome,
  hubLayout,
  resolveAbsolutePath,
} from "@skill-hub/shared";

const DEFAULT_ROUTER: RouterConfig = { top_k: 5, engine: "bm25" };
const DEFAULT_SYNC: SyncConfig = {
  mode: "symlink",
  conflict: "report",
  require_backup: true,
};
const DEFAULT_PRIVACY: PrivacyConfig = { telemetry: false };

export function defaultHubConfig(homeLayout?: {
  skills: string;
  index: string;
  backups: string;
}): HubConfig {
  return {
    version: 1,
    canonical_dir: homeLayout?.skills ?? "~/.skill-hub/skills",
    index_dir: homeLayout?.index ?? "~/.skill-hub/index",
    backup_dir: homeLayout?.backups ?? "~/.skill-hub/backups",
    agents: [
      { id: "workbuddy", skills_dir: "~/.workbuddy/skills", enabled: true },
      { id: "claude-code", skills_dir: "~/.claude/skills", enabled: true },
      { id: "codex", skills_dir: "~/.codex/skills", enabled: true },
      { id: "agents", skills_dir: "~/.agents/skills", enabled: true },
      { id: "cursor", skills_dir: "~/.cursor/skills", enabled: true },
    ],
    sources: [],
    router: { ...DEFAULT_ROUTER },
    sync: { ...DEFAULT_SYNC },
    privacy: { ...DEFAULT_PRIVACY },
  };
}

export async function loadHubConfig(configPath?: string): Promise<HubConfig> {
  const abs = resolveAbsolutePath(configPath ?? getDefaultConfigPath());
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    if (configPath || (err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw new SkillHubError({ code: "E_CONFIG", message: `无法读取配置: ${abs}`, cause: err });
    }
    // 无配置文件时返回内置默认（不写盘）
    const layout = hubLayout(getDefaultHubHome());
    return defaultHubConfig(layout);
  }

  try {
    return parseHubConfigYaml(raw);
  } catch (err) {
    if (err instanceof SkillHubError) throw err;
    throw new SkillHubError({
      code: "E_CONFIG",
      message: `配置解析失败: ${abs}`,
      details: { path: abs },
      cause: err,
    });
  }
}

/** 将 config 中路径展开为绝对路径的新对象（不写回文件）。 */
export function resolveHubConfigPaths(config: HubConfig): HubConfig {
  return {
    ...config,
    canonical_dir: expandUserPath(config.canonical_dir),
    index_dir: expandUserPath(config.index_dir),
    backup_dir: expandUserPath(config.backup_dir),
    agents: config.agents.map((a) => ({
      ...a,
      skills_dir: expandUserPath(a.skills_dir),
    })),
    sources: (config.sources ?? []).map((s) => ({
      ...s,
      path: expandUserPath(s.path),
    })),
  };
}

/** 将配置中的 Skill source 转换为 SkillMeta provenance。 */
export function sourceMappingToProvenance(
  source: SkillSourceMapping,
  resolvedPath = expandUserPath(source.path),
): SkillProvenance {
  return {
    scope: source.scope,
    sourceType: source.source_type ?? "local",
    sourceRef: source.source_ref ?? resolvedPath,
    revision: source.revision,
    status: source.status ?? "active",
    overlayOf: source.overlay_of,
  };
}

export function parseHubConfigYaml(raw: string): HubConfig {
  const base = defaultHubConfig();
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const root: Record<string, unknown> = {};
  let section: string | null = null;
  let currentAgent: Partial<AgentMapping> | null = null;
  let currentSource: Partial<SkillSourceMapping> | null = null;
  const agents: AgentMapping[] = [];
  const sources: SkillSourceMapping[] = [];

  const flushAgent = () => {
    if (currentAgent?.id && currentAgent.skills_dir) {
      agents.push({
        id: String(currentAgent.id),
        skills_dir: String(currentAgent.skills_dir),
        enabled: currentAgent.enabled !== false,
      });
    }
    currentAgent = null;
  };

  const flushSource = () => {
    if (currentSource?.id && currentSource.path) {
      sources.push({
        id: String(currentSource.id),
        path: String(currentSource.path),
        scope: parseScope(currentSource.scope ?? "user"),
        enabled: currentSource.enabled !== false,
        source_type: parseSourceType(currentSource.source_type ?? "local"),
        source_ref:
          currentSource.source_ref === undefined ? undefined : String(currentSource.source_ref),
        revision: currentSource.revision === undefined ? undefined : String(currentSource.revision),
        status: parseStatus(currentSource.status ?? "active"),
        overlay_of:
          currentSource.overlay_of === undefined ? undefined : String(currentSource.overlay_of),
      });
    }
    currentSource = null;
  };

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // 顶层 key: value
    const top = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (top && !line.startsWith(" ") && !line.startsWith("\t")) {
      flushAgent();
      flushSource();
      const key = top[1]!;
      const val = top[2]!.trim();
      if (
        val === "" ||
        key === "agents" ||
        key === "sources" ||
        key === "router" ||
        key === "sync" ||
        key === "privacy"
      ) {
        section = key;
        if (key === "agents") {
          // list follows
        } else {
          root[key] = root[key] ?? {};
        }
      } else {
        section = null;
        root[key] = unquote(val);
      }
      continue;
    }

    // list item under agents
    if (section === "agents") {
      const listStart = line.match(/^\s+-\s+id:\s*(.+)$/);
      if (listStart) {
        flushAgent();
        currentAgent = { id: unquote(listStart[1]!.trim()), enabled: true };
        continue;
      }
      if (currentAgent) {
        const ak = line.match(/^\s+(skills_dir|enabled):\s*(.+)$/);
        if (ak) {
          const k = ak[1]!;
          const v = unquote(ak[2]!.trim());
          if (k === "enabled") currentAgent.enabled = v === "true";
          else currentAgent.skills_dir = v;
        }
      }
      continue;
    }

    // list item under sources
    if (section === "sources") {
      const listStart = line.match(/^\s+-\s+id:\s*(.+)$/);
      if (listStart) {
        flushSource();
        currentSource = {
          id: unquote(listStart[1]!.trim()),
          enabled: true,
          scope: "user",
          source_type: "local",
          status: "active",
        };
        continue;
      }
      if (currentSource) {
        const sourceField = line.match(
          /^\s+(path|scope|enabled|source_type|source_ref|revision|status|overlay_of):\s*(.+)$/,
        );
        if (sourceField) {
          const key = sourceField[1]! as keyof SkillSourceMapping;
          const value = unquote(sourceField[2]!.trim());
          if (key === "enabled") currentSource.enabled = value === "true";
          else if (key === "scope") currentSource.scope = value as SkillScope;
          else if (key === "source_type") currentSource.source_type = value as SkillSourceType;
          else if (key === "status") currentSource.status = value as SkillStatus;
          else if (key === "path") currentSource.path = value;
          else if (key === "source_ref") currentSource.source_ref = value;
          else if (key === "revision") currentSource.revision = value;
          else if (key === "overlay_of") currentSource.overlay_of = value;
        }
      }
      continue;
    }

    // nested under router/sync/privacy
    if (section && section !== "agents") {
      const nest = line.match(/^\s+([a-zA-Z0-9_]+):\s*(.*)$/);
      if (nest) {
        const bag = (root[section] as Record<string, unknown>) ?? {};
        const v = nest[2]!.trim();
        bag[nest[1]!] = coerceScalar(unquote(v));
        root[section] = bag;
      }
    }
  }
  flushAgent();
  flushSource();

  const routerBag = (root.router as Record<string, unknown>) ?? {};
  const syncBag = (root.sync as Record<string, unknown>) ?? {};
  const privacyBag = (root.privacy as Record<string, unknown>) ?? {};

  const engineRaw = String(routerBag.engine ?? base.router.engine);
  const engine = engineRaw as RouterEngineId;

  return {
    version: Number(root.version ?? base.version) || 1,
    canonical_dir: String(root.canonical_dir ?? base.canonical_dir),
    index_dir: String(root.index_dir ?? base.index_dir),
    backup_dir: String(root.backup_dir ?? base.backup_dir),
    agents: agents.length > 0 ? agents : base.agents,
    sources: sources.length > 0 ? sources : (base.sources ?? []),
    router: {
      top_k: Number(routerBag.top_k ?? base.router.top_k) || 5,
      engine,
    },
    sync: {
      mode: (String(syncBag.mode ?? base.sync.mode) as SyncConfig["mode"]) || "symlink",
      conflict:
        (String(syncBag.conflict ?? base.sync.conflict) as SyncConfig["conflict"]) || "report",
      require_backup:
        syncBag.require_backup === undefined
          ? base.sync.require_backup
          : Boolean(syncBag.require_backup),
    },
    privacy: {
      telemetry:
        privacyBag.telemetry === undefined ? base.privacy.telemetry : Boolean(privacyBag.telemetry),
    },
  };
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerceScalar(v: string): string | number | boolean {
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseScope(value: unknown): SkillScope {
  if (value === "user" || value === "workspace" || value === "project") {
    return value;
  }
  throw new SkillHubError({
    code: "E_CONFIG",
    message: `source.scope 无效: ${String(value)}（应为 user|workspace|project）`,
  });
}

function parseSourceType(value: unknown): SkillSourceType {
  if (value === "local" || value === "git" || value === "registry" || value === "generated") {
    return value;
  }
  throw new SkillHubError({
    code: "E_CONFIG",
    message: `source.source_type 无效: ${String(value)}`,
  });
}

function parseStatus(value: unknown): SkillStatus {
  if (value === "active" || value === "draft" || value === "deprecated") {
    return value;
  }
  throw new SkillHubError({
    code: "E_CONFIG",
    message: `source.status 无效: ${String(value)}`,
  });
}
