# Remote MCP: current status and deployment boundary

Status: design/explanation only · Updated: 2026-10-09

## Can clients use a remote URL?

MCP supports remote access through Streamable HTTP. **Skill Hub currently implements only stdio**, where the host starts a local Node process. There is no deployed public endpoint, HTTP MCP launcher, OAuth setup or remote-client acceptance in this release.

The local Web viewer's `GET /api/*` endpoints are REST, not MCP JSON-RPC. Starting `pnpm web --host 0.0.0.0` or adding a reverse proxy does not turn them into MCP and would expose an unauthenticated viewer. A public GitHub repository is source hosting, not a running MCP server.

## Three operating models

| Model | Client behavior | Current support |
|-------|-----------------|-----------------|
| Local stdio | Host starts Node plus built MCP entry | Implemented and tested |
| SSH stdio to a trusted machine | Host starts a local SSH process, which starts Node on the remote machine | Possible with a separately configured transport wrapper; not delivered/tested by this repo; still has a local launcher |
| Remote Streamable HTTP | Client connects directly to an HTTPS MCP URL | Protocol supports it; implementation/deployment/verification remains future work |

For the requested “no local server per device” experience, the third model is the intended path. A service still has to run somewhere: on a trusted always-on machine or a server/container, with persistent Skill storage and a supervised process.

## Data and execution placement

```text
Agent / supported MCP client
        -> authenticated HTTPS Streamable HTTP
        -> Hub search/fetch/files/read service
        -> server-side catalog + Skill directories
        -> optional TypeSafe/Jev decision API
```

A remote server cannot use client-local absolute paths. Install/copy authorized Skills onto persistent server storage and regenerate catalog/index with server paths. Changing only SKILL_HUB_HOME does not rewrite a catalog containing the old machine's paths. Migration must preserve references/scripts/assets and licenses, validate tree/hash/paging and retain backups.

The remote MCP should keep the same read-only tool boundary. It is not a remote shell or script executor. Skills that reference client applications, local services, file paths or executable attachments need an explicit host-side adaptation; fetching their instructions does not make those resources automatically available.

## Required work before deployment

1. Reuse createSkillHubMcpServer handlers with an explicit StreamableHTTPServerTransport entry; keep the stdio CLI path intact. Provide initialization/session lifecycle handling and cleanup.
2. Terminate HTTPS with trusted certificates, validate Origin/Host and restrict the supported HTTP methods. Do not expose a bare unauthenticated listener or rely on CORS alone for authorization.
3. Authenticate every request. For broadly compatible remote clients use MCP-compatible OAuth metadata/token validation with correct issuer/audience; an API-key header/private-network gateway may be acceptable for selected personal clients only after checking their support. Do not label a static key as a complete OAuth implementation.
4. Limit the data scope and tool surface. Inventory/path/explain/history may reveal machine paths and provenance; filter/redact or separately authorize diagnostics. A bounded audit is still server work and needs limits, timeouts and rate control.
5. Persist the authorized Skill store, configure secret management/process supervision, verify startup/health and state freshness, and document backups/recovery.
6. Run real remote initialize/tools/list/call, Chinese task routing, exact fetch, paging/attachments, unauthorized/invalid-Origin/expired-token rejection, session cleanup and host-specific client tests. No existing local test proves remote compatibility.

The server should have only the permissions needed to read its designated Skill roots. Remote failures must be reported; cached data and BM25 availability do not remove transport/authentication failures.

## Two separate tokens

- **Hub access token** authenticates the client to the remote Hub. It belongs to the Hub's authorization system and must be valid for this server.
- **TYPESAFE_API_KEY** authenticates the Hub server to Jev. Store it server-side; clients should not receive it or send it as the Hub access token.

Server-side router.engine=external-typesafe can enable Jev for searches, or clients may request it explicitly if allowed. Metadata-only inference remains a third-party transfer, with cost and confidence limits documented in [JEV_SETUP](JEV_SETUP.md).

## Recommended next step

For personal cross-device use, host on a trusted always-on machine behind a private network and authenticated HTTPS, then configure a verified HTTP-capable client. Public multi-user hosting additionally needs isolation of catalogs/roots, per-user authorization/quotas and stronger operational controls.

This document does not provision a machine, open ports, migrate personal Skills or create a public endpoint. Those changes need a selected deployment target, host support, authorized data scope and their own acceptance evidence.

References: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [MCP integration](MCP_INTEGRATION.md).
