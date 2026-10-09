# Environment and configuration

Status: Active · Updated: 2026-10-09

## Requirements

Node.js ≥20, pnpm 10.27.0 and Git for public GitHub installation. macOS is the primary platform; Linux is exercised by CI. RTK is an optional local shell proxy, not a required dependency. No fixed external volume or personal host runtime is required.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm docs:check
pnpm smoke
```

Build output goes to each workspace's ignored `dist/` folder. There is no npm publication; run `pnpm hub`, `pnpm web`, or the built Node entries from a checkout.

## State and configuration paths

| Setting | Meaning |
|---------|---------|
| `SKILL_HUB_HOME` | State root; default `~/.skill-hub` |
| `SKILL_HUB_CONFIG` / CLI `--config` | Config file; default under the state root |
| `canonical_dir`, `index_dir`, `backup_dir` | Data paths declared in that config |
| `SKILL_HUB_PROFILES_DIR` | Optional profile templates directory |
| `SKILL_HUB_LOG_LEVEL` | Structured log verbosity |

`init` creates config, catalog, skills/index/backups directories. When `SKILL_HUB_HOME` is overridden, the generated data paths follow that root. Existing custom config paths remain authoritative; changing only the state root does not relocate a pre-existing config's data or Agent targets.

For isolated trials set `SKILL_HUB_HOME` to a new temp directory before `pnpm hub init`; avoid `init --force` on an existing Hub because it overwrites config/catalog. Sandbox sync requires explicit sandbox Agent mappings; do not inherit default real-user Agent directories.

## Agent mappings versus sources

`agents` are optional compatibility sync targets. `sources` are explicit Skill input locations for inventory/ingest, independent of targets. `project`/`workspace` entries do not default to global projection. Only directories containing `SKILL.md` are treated as Skills.

Templates: `configs/agents/default.yaml`, `configs/profiles/`, `configs/taxonomy.yaml`, `configs/models.yaml`.

## Optional networking

Public GitHub install/update may clone to a temporary directory. Explicit Jev requests transmit queries and metadata to TypeSafe; generic provider probes contact the configured endpoint. The Web Markdown renderer uses a CDN. Default local BM25, catalog reading and static audit require no model/network access.

Do not store API keys in committed YAML/JSON. See [MODELS](../architecture/MODELS.md) and [MCP integration](MCP_INTEGRATION.md). GUI hosts may use a different PATH from your shell: use their Node executable and the absolute built MCP entry path.
