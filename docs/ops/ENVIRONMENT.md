# Environment and configuration

Status: Active · Updated: 2026-10-26

## Requirements

Node.js ≥20, pnpm 10.27.0 and Git for public GitHub installation. macOS is the primary platform; Linux is exercised by CI. RTK is an optional local shell proxy, not a required dependency. No fixed external volume or personal host runtime is required.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm eval:check
pnpm docs:check
pnpm smoke
```

Development toolchain updates stay within the supported TypeScript 5, ESLint 9, Vitest 4 and Node 22 type major lines. The shared compiler config explicitly loads Node types. TypeScript 7 requires a separately verified lint/compiler migration; Vitest 5 removes Node 20 support and is incompatible with the existing CI matrix. Keep the Node 20/22 checks when reviewing dependency groups.

Build output goes to each workspace's ignored `dist/` folder. `@zhangheteng/skill-hub@0.2.1` is published on npm; `pnpm pack:npm` builds an isolated installable tarball and `pnpm check:npm` verifies it. See [npm distribution](NPM_DISTRIBUTION.md). Source users can run `pnpm hub`, `pnpm web`, or the built Node entries.

`pnpm eval:check` validates the checked-in v1 generic dataset's exact 50-task composition (30 required, 15 none, 5 ambiguous) and common secret/path patterns; other task counts or class mixes require a new contract version. It does not certify semantic anonymity, label correctness, or routing quality. This is a versioned data-shape gate, not a draft-label quality threshold. The offline `pnpm eval:router -- <catalog.json> [report.json]` command requires an explicit catalog path so it never silently reads `~/.skill-hub`; reports contain task text and Skill names, so keep reports local when using a private catalog. Neither command calls Jev or another model API.

The separate `pnpm eval:router:jev` command sends the checked-in generic queries and selected catalog `name/description/keywords` to the fixed official TypeSafe endpoint, one request per task; it ignores `TYPESAFE_API_URL`. It requires explicit `--catalog`, `--model`, `--max-requests`, `--confirm-paid-requests`, and `--confirm-skill-metadata-upload` options plus `TYPESAFE_API_KEY`; failures stop without retry, and a failure after submission leaves cost unknown. Before checking the key or making a request it verifies that the selected catalog contains every expected Skill label for the chosen sample; missing labels stop locally. For a deterministic round-robin selection across required/none/ambiguous task kinds, it reports dataset/selected/evaluated class counts and a local BM25 top-5/quality/latency baseline alongside Jev, with zero model calls/cost for BM25. Low request limits intentionally alter class proportions; metrics describe only the selected draft subset, not population performance. It is not part of CI. Optional USD estimates require caller-supplied input/output rates. `escalationRecommendationRate` counts Jev's `escalationRecommended` flag, not observed human escalations. Its report contains Skill names/labels but not queries or source paths; `--out` uses a private same-directory atomic file replacement and rejects symlink/directory targets.

Use `--preview --catalog <catalog.json> --model <model> --max-requests <n>` to inspect the actual TypeSafe request payloads locally. Preview does not require paid/upload confirmations, read `TYPESAFE_API_KEY`, call the network, or write a live report. By default stdout contains only a summary; full queries and candidate metadata are sensitive task context and are written only with an explicit `--preview-out <private-payloads.json>` to a same-directory atomic file with mode `0600`. Preview rejects online confirmation, cost-rate, and live `--out` options.

## State and configuration paths

| Setting                                    | Meaning                                   |
| ------------------------------------------ | ----------------------------------------- |
| `SKILL_HUB_HOME`                           | State root; default `~/.skill-hub`        |
| `SKILL_HUB_CONFIG` / CLI `--config`        | Config file; default under the state root |
| `canonical_dir`, `index_dir`, `backup_dir` | Data paths declared in that config        |
| `SKILL_HUB_PROFILES_DIR`                   | Optional profile templates directory      |
| `SKILL_HUB_LOG_LEVEL`                      | Structured log verbosity                  |
| `SKILL_HUB_USAGE_LOG`                      | Opt-in absolute local .jsonl usage log; unset disables recording; not query/body telemetry |

`init` creates config, catalog, skills/index/backups directories. When `SKILL_HUB_HOME` is overridden, the generated data paths follow that root. Existing custom config paths remain authoritative; changing only the state root does not relocate a pre-existing config's data or Agent targets.

For isolated trials set `SKILL_HUB_HOME` to a new temp directory before `pnpm hub init`; avoid `init --force` on an existing Hub because it overwrites config/catalog. Sandbox sync requires explicit sandbox Agent mappings; do not inherit default real-user Agent directories.

Usage recording is a per-process opt-in, separate from `privacy.telemetry`; no host configuration is edited automatically. `pnpm hub usage` reads existing records; `pnpm hub context-cost` inspects text without creating usage events. See [usage and context budget](USAGE_AND_CONTEXT.md) for definitions, retention limits and the difference between heuristic estimates and model billing. Clear `SKILL_HUB_USAGE_LOG` for ordinary tests; the public sandbox smoke does so internally to avoid inheriting a personal log path.

## Agent mappings versus sources

`agents` are optional compatibility sync targets. `sources` are explicit Skill input locations for inventory/ingest, independent of targets. `project`/`workspace` entries do not default to global projection. Only directories containing `SKILL.md` are treated as Skills.

Inventory (CLI and MCP/Web) also includes these built-in user sources, even for existing config files. They are read-only discovery paths, not additional sync targets or proof that a host is installed, enabled, or connected to Hub MCP. Missing directories are shown as missing and are never created by inventory.

| Source ID | Default user path | Official path reference |
| --- | --- | --- |
| `deepseek-harness` | `~/.dsh/skills` (`DSH_HOME/skills` when set) | [DeepSeek Harness filesystem provider](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/skill/skill-filesystem/README.md) |
| `opencode` | `~/.config/opencode/skills` | [OpenCode Skills](https://opencode.ai/docs/skills/) |
| `gemini-cli` | `~/.gemini/skills` | [Gemini CLI Skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md) |
| `qoder` | `~/.qoder/skills` | [Qoder Skills](https://docs.qoder.com/extensions/skills) |
| `github-copilot` | `~/.copilot/skills` | [GitHub Copilot Skills](https://docs.github.com/en/copilot/concepts/customizations/agent-skills) |
| `windsurf` | `~/.codeium/windsurf/skills` | [Cascade Skills](https://docs.devin.ai/desktop/cascade/skills) |
| `devin` | `~/.config/devin/skills` | [Cascade Skills shared CLI path](https://docs.devin.ai/desktop/cascade/skills) |
| `cline` | `~/.cline/skills` | [Cline Skills](https://github.com/cline/cline/blob/main/docs/customization/skills.mdx) |
| `roo-code` | `~/.roo/skills` | [Roo Code Skills](https://roocodeinc.github.io/Roo-Code/features/skills/) |
| `kilo-code` | `~/.kilo/skills` | [Kilo Code Skills](https://kilo.ai/docs/customize/skills) |

OpenCode and Devin paths honor `XDG_CONFIG_HOME`. Existing `agents` retain the WorkBuddy/Claude Code/Codex/shared `.agents`/Cursor mappings; shared compatibility directories are not added again for each consuming tool. An explicit `sources` entry with the same ID overrides the built-in path/scope/enabled state. A path already declared in `agents` or `sources` suppresses the duplicate built-in entry, including disabled declarations. This normalization does not resolve symlink aliases. Config files are not rewritten.

```yaml
sources:
  - id: deepseek-harness
    path: /custom/dsh/skills
    scope: user
    enabled: true
  - id: gemini-cli
    path: ~/.gemini/skills
    scope: user
    enabled: false
