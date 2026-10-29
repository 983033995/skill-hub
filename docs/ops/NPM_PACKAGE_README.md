# Skill Hub

One local library for managing Skills across agents. Inspect what is present, track known sources and versions, review updates, and let agents read selected Skills through MCP.

This is the npm command distribution for [983033995/skill-hub](https://github.com/983033995/skill-hub). Node.js 20+ is required; Git is needed for GitHub-backed Skill sources.

**Version 0.2.2 is this release round's candidate.** Confirm the version appears in the npm registry before installing; a source candidate or package README does not prove publication.

## Install

```bash
npm install --global @zhangheteng/skill-hub@0.2.2
skill-hub version
# Or run the pinned CLI without a global installation:
npx --yes @zhangheteng/skill-hub@0.2.2 version
```

Installing or updating this npm package installs the program only. It does not install Skill content, import existing directories, migrate your Hub, or edit an agent's configuration. If you already have a Hub, keep using its existing home; do not run `skill-hub init --force`. Run `skill-hub init` only to create a new store.

## Inspect and manage your Skills

```bash
skill-hub inventory --json
skill-hub check-updates --json
skill-hub audit
```

`inventory` is a read-only scan of configured and built-in Skill locations; it does not import or synchronize them. `check-updates` checks only Skills with a managed source lock. Skills without a known source remain unknown; the command does not find a latest version for an unbound directory. `audit` uses bounded static rules, does not run Skill scripts, and is not a safety guarantee.

Choose which discovered Skills to manage through the explicit install/ingest workflow. Preview updates and review local changes before applying them. See the [lifecycle guide](UNIFIED_SKILL_MANAGEMENT.md).

## Commands

| Command | Purpose |
|---|---|
| `skill-hub` | CLI for inventory, source management, update checks, static audit, and other commands; run `skill-hub help` |
| `skill-hub-mcp` | Local stdio MCP server; full profile with 11 tools by default, optional three-tool `runtime` profile |
| `skill-hub-web` | Local, unauthenticated, read-only Web viewer |
| `skill-hub-opencode` | Opt-in OpenCode launcher with a packaged Hub MCP configuration and isolated profile |

The npm package distributes the program; the Hub manages Skill content separately. It does not provide an HTTP MCP server or remote hosting.

## Connect an MCP host

Use the same absolute `SKILL_HUB_HOME` in each agent configuration to point them at one Hub. Hosts use different schemas; do not copy one JSON/TOML shape to every client. Examples for Codex and OpenCode, plus tool details, are in the [MCP integration guide](MCP_INTEGRATION.md).

```bash
# Fixed-version stdio command for an MCP host:
npx --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
# Equivalent npm exec form:
npm exec --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-mcp
```

MCP connection does not remove native Skills, change host settings, or turn off native discovery. Configure each host explicitly. The OpenCode launcher is an opt-in isolated process; it does not replace the normal `opencode` command. It does not delete native Skill directories.

To use the packaged OpenCode launcher after global installation:

```bash
skill-hub-opencode --model your-provider/your-model
```

The launcher reads only provider/model settings from the existing OpenCode JSON config by default and supplies its own Hub MCP/profile config. Use `--provider-config` and `--hub-home` to select alternate files/locations. It does not inherit project MCP or plugin configuration. See [OpenCode through Skill Hub](OPENCODE_HUB.md).

## Optional usage observation

Usage recording is off unless a process receives `SKILL_HUB_USAGE_LOG` with an absolute `.jsonl` path. Each configured MCP process can append Hub-level read/search metadata to that file. The records do not identify the calling agent, show whether a model retained or adopted Skill text, or measure task success. Missing history remains unknown. Usage is not a complete activity or security audit.

## Boundaries

- This package does not install, publish, execute, or automatically migrate Skills.
- Source discovery is not source binding. Update checks cannot find an upstream for an unbound Skill.
- Static audit can report known patterns; it cannot certify safety.
- The stdio MCP server and local Web viewer are local interfaces. npm does not host a service.
- No universal token savings, model cost, or task-success claim is made.

See the source repository's [transport boundary](https://github.com/983033995/skill-hub/blob/main/docs/ops/REMOTE_MCP.md), [API](https://github.com/983033995/skill-hub/blob/main/docs/architecture/API.md), [security policy](https://github.com/983033995/skill-hub/blob/main/SECURITY.md), and [license](https://github.com/983033995/skill-hub/blob/main/LICENSE). Local release candidates may contain changes not yet merged into `main` or published to npm.
