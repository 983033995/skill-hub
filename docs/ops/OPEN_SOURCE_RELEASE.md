# Public repository configuration

Status: Active · Reviewed: 2026-10-26

Repository: [983033995/skill-hub](https://github.com/983033995/skill-hub), public source distribution under MIT, with @zhangheteng/skill-hub@0.2.1 published through GitHub Actions OIDC and provenance verified; root/workspaces retain private=true. The separately generated command package follows [npm distribution](NPM_DISTRIBUTION.md) and ADR0014.

## Community and workflow

- English/Chinese README, current STATUS, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, NOTICE and CHANGELOG.
- Issue forms, PR template, CODEOWNERS, weekly dependency/Action update PRs and release-note categories.
- CI: Linux Node20/22 and macOS Node22, frozen lockfile, full-SHA actions, read-only workflow permission and no model credentials.
- Dataset structure/privacy-pattern, local Markdown-link and compiled sandbox smoke checks are part of CI.

## Repository settings verified through GitHub

- Public visibility, MIT detection, Issues enabled, wiki/projects disabled, topics and description set.
- Squash merge supported and merged head branches removed; other existing merge methods retained.
- Private vulnerability reporting, vulnerability alerts and automated security fixes enabled.
- Secret scanning and push protection enabled. Non-provider pattern/validity scanning are not claimed as enabled.
- Actions default workflow permission read; workflows cannot approve pull requests.
- main-integrity ruleset requires pull requests to `main`, prevents branch deletion/non-fast-forward, requires the three CI contexts, and resolves review conversations before merge. It requires zero approvals to support the single-maintainer workflow. The existing emergency bypass remains; this is not a no-bypass protected workflow.

The initial public code commit `ddc75c8` completed all three matrices: [CI evidence](https://github.com/983033995/skill-hub/actions/runs/37926838060). Inspect the latest branch checks for subsequent commits. Community profile was 100% at verification; this indicator is not a software-quality or security guarantee.

## Publication boundaries

Personal catalogs, installed Skills, credentials, deployed host settings, node_modules, build outputs, backups, code indexes and local acceptance reports are excluded. Current docs use portable examples. Existing Git history was retained; common credential-pattern scans returned zero matches before publication, which does not prove absence of every possible secret.

Before a future release: re-run all local gates, inspect staged content, verify CI on the exact commit, review third-party licenses and write a scoped changelog. Do not treat a source commit as published npm/artifacts or silently merge automated updates.

The 2026-10-26 refresh integrates the managed-update/source-migration, usage/context Web and source-discovery work. Public README screenshots use synthetic Skills and observations; local source paths are hidden during capture. Existing host-specific source logs remain historical evidence, not general compatibility promises. Publication must still be confirmed on the actual PR and main Actions checks.
