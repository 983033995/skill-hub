# Current status

Updated: 2026-10-29 · Version: 0.2.2 published on npm via GitHub Actions OIDC

The [2026-10-26 completion review](COMPLETION_REVIEW_20261026.md) records the source/test/documentation audit and remaining acceptance gaps.

This page is the current overview. Older Phase documents record development history and may contain obsolete plans. Start with the README and current API for supported behavior.

## Implemented

- Managed local/public GitHub install/adopt/update/list and source locks.
- Explicit single-Skill `migrate-source` previews and token-confirmed migration to a same-content local/GitHub source, preserving the canonical directory and old-lock rollback evidence. Update-check failures include the recorded source and a migration hint; no upstream is guessed.
- Read-only `check-updates` with independent local/upstream status, per-item errors and invocation-scoped Git snapshots; partial `list` results retain healthy entries and report `complete=false` (CLI exit 3). Apply protections remain strict; checks are not frozen update approval plans.
- Managed `update` previews include file/directory/mode diffs and a version-bound `planToken`; applying updates requires that token plus explicit confirmation, and rechecks the plan under the state lock. Update/rollback preserve root `.git` objects while rejecting references into replaceable Skill payloads; failed publication restores the original tree/metadata and known transaction snapshots are cleaned after verification. This tightens the v0.x write interface; see ADR 0011.
- Scope/provenance, taxonomy, persistent BM25 and freshness checks.
- Opt-in local search/read observation (separate CLI/MCP/Web/library sources and body/continuation/attachment calls), read-only `usage` reports and static `context-cost` estimates. Disabled by default; no query/body logging, no billing claims. See [usage and context budget](../ops/USAGE_AND_CONTEXT.md).
- Read-only CLI/MCP progressive text and attachment access, explicit lightweight `available_skills` manifest export, static audit and local Web UI.
- Explicit symlink/copy compatibility sync, backups and verification.
- Optional Jev Choice routing and generic model-provider/status infrastructure.
- Opt-in OpenCode isolated launch profile and acceptance scripts.
- Opt-in three-tool MCP runtime (`SKILL_HUB_MCP_MODE=runtime`), retaining default full compatibility. Offline protocol-size and explicit-model OpenCode comparison scripts; see [minimal runtime and evidence](../ops/MINIMAL_RUNTIME.md).

## Host verification recorded before publication

| Host/path                       | Recorded result                                                                                                                                                                                                                                                                                  | Limits                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI/MCP/HTTP synthetic fixtures | Offline unit/integration and compiled sandbox checks                                                                                                                                                                                                                                             | Re-run in CI; not proof that every production Skill is safe                                                                                                                                   |
| OpenCode isolated profile       | Eight live scenarios with MiniMax-M3, native disk Skill discovery disabled; full MCP reads of a local 110-entry catalog                                                                                                                                                                          | Optional local evidence, excluded from Git; recorded versions 1.18.31/1.18.34; not a guarantee for newer hosts                                                                                |
| WorkBuddy                       | User-Skill disable configuration and MCP search/read checks                                                                                                                                                                                                                                      | GUI/new-session model regression remains unverified; protected built-ins may remain                                                                                                           |
| Qoder App                       | `skills.enabled=false`, runtime initialization with empty Skill list and connected Hub                                                                                                                                                                                                           | Live CLI task returned `Not logged in`; GUI model task was not verified                                                                                                                       |
| TypeSafe/Jev                    | Live Choice routing on public synthetic descriptions; CI enforces the v1 dataset's exact 50 tasks and 30/15/5 class mix (new mixes need a new contract version); offline BM25 and local payload preview require explicit catalogs; opt-in runner preflights labels and stratifies BM25/Jev tasks | Labels remain agent-authored draft; the live evaluator has not run against a real catalog/model call, so no live Jev quality, cost or escalation benchmark or calibrated threshold is claimed |

Connecting Hub does not automatically disable a host's discovery. This repository does not ship the developer's global command wrappers, personal configs or model credentials.

Current local evidence also includes [50-task draft recall evaluation and Native/Hybrid/Hub-only pilot](../research/RUNTIME_REVIEW_20261012.md). The Native pilot uses 110 real catalog descriptions with synthetic bodies, not production Skill execution. Codex CLI temporary-home checks set all discovered entries disabled, but plugin controls and model-context exclusion remain unverified. Do not generalize these small samples into quality, billing or cross-host guarantees.

## Known limitations

- Current source is stdio-only: the HTTP MCP entry, remote adapter and distribution command were removed on 2026-10-29. Published v0.2.2 has CLI/stdio/Web/OpenCode entries and no HTTP MCP command; earlier v0.2.1 bytes remain unchanged. No public endpoint is deployed. Web REST remains separate. See [remote MCP](../ops/REMOTE_MCP.md).

- `restore --apply` replaces destination contents; review the manifest, retain a separate copy and test in a sandbox. Directory/lock and catalog/index changes are not one cross-package transaction.
- `route --include-body` is currently reserved; use explicit read/fetch tools.
- `hybrid` currently reports BM25 degradation; generic chat/embed providers are not automatically consumed by routing.
- Jev supports at most 254 Skill candidates in this adapter plus no-match; larger pools fall back to BM25. It sends queries/metadata remotely only when requested.
- Static audit is a bounded heuristic scan. `complete=false` and warnings need review; an audit does not authorize execution.
- The Web viewer is local, read-only, unauthenticated and uses a Markdown CDN with plain-text fallback.
- Usage is service-call observation, not unique tasks, execution or model adoption. Missing history is unknown; native host reads are invisible. Context tokens use a documented heuristic, not model tokenizers; actual model tokens/cost remain null. The Web usage/budget view adds fixed-denominator usage-rate sorting, time/source/category/status/text filters and global pagination. Existing Web processes need a restart to load the new API.
- Windows deployment, background updates, a standalone fork-copy command, automated overlay merge/dangling-base scan, and bulk cross-machine managed-lock relocation are not complete. Single-Skill same-content source migration is supported; it does not upgrade content or rewrite overlay relationships. Managed install/adopt can pin Git commits, record `overlayOf`, and rollback one Skill from a new source-lock snapshot. See the unified management guide.

## Validation commands

`pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm test`, `pnpm docs:check`, `pnpm smoke`, `pnpm eval:check`.

CI runs Node 20/22 on Linux and Node 22 on macOS without private catalog data or paid-model keys. Live scripts require an explicitly selected host/provider and can incur charges. Tests and smoke checks are the reproducible public evidence; private local output paths in historical logs are not downloadable artifacts.
