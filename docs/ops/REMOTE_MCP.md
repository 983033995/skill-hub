# Remote MCP boundary after HTTP withdrawal

Status: stdio-only current source · Updated: 2026-10-29

The HTTP MCP source entry, remote exposure adapter, hosting settings and `skill-hub-mcp-http` distribution command have been removed at the owner's request. Current source supports local stdio MCP, with full compatibility and the optional three-tool runtime. See [MCP integration](MCP_INTEGRATION.md).

The local Web viewer uses unauthenticated REST and is not an MCP endpoint. Binding it outside loopback or putting it behind a proxy does not provide an MCP transport or authorize exposure of a private Skill library.

## Published packages and history

Already-published npm 0.2.0/0.2.1 artifacts retain their original HTTP command and bytes; this change does not unpublish, overwrite or deploy them. Current-source tarballs contain only CLI, stdio MCP and Web commands. The next registry release needs a separately bumped version, normal CI and the existing tag/OIDC workflow. A main-branch merge does not publish a new package.

[ADR 0013](../adr/0013-streamable-http-hosting.md) and the 2026-10-26 progress/release receipts are historical records. They do not describe an active endpoint after withdrawal. No public service, OAuth issuer, cloud account or authorized Skill upload is created by this change.

## Cross-device use

Each device can start a local stdio server from the source or npm CLI. A trusted machine can potentially be reached through a separately configured SSH+stdio wrapper, but this repository does not supply or verify that transport. A new HTTP hosting effort would require a new decision, selected host/client, authentication, authorized data scope, storage and end-to-end acceptance.

Skill catalog paths refer to server-side files. Copying a catalog or changing `SKILL_HUB_HOME` does not rewrite those paths or make local applications/scripts available on another host. Never treat reading a Skill as permission to execute or upload it.
