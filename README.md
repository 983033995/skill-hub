<p align="center"><img src="docs/assets/skill-hub-mark.svg" width="80" alt="Skill Hub" /></p>

<h1 align="center">Skill Hub</h1>
<p align="center"><strong>Manage Skills across agents from one canonical library.</strong></p>
<p align="center">Inspect local copies, review updates from tracked sources, and load relevant Skills on demand.</p>

<p align="center">
  <a href="https://github.com/983033995/skill-hub/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/983033995/skill-hub/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-blue.svg" /></a>
  <img alt="Node 20+" src="https://img.shields.io/badge/Node-20%2B-339933" />
  <img alt="Local first" src="https://img.shields.io/badge/Local-first-d7f75b" />
</p>

<p align="center"><a href="README.zh-CN.md">简体中文</a> · <a href="#install-the-program">Install</a> · <a href="#connect-an-agent">Connect an agent</a> · <a href="docs/INDEX.md">Docs</a> · <a href="CONTRIBUTING.md">Contribute</a></p>

Skill Hub is a local program for managing Agent Skills: directories with a `SKILL.md` and optional scripts, references, or assets. It gives you one place to track Skill sources and versions, inspect what exists across configured agent directories, and offer selected Skills through MCP when a task needs them.

**Version 0.2.2 is this release round's npm candidate.** A candidate in this repository is not proof of publication; check the npm registry before installing this exact version. [npm package guide →](docs/ops/NPM_PACKAGE_README.md)

## The problem it addresses

- Skills accumulate on a machine. It becomes hard to tell what is installed, where it came from, whether its tracked source has changed, and what a static review can or cannot detect.
- Each agent can end up with its own copy. Those copies can drift in content and source history.

Skill Hub addresses this with a canonical library, source locks, read-only inventory and update checks, a bounded static audit, and optional MCP reads. It is a Skill manager first; on-demand loading is one way to use the managed library.

## Install the program

The npm package distributes the Skill Hub program. It does not install Skill content, import existing directories, or take over host settings. You need **Node.js 20+**; Git is needed for GitHub-backed Skill sources.

```bash
npm install --global @zhangheteng/skill-hub@0.2.2
skill-hub version
# Or run a pinned version without a global install:
npx --yes @zhangheteng/skill-hub@0.2.2 version
```

If you already have a Hub, the program install does not migrate it. Continue using that store; do not run `skill-hub init --force` over it. For a new store only, run `skill-hub init`.

## Inspect and manage Skills

```bash
skill-hub inventory --json
skill-hub check-updates --json
skill-hub audit
```

`inventory` reads configured and built-in Skill locations. It can show directory presence and provenance; it does not import Skills or prove that an agent is running or connected. Choose which discovered Skills to bring into the canonical library through the explicit install/ingest workflow.

`check-updates` is read-only and checks Skills with an existing managed source lock. A Skill with no bound source remains unknown: the command cannot discover its latest version from an untracked directory or infer an upstream on your behalf. Review a managed update plan before applying it; local changes are not silently replaced. See the [lifecycle guide](docs/ops/UNIFIED_SKILL_MANAGEMENT.md).

`audit` reports patterns found by bounded static rules. It does not execute Skill scripts and cannot certify a Skill as safe. Inspect the findings and the source before deciding whether to use it.

## Share one Hub across agents

Configure each MCP-capable agent to start the local `skill-hub-mcp` command and point it at the same `SKILL_HUB_HOME`. Each host has its own configuration schema; see [MCP integration examples](docs/ops/MCP_INTEGRATION.md) for Codex TOML and OpenCode JSON. The default MCP profile exposes 11 tools; the optional `runtime` profile exposes three: `skill_search`, `skill_read`, and `skill_files`.

```bash
# Fixed-version stdio server; usable by an MCP host's command/args configuration.
npx --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
# Equivalent npm exec form:
npm exec --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
```

MCP connection does not remove native Skills, edit agent settings, or disable native Skill discovery. Configure each host explicitly. For an isolated OpenCode launch with its own Hub profile, use the optional `skill-hub-opencode` command; it does not replace the ordinary `opencode` command. See [OpenCode through Skill Hub](docs/ops/OPENCODE_HUB.md).

## Optional usage records

Usage recording is off by default. Set `SKILL_HUB_USAGE_LOG` to an absolute `.jsonl` path in each MCP process you want to observe. The process records Hub-level read/search metadata; it cannot identify which MCP client made a request, whether the model retained or adopted the text, or whether a task succeeded. Missing history remains unknown. These records are not a complete activity or security audit. [Definitions and setup →](docs/ops/USAGE_AND_CONTEXT.md)

## See the local workbench

![Skill Hub library with synthetic demo Skills](docs/assets/library.png)

_Actual Web UI with synthetic demo data. The repository does not include a personal Skill library._

![Usage-rate and context-budget filters with synthetic observations](docs/assets/usage-budget.png)

_Usage rate measures recorded initial-body reads, not unique tasks or task success. Token values are heuristic estimates, not model bills._

## Boundaries

- Inventory does not automatically import, copy, or synchronize existing Skills. Managed updates and compatibility projections require an explicit operation.
- Update checks cover existing managed source locks. Unknown or unbound sources stay unknown; they are not automatically checked for a latest version.
- Static audit is a limited heuristic review, not a security guarantee.
- npm distributes the program; the canonical library manages Skill content separately. Installing or updating the npm program does not delete native Skills or disable an agent host.
- MCP currently uses local stdio. There is no HTTP MCP service. The local read-only Web UI is a separate interface and listens on loopback by default.
- No universal context-saving, model-cost, or task-success rate is claimed. Usage records describe Hub requests, not client identity or actual model adoption.

See the [current capability status](docs/planning/STATUS.md), [transport boundary](docs/ops/REMOTE_MCP.md), and [source configuration](docs/ops/ENVIRONMENT.md).

## For contributors

Source checkout and build are for repository contributors. End users can install the npm program without cloning or compiling this repository.

```bash
git clone https://github.com/983033995/skill-hub.git
cd skill-hub
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm smoke
```

CI checks Linux on Node 20/22 and macOS on Node 22 with synthetic fixtures and no model keys. Live model evaluation is separate, explicitly authorized, and potentially billable. [Contributing](CONTRIBUTING.md) · [Report a bug or request a feature](https://github.com/983033995/skill-hub/issues) · [Security policy](SECURITY.md)

[MIT](LICENSE) for this repository. Installed Skills retain their own licenses; see [NOTICE](NOTICE.md).
