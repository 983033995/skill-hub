# Quality gates

Status: Active · Updated: 2026-10-09 · Aligned with HARNESS §6

| Gate | Command/evidence |
|------|------------------|
| Type checking | pnpm typecheck |
| Build | pnpm build |
| Lint | pnpm lint |
| Unit/integration | pnpm test |
| Local Markdown links | pnpm docs:check |
| Compiled sandbox lifecycle/MCP | pnpm smoke |
| Privacy/licensing | Review staged files and historical secret-pattern results; no credentials/private Skill library |
| Behavior/docs | Current API/STATUS/ADR/PRD match implementation |

CI uses synthetic fixtures and temp directories; localhost HTTP tests need port access. Live model/host scripts are opt-in, not offline PR gates. RTK is optional outside the maintainer's shell. Format only the touched files unless a formatting change is explicitly scoped.

Publishing requires a real remote commit, public visibility confirmation and actual Actions outcomes. An unrun remote check cannot be called green. See [CONTRIBUTING](../../CONTRIBUTING.md), [SECURITY](../../SECURITY.md) and [release checklist](../templates/RELEASE_CHECKLIST.md).
