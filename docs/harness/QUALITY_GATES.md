# Quality gates

Status: Active · Updated: 2026-10-26 · Aligned with HARNESS §6

| Gate                               | Command/evidence                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Type checking                      | pnpm typecheck                                                                                  |
| Build                              | pnpm build                                                                                      |
| Lint                               | pnpm lint                                                                                       |
| Unit/integration                   | pnpm test                                                                                       |
| Router evaluation dataset contract | pnpm eval:check；v1 固定 50 条及 30/15/5 类别配比，其他分布需新 contract version；校验结构和常见敏感串，不设置 draft 标签质量阈值 |
| Local Markdown links               | pnpm docs:check                                                                                 |
| Compiled sandbox lifecycle/MCP     | pnpm smoke                                                                                      |
| Privacy/licensing                  | Review staged files and historical secret-pattern results; no credentials/private Skill library |
| Behavior/docs                      | Current API/STATUS/ADR/PRD match implementation                                                 |

`pnpm eval:check` validates the checked-in v1 generic router dataset's exact 50-task composition (30 required, 15 none, 5 ambiguous) and common secret/path patterns; it does not certify semantic anonymity or label quality. It does not threshold draft Recall/accuracy. `pnpm eval:router -- <catalog.json> [report.json]` is an explicit-catalog, offline BM25 comparison with build/query latency observations. It never loads the default user Hub; the optional report contains queries and Skill names, so keep it local when the catalog is private. `pnpm eval:router:jev -- --preview ...` builds the same Choice payloads as live routing, but does not read API keys, call the network, or write live reports. Preview stdout is summary-only; full query/candidate metadata is written only to an explicit `--preview-out` private file. The online runner compares Jev against local BM25 on the same explicit catalog and deterministic round-robin subset, and records dataset/selected/evaluated counts by task kind; low request limits change class proportions, and subset metrics are not population estimates. It rejects selected-task labels missing from the explicit catalog locally before checking the API key or making any request. The runner is live and billable only after explicit catalog/model/max-request, billing and metadata-upload consent plus `TYPESAFE_API_KEY`; it targets the fixed official TypeSafe endpoint, ignores `TYPESAFE_API_URL`, and stops without retry on the first failed request, where actual cost may be unknown. Any USD estimate additionally requires explicit token rates. Its escalation recommendation rate is the model flag rate, not observed human actions. This runner is excluded from public CI.

CI uses synthetic fixtures and temp directories; localhost HTTP tests need port access. Live model/host scripts are opt-in, not offline PR gates. RTK is optional outside the maintainer's shell. Format only the touched files unless a formatting change is explicitly scoped.

Publishing requires a real remote commit, public visibility confirmation and actual Actions outcomes. An unrun remote check cannot be called green. See [CONTRIBUTING](../../CONTRIBUTING.md), [SECURITY](../../SECURITY.md) and [release checklist](../templates/RELEASE_CHECKLIST.md).
