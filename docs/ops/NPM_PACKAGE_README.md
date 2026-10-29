# Skill Hub

One Skill store for multiple agents: task-based search, progressive text/attachment reads, managed updates, and optional local usage insights.

This is the npm command distribution for [983033995/skill-hub](https://github.com/983033995/skill-hub). Requires Node.js >=20; Git is needed for GitHub-backed Skill installation.

## Install

```bash
npm install --global @zhangheteng/skill-hub
skill-hub version
# Or run without a global installation:
npx --yes @zhangheteng/skill-hub version
```

For reproducible installation pin the version. To select another binary, use `npm exec --package=@zhangheteng/skill-hub@<version> -- <binary>` and choose a command below. No package install hook creates or migrates your Skill store.

| Command | Purpose |
|---|---|
| `skill-hub` | CLI; use `help` to discover commands |
| `skill-hub-mcp` | Read-only stdio MCP; full by default, optional runtime |
| `skill-hub-web` | Local, unauthenticated read-only Web viewer |

## New isolated store

Set `SKILL_HUB_HOME` to a new absolute directory, then run `skill-hub init`. Use the existing CLI's preview/confirmation workflow to install or update Skills. Never run `init --force` over an existing store without understanding the replacement behavior. `skill-hub help` describes the installed CLI.

Configure stdio MCP hosts to execute `skill-hub-mcp` from the installed bin path. Set `SKILL_HUB_MCP_MODE=runtime` for the optional three-tool mode; this does not disable the host's native Skill discovery.

Current-source candidates provide CLI, stdio MCP and Web only. The HTTP MCP hosting command was withdrawn on 2026-10-29. Previously published v0.2.1 artifacts retain their original command set and bytes; this source change does not publish a replacement.

The npm registry distributes the program; it does not host a service. Skill text remains untrusted task guidance and never authorizes script execution. Optional Jev transmits task queries/metadata only through the configured/requested provider route; default BM25 works without a model key. Usage observation is disabled unless explicitly configured.

See the source repository's [transport boundary](https://github.com/983033995/skill-hub/blob/main/docs/ops/REMOTE_MCP.md), [API](https://github.com/983033995/skill-hub/blob/main/docs/architecture/API.md), [security policy](https://github.com/983033995/skill-hub/blob/main/SECURITY.md), and [license](https://github.com/983033995/skill-hub/blob/main/LICENSE). Local candidates may contain changes not yet merged into main.
