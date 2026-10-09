# Contributing to Skill Hub

English or Chinese issues and pull requests are welcome. Please read [HARNESS](HARNESS.md) and the applicable [AGENTS](AGENTS.md) guidance before changing behavior.

## Set up

Use Node.js 20+ and pnpm 10.27.0. Clone your fork, run `pnpm install --frozen-lockfile`, then `pnpm build`. RTK is optional; it is not required in CI or for contributors.

## Scope a change

Open a bug report or feature request first for architecture changes, new host adapters or dependencies. Small fixes can go directly to a PR. Use synthetic fixture Skills and isolated `SKILL_HUB_HOME` directories. Never write a contributor's real agent configuration from an automated test.

Keep the existing core/router/sync/CLI/MCP boundaries. New public behavior needs API documentation; architectural decisions go in `docs/adr/`. Record work in the task board and progress log. Do not submit generated `dist/`, `outputs/`, local indexes, private host configs or installed Skill libraries.

## Verify

```bash
pnpm typecheck
pnpm build
pnpm lint
pnpm test
pnpm docs:check
pnpm smoke
```

Tests are offline except localhost HTTP integration checks. Live OpenCode/Jev evaluation is opt-in and is not a condition for every PR. Report what you actually ran and any limitations. A port-restricted sandbox may require permitting localhost listeners; do not skip those tests to claim a pass.

## Submit

Branch names are descriptive (`codex/…`, `feat/…`, `fix/…` or `docs/…`). Commits use Conventional Commits, for example `fix(router): preserve explicit no-match results`. PRs should state the problem, changed behavior, validation and rollback implications; use the repository PR template.

Contributions are licensed under the [MIT license](LICENSE). Only contribute material you have permission to license; third-party Skills are not included in the license of this manager. Report vulnerabilities privately as described in [SECURITY](SECURITY.md).
