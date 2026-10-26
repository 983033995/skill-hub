# Skill Hub

One Skill store for multiple agents: task-based search, progressive text/attachment reads, managed updates, and optional local usage insights.

This is the npm distribution candidate for [983033995/skill-hub](https://github.com/983033995/skill-hub). A generated tarball is not proof of registry publication. Requires Node.js >=20; Git is needed for GitHub-backed Skill installation.

## Install a local release candidate

```bash
npm install --prefix ./hub-trial /absolute/path/to/skill-hub-0.2.0.tgz
./hub-trial/node_modules/.bin/skill-hub version
```

After a version has actually been published to npm, install the verified package/version using your npm client. For multiple binaries, use `npm exec --package=<verified-package>@<version> -- <binary>` and choose a command below. No package install hook creates or migrates your Skill store.

| Command | Purpose |
|---|---|
| `skill-hub` | CLI; use `help` to discover commands |
| `skill-hub-mcp` | Read-only stdio MCP; full by default, optional runtime |
| `skill-hub-mcp-http` | Bearer-authenticated Streamable HTTP MCP; three runtime tools |
| `skill-hub-web` | Local, unauthenticated read-only Web viewer |

## New isolated store

Set `SKILL_HUB_HOME` to a new absolute directory, then run `skill-hub init`. Use the existing CLI's preview/confirmation workflow to install or update Skills. Never run `init --force` over an existing store without understanding the replacement behavior. `skill-hub help` describes the installed CLI.

Configure stdio MCP hosts to execute `skill-hub-mcp` from the installed bin path. Set `SKILL_HUB_MCP_MODE=runtime` for the optional three-tool mode; this does not disable the host's native Skill discovery.

For HTTP, inject `SKILL_HUB_HTTP_TOKEN` (at least 32 random Bearer-token characters) into the process environment, select the server-side `SKILL_HUB_HOME`, and run `skill-hub-mcp-http`. Default listener: `127.0.0.1:8788/mcp`. Every request requires `Authorization: Bearer <token>`. Exposing a non-loopback listener requires explicit `SKILL_HUB_HTTP_ALLOWED_HOSTS`. Use HTTPS ingress and persistent storage on a hosting platform. Static Bearer authentication is not OAuth or multi-tenant isolation.

The npm registry distributes the program; it does not run your HTTP service. Skill text remains untrusted task guidance and never authorizes script execution. Optional Jev transmits task queries/metadata only through the configured/requested provider route; default BM25 works without a model key. Usage observation is disabled unless explicitly configured.

See the source repository's [hosting guide](https://github.com/983033995/skill-hub/blob/main/docs/ops/REMOTE_MCP.md), [API](https://github.com/983033995/skill-hub/blob/main/docs/architecture/API.md), [security policy](https://github.com/983033995/skill-hub/blob/main/SECURITY.md), and [license](https://github.com/983033995/skill-hub/blob/main/LICENSE). Local candidates may contain changes not yet merged into main.
