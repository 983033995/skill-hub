# Streamable HTTP MCP hosting

Status: implemented, locally verified · Updated: 2026-10-26 · Public deployment and host-app acceptance: pending

Skill Hub has a separate authenticated HTTP MCP entry alongside stdio. The Web viewer remains unauthenticated REST and must not be exposed as an MCP endpoint. See [ADR 0013](../adr/0013-streamable-http-hosting.md).

## Start from a source checkout

```bash
pnpm install --frozen-lockfile
pnpm build
export SKILL_HUB_HOME=/srv/skill-hub
# Inject a random private token through the supervisor secret store.
export SKILL_HUB_HTTP_TOKEN='<random-token-at-least-32-characters>'
pnpm mcp:http
```

The placeholder is not a production token. Generate at least 32 random bytes encoded as hex/base64url; never commit it. Validation requires at least 32 Bearer-token characters; it cannot establish entropy. Without a token startup fails before listening. Default: `http://127.0.0.1:8788/mcp`.

Initialize a **new dedicated** Hub using `pnpm hub init`, install only authorized Skills with the existing CLI, then build the index before serving. Never initialize over an existing store. A catalog copied from another machine retains old absolute paths: install/ingest on the server and regenerate catalog/index there. The service reads the catalog on subsequent calls; it does not install, update or execute Skills.

| Environment | Default / meaning |
|---|---|
| `SKILL_HUB_HTTP_TOKEN` | Required shared Bearer token on every request |
| `SKILL_HUB_HTTP_HOST` | `127.0.0.1`; explicit `0.0.0.0` for a platform/container ingress |
| `SKILL_HUB_HTTP_PORT` | Otherwise platform `PORT`, otherwise `8788` |
| `SKILL_HUB_HTTP_ALLOWED_HOSTS` | Comma-separated exact authorities; defaults: `127.0.0.1:<actual-port>`, `localhost:<actual-port>`, `[::1]:<actual-port>`; required for non-loopback binding |
| `SKILL_HUB_HTTP_ALLOWED_ORIGINS` | Comma-separated exact HTTP(S) origins, no trailing slash; absent Origin allowed, present Origin rejected by default |
| `SKILL_HUB_HOME`, `SKILL_HUB_CONFIG` | Existing server-side catalog/config selection; config paths stay authoritative |
| `SKILL_HUB_USAGE_LOG` | Existing optional local observation; unset disables it |

HTTP always exposes runtime's `skill_search`, `skill_read`, `skill_files`, regardless of `SKILL_HUB_MCP_MODE`. Default Top-K=3, read page=8000 characters. Calling hidden full tools is rejected. Server path metadata and diagnostic details are removed; authorized Skill text/metadata is returned as stored and may itself contain private content. Every token holder can read the entire selected catalog and safe attachments. Curate the store and restrict the service account's filesystem permissions.

## Client contract

Use a client supporting **Streamable HTTP and custom Authorization headers**. Supply `https://hub.example.com/mcp` and `Authorization: Bearer <private-hub-token>` through that client's supported configuration and secret mechanism. There is no universal host config schema.

For the Node SDK: `new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: 'Bearer …' } } })`.

The endpoint is stateless: initialize/list/call each use POST; replies use `text/event-stream`. No `Mcp-Session-Id` is issued. Initialized notifications return 202 via the SDK. GET/DELETE `/mcp` return 405. No legacy `/sse`, unsolicited notification stream, event replay or session store is provided. SSE framing does not imply token-by-token streaming of a Skill body.

Browser CORS/preflight access is not provided; allowing an Origin alone does not enable CORS. Real SDK tests do not prove compatibility with every host app.

## HTTPS and hosting

Keep the listener on loopback behind a trusted HTTPS reverse proxy, or bind explicitly inside a platform's private ingress. For example, set `SKILL_HUB_HTTP_ALLOWED_HOSTS=hub.example.com` for a default HTTPS port. Preserve that Host and Authorization/Origin headers; Forwarded/X-Forwarded-* are ignored. Do not expose the separate Web viewer.

