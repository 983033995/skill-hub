# Current status

Updated: 2026-10-09 · Version: v0.1.0 source distribution

This page is the current overview. Older Phase documents record development history and may contain obsolete plans. Start with the README and current API for supported behavior.

## Implemented

- Managed local/public GitHub install/adopt/update/list and source locks.
- Scope/provenance, taxonomy, persistent BM25 and freshness checks.
- Read-only CLI/MCP progressive text and attachment access, static audit and local Web UI.
- Explicit symlink/copy compatibility sync, backups and verification.
- Optional Jev Choice routing and generic model-provider/status infrastructure.
- Opt-in OpenCode isolated launch profile and acceptance scripts.

## Host verification recorded before publication

| Host/path | Recorded result | Limits |
|-----------|-----------------|--------|
| CLI/MCP/HTTP synthetic fixtures | Offline unit/integration and compiled sandbox checks | Re-run in CI; not proof that every production Skill is safe |
| OpenCode isolated profile | Eight live scenarios with MiniMax-M3, native disk Skill discovery disabled; full MCP reads of a local 110-entry catalog | Optional local evidence, excluded from Git; recorded versions 1.18.31/1.18.34; not a guarantee for newer hosts |
| WorkBuddy | User-Skill disable configuration and MCP search/read checks | GUI/new-session model regression remains unverified; protected built-ins may remain |
| Qoder App | `skills.enabled=false`, runtime initialization with empty Skill list and connected Hub | Live CLI task returned `Not logged in`; GUI model task was not verified |
| TypeSafe/Jev | Live Choice routing on public synthetic descriptions | No labeled quality benchmark or calibrated threshold |

Connecting Hub does not automatically disable a host's discovery. This repository does not ship the developer's global command wrappers, personal configs or model credentials.

## Known limitations

- `restore --apply` replaces destination contents; review the manifest, retain a separate copy and test in a sandbox. Directory/lock and catalog/index changes are not one cross-package transaction.
- `route --include-body` is currently reserved; use explicit read/fetch tools.
- `hybrid` currently reports BM25 degradation; generic chat/embed providers are not automatically consumed by routing.
- Jev supports at most 254 Skill candidates in this adapter plus no-match; larger pools fall back to BM25. It sends queries/metadata remotely only when requested.
- Static audit is a bounded heuristic scan. `complete=false` and warnings need review; an audit does not authorize execution.
- The Web viewer is local, read-only, unauthenticated and uses a Markdown CDN with plain-text fallback.
- Windows deployment, background updates, managed pin/rollback/overlay commands and a portable manifest are not complete.

## Validation commands

`pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm docs:check`, `pnpm smoke`.

CI runs Node 20/22 on Linux and Node 22 on macOS without private catalog data or paid-model keys. Live scripts require an explicitly selected host/provider and can incur charges. Tests and smoke checks are the reproducible public evidence; private local output paths in historical logs are not downloadable artifacts.
