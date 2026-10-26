# Handoff / cross-session entry

Status: Active · Updated: 2026-10-26 · Source/npm candidate: 0.2.0 published; 0.2.1 automated-release preparation

Read HARNESS, AGENTS, [STATUS](STATUS.md), [completion review](COMPLETION_REVIEW_20261026.md), [API](../architecture/API.md) and TASK_BOARD. PROGRESS is append-only historical evidence, not a current feature checklist.

## Implemented baseline

- Canonical/external scoped Skill metadata, local BM25, progressive CLI/MCP text and attachment access.
- Managed local/public GitHub install/adopt, exact commit locks, partial read-only checks, version-bound update diffs/tokens, backup rollback and same-content source migration.
- Optional full/runtime MCP profiles, explicit manifest export, static audit, compatibility backup/sync/verify/restore.
- Local Web library/detail/inventory and usage-rate/context-budget views; explicit local observation, unknown and incomplete states preserved.
- Ten built-in user-level source presets, separate from sync targets and application/MCP health.
- Offline dataset contract/payload tooling; opt-in live Jev evaluator remains distinct from calibrated quality evidence.

## Remaining work and permissions

P11-05 needs Owner-reviewed labels, an explicit catalog and explicit paid-request/metadata-upload authorization. WorkBuddy/Qoder model/GUI acceptance remains separate from config and MCP evidence. Remote MCP now has a locally tested Streamable HTTP source entry (P26); actual hosting, OAuth and host-app acceptance remain pending. Write-capable Web management, background upgrades, portable whole-lock relocation and host-wide guaranteed savings are not complete.

Do not rerun paid jobs or change personal hosts because a script exists. No production Skill upgrades, directory/config changes, service restarts or metadata uploads are authorized by this handoff alone.

## Continue safely

1. Inspect git status, current branch and actual upstream state; preserve dirty worktrees.
2. Select a bounded board item or the user's explicit scope. Use fixtures and isolated Hub/agent roots.
3. Re-read touched code; keep core/router/sync/adapter boundaries.
4. Run repository gates in CONTRIBUTING. Current Vitest/Action versions come from package/lock/workflow, not old logs.
5. Update live docs and append PROGRESS. New source or build output does not update already-running processes.
6. If publishing is authorized, inspect the exact diff and secret/artifact scope, push a PR, wait for required checks and merge without bypassing protection. Remote receipt lives on GitHub; local test success is not a CI result.

The maintainer's private catalogs, deployed configurations, global wrappers and acceptance artifacts are not part of the public repository.
