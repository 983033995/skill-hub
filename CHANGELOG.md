# Changelog

## Unreleased

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
