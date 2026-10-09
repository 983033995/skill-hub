# Public repository configuration

Status: Active · Verified: 2026-10-09

Repository: [983033995/skill-hub](https://github.com/983033995/skill-hub), public source distribution v0.1.0 under MIT. This is not an npm release; root/workspaces keep private=true to prevent accidental package publishing.

## Community and workflow

- English/Chinese README, current STATUS, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, NOTICE and CHANGELOG.
- Issue forms, PR template, CODEOWNERS, weekly dependency/Action update PRs and release-note categories.
- CI: Linux Node20/22 and macOS Node22, frozen lockfile, full-SHA actions, read-only workflow permission and no model credentials.
- Local Markdown-link and compiled sandbox smoke checks are part of CI.

## Repository settings verified through GitHub

- Public visibility, MIT detection, Issues enabled, wiki/projects disabled, topics and description set.
- Squash merge supported and merged head branches removed; other existing merge methods retained.
- Private vulnerability reporting, vulnerability alerts and automated security fixes enabled.
- Secret scanning and push protection enabled. Non-provider pattern/validity scanning are not claimed as enabled.
- Actions default workflow permission read; workflows cannot approve pull requests.
- main-integrity ruleset prevents branch deletion/non-fast-forward and requires the three CI contexts. Repository administrators retain an explicit emergency bypass; this is not a no-bypass protected workflow.

The initial public code commit `ddc75c8` completed all three matrices: [CI evidence](https://github.com/983033995/skill-hub/actions/runs/37926838060). Inspect the latest branch checks for subsequent commits. Community profile was 100% at verification; this indicator is not a software-quality or security guarantee.

## Publication boundaries

Personal catalogs, installed Skills, credentials, deployed host settings, node_modules, build outputs, backups, code indexes and local acceptance reports are excluded. Current docs use portable examples. Existing Git history was retained; common credential-pattern scans returned zero matches before publication, which does not prove absence of every possible secret.

Before a future release: re-run all local gates, inspect staged content, verify CI on the exact commit, review third-party licenses and write a scoped changelog. Do not treat a source commit as published npm/artifacts or silently merge automated updates.
