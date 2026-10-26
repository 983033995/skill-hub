# Changelog

## 0.2.1 (2026-10-26)

- Automate stable tag releases through GitHub Actions/npm OIDC after full CI, tag/main ancestry checks, exact package acceptance and official registry integrity/install verification.
- Bypass stale mirror metadata when accepting newly published registry packages; leave personal npm config untouched.

## 0.2.0 (2026-10-26)

### Project review and public documentation (2026-10-26)

- Refresh the bilingual README with a safe isolated quick start, real synthetic-data screenshots, MCP setup, managed-update plans and usage/context visibility.
- Audit the completion matrix and refresh operating procedures, data models, user scenarios and handoff. Keep paid evaluation, host-level acceptance and remote MCP gaps explicit; distinguish current capabilities from historical plans.
- Integrate pending work on the latest protected-main baseline without reverting its Vitest/Actions upgrades. Keep private source notes and runtime outputs out of the public delivery.


### Web usage-rate and context-budget view (2026-10-26)

- Add a read-only usage/budget page with time, origin, category, text and observation-state filters; sort by usage rate, last read, body token estimate or name before pagination.
- Keep the rate denominator fixed across UI filters within the selected time/origin/current catalog. Distinguish unobserved data, missing samples, partial logs and unavailable budgets; default to MCP rather than mixing Web browsing. No usage recording is enabled automatically.

### Local usage and context estimates (2026-10-26)

- Add opt-in local search/read observation with CLI/MCP/Web/library attribution, separate body first-page/continuation and attachment counts, and read-only `usage` reports. Queries, bodies and attachment paths are not logged; recording stays disabled unless a process explicitly sets `SKILL_HUB_USAGE_LOG`.
- Add `context-cost` reports for metadata, complete SKILL.md and configurable initial-page size. Character/byte counts and a documented heuristic remain distinct from actual model tokens or billing; inspection does not record itself as usage. See ADR 0012.

### Explicit source migration (2026-10-26)

- Add single-Skill `migrate-source --source ...` preview/apply with a separate version-bound token. Require installed, canonical and new-source trees to match; preserve local edits by rejecting migration rather than adopting them as a clean baseline.
- Preserve the canonical directory, back up its previous source lock for existing rollback, and recheck source/lock drift before commit. Update checks report the recorded source and a remediation hint without guessing an upstream.

### Managed update safety (2026-10-25)

- Add metadata-only file/directory/mode diffs and deterministic version-bound `planToken` to managed update previews.
- **Breaking v0.x write-interface change:** update apply now requires the matching `--plan-token` (or core `planToken`) plus the existing confirmation gates. Local/upstream/selected-source/target drift rejects the old plan; install/adopt/rollback retain their existing flow. See ADR 0011 and the unified management guide.
- Retain strict staging/backup/rollback and detect non-cooperating lock edits before commit; process-crash recovery is not newly guaranteed.

### Dependency updates (2026-10-09)

- Merge MCP SDK1.32.1 and pinned checkout7.0.1 / pnpm-action6.1.0 / setup-node7.0.0 after updated-head CI; retain Node20/22 project matrix.
- Keep the failing grouped major development-toolchain upgrade unmerged.
- Document that remote MCP requires a future authenticated Streamable HTTP service; current stdio/Web REST do not provide it.


### Added

- Managed local/public GitHub installation, adoption and updates with source locks, full-tree hashes and local-edit protection.
- Scope/provenance, persistent BM25 freshness checks and explain/path/history diagnostics.
- Read-only progressive Skill and attachment access over CLI/MCP and a local Web viewer.
- Taxonomy rules and optional model-provider/status infrastructure.
- Opt-in TypeSafe/Jev Choice routing with confidence, selected probability, advice and BM25 fallback.
- Static risk audit and CLI/MCP/HTTP regression fixtures.
- Opt-in isolated OpenCode launcher and live acceptance scripts.
- Public-source documentation, MIT license, contribution/security policies, GitHub issue/PR templates, CI and Dependabot configuration.

### Fixed

- Explicit empty TypeSafe keys no longer inherit environment credentials; candidate-build failures fall back to BM25.
- Nested Web attachment paths are not duplicated; audit reports omit source lines and mark incomplete scans.
- MCP routing instruction regression expectations match task-content discovery.

This repository is distributed from source at v0.1.0. No npm publication or downloadable host configuration is promised by this changelog.

### Streamable HTTP (unreleased; next minor release)

- Add an independently started, stateless POST/SSE MCP entry with shared read-only handlers; existing stdio full/runtime behavior remains compatible.
- Require Bearer authentication and Host/Origin validation; limit body/concurrency/deadlines, clean up disconnected requests, and expose only three runtime tools with server path diagnostics removed.
- Add real SDK HTTP fixture acceptance and hosting guidance. Public deployment, OAuth, npm publication and host-app compatibility remain separate acceptance work.

### npm distribution candidate

- Generate a standalone command tarball with explicit production files and local internal module mappings; source workspaces stay private. No install hooks or internal registry packages are required.
- Add actual npm installation/exec and CLI/MCP/Web acceptance to CI; align source/protocol versions to 0.2.0 while registry publication remains pending.
- Fix installed HTTP bin symlink startup and CLI bundled-template lookup.