An nginx location excerpt (the host still needs an HTTPS server and trusted certificates):

```nginx
location = /mcp {
    proxy_pass http://127.0.0.1:8788;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header Origin $http_origin;
    proxy_buffering off;
    proxy_read_timeout 35s;
}
```

Use `$http_host` instead when an explicitly allowed non-default port must be preserved. Add ingress rate limits and network restrictions. Run `node apps/mcp-server/dist/http.js` under a supervisor with a private token and persistent Skill storage. SIGINT/SIGTERM drain requests, then close remaining sockets after five seconds. Rollback restores the previous build/supervisor settings; HTTP does not migrate the store.

Authenticated `GET /healthz` reports process liveness only. Platforms without authenticated HTTP probes need a TCP or internal authenticated probe; an unauthenticated health request returns 401. Validate readiness using initialize/list, Chinese search, paged read and attachment/hash checks.

Limits: 1MiB uncompressed JSON body, 16 active POST requests, ten-second header timeout, thirty-second response deadline. Excess concurrency returns 429 with Retry-After; response deadlines return 504 or close an already-started SSE stream. Method/path/media/Host/Origin/auth failures occur before dispatch. These are process-local bounds, not per-user quotas or a distributed rate limiter. Closing a request does not guarantee cancellation of underlying filesystem/provider work.

## Public platforms and npm

[Render's MCP hosting guide](https://render.com/articles/building-and-hosting-mcp-servers-a-complete-guide) documents custom Node/Git deployment with HTTPS. Its [persistent disks](https://render.com/docs/disks) require paid services; runtime file changes otherwise disappear on restart/redeploy. This suits the existing Node/filesystem architecture, but actual deployment, authenticated probes, Host/SSE behavior and persistence still require acceptance.

[Smithery's current publishing guide](https://smithery.ai/docs/build) supports distribution of an already-hosted Streamable HTTP URL or a local MCPB artifact. Listing/gateway distribution does not prove this Node/filesystem service runs unchanged there. Confirm the current runtime, storage and OAuth requirements before selecting an adapter.

The [npm registry](https://docs.npmjs.com/about-the-public-npm-registry/) distributes packages; it does not keep HTTP processes running. A future npm package could simplify local stdio or hosted startup, while a platform runs the service. Source workspaces stay `private: true`. `pnpm pack:npm` now generates a separate single command package, and `pnpm check:npm` verifies installation, npm exec and MCP entry points. See [npm distribution](NPM_DISTRIBUTION.md). `@zhangheteng/skill-hub@0.2.0` is published and registry installation verified; npm distribution does not create a hosted URL.

## Remaining acceptance

Static Bearer auth is for one owner and trusted clients. It is **not MCP OAuth**: OAuth discovery/issuer/audience validation, refresh flow, per-user catalog, quota and billing are not implemented. OAuth-only hosts cannot be assumed to connect. This is not a public multi-user service.

`TYPESAFE_API_KEY` remains separate from the Hub access token. Optional Jev follows server-side routing config and can send query/metadata to TypeSafe. Choose BM25 and leave provider credentials unset for offline-only operation.

Locally verified with synthetic stores: real Node SDK initialize/list/call, POST SSE/no-session framing, concurrent clients, Chinese routing, paging/hash/attachments, hidden-tool/traversal rejection, auth/Host/Origin/method/media/JSON/protocol limits, body/concurrency limits and disconnect cleanup. Built stdio acceptance is separate.

Pending: select a host/account and authorized Skill scope; deploy and verify real HTTPS/SSE/Host, token rotation, the selected host app, restart persistence/backups and catalog/index readiness. No public endpoint or personal Skill upload has been performed.

References: [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [MCP integration](MCP_INTEGRATION.md).
