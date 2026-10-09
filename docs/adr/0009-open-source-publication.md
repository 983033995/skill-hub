# ADR 0009 — Public source distribution and reproducible checks

Status: Accepted · Date: 2026-10-09

## Context

The owner explicitly requested GitHub publication and open-source community setup. Local host paths/acceptance artifacts were unsuitable as an installation guide; older README/Phase handoffs understated implemented behavior.

## Decision

1. License this repository's own code/documentation under MIT; installed third-party Skills keep their license. Root/workspaces retain private=true to prevent unintended npm publication.
2. Publish English and Chinese README, current STATUS, portable operations, CONTRIBUTING/SECURITY/CODE_OF_CONDUCT/NOTICE/CHANGELOG and discoverable GitHub issue/PR templates.
3. Keep personal catalogs, outputs, credentials, local indexes and deployed host settings excluded from Git. Preserve original local docs under ignored outputs; remove machine-specific names/paths from current public guides. Do not rewrite existing Git history.
4. Use frozen-lockfile CI with full-SHA pinned actions, read-only token permission, Linux Node20/22 and macOS Node22. Run offline tests, local-link checks and compiled synthetic sandbox smoke; no live model key is needed.
5. Verify repository SHA, public visibility and remote check outcomes before reporting them as completed. Protect main from deletion/force push, retain maintainer emergency bypass for this early solo project, and enable private vulnerability reporting where supported.

## Implications

Public visibility exposes the existing commit history. Pattern scans are evidence, not a proof of absence of every secret. Historical local validation outputs are not published artifacts. Host settings and built-in behavior stay version-specific.

The CI gate does not claim a labeled Jev benchmark, every-host compatibility or safe arbitrary Skill execution. Future release tags/npm artifacts require their own verified process.