```

Use `skill-hub inventory --sources deepseek-harness,opencode` to limit the source report. To preview an import, explicitly select an ID, for example `skill-hub ingest --sources deepseek-harness --dry-run`. An `ingest` with no source arguments still uses only explicitly configured enabled `sources`; built-ins are never imported automatically. `takeover`, backup and sync retain their configured-root boundaries.

Project roots (such as `.dsh/skills`, `.opencode/skills` and `.github/skills`), mode-specific directories, custom host roots and plugin/system caches are not auto-discovered by this list. Declare project/custom locations explicitly under `sources` with the appropriate scope. Plain Markdown Skills supported by some Harness configurations remain outside Hub's directory-with-`SKILL.md` contract. These paths were checked against official documentation on 2026-10-26; host model/tool invocation is a separate acceptance step.

Templates: `configs/agents/default.yaml`, `configs/profiles/`, `configs/taxonomy.yaml`, `configs/models.yaml`.

The Web “Agent 目录” table combines configured targets and user-level sources, with a purpose column distinguishing compatibility targets from read-only sources; project/workspace sources have a separate table. Building updates JavaScript on disk but does not reload modules already held by a running Web/MCP process. Verify the actual service's inventory response and rendered page after an authorized reload; a passing build or a different preview port does not prove the original URL is updated.

## Optional networking

Public GitHub install/update may clone to a temporary directory. Explicit Jev requests transmit queries and metadata to TypeSafe; generic provider probes contact the configured endpoint. The Web Markdown renderer uses a CDN. Default local BM25, catalog reading and static audit require no model/network access.

Do not store API keys in committed YAML/JSON. See [MODELS](../architecture/MODELS.md) and [MCP integration](MCP_INTEGRATION.md). GUI hosts may use a different PATH from your shell: use their Node executable and the absolute built MCP entry path.

## MCP 传输边界（2026-10-29）

当前源码只提供 stdio MCP；HTTP MCP 启动命令与 `SKILL_HUB_HTTP_*` 环境配置已撤回，不再提供远端监听入口。Web 的本地 REST 端点独立保留。已发布0.2.1不被重写；后续源码候选差异见[REMOTE_MCP](REMOTE_MCP.md)。
