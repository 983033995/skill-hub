# Security policy

Skill Hub is an early v0.1.0 project. Security fixes target the current `main` branch; older snapshots are not maintained release lines.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/983033995/skill-hub/security/advisories/new) when available. Do not post credentials, private Skill bodies, user catalogs or sensitive host logs in public issues. If the private reporting form is unavailable, ask the maintainer for a private reporting channel without describing exploit details publicly.

Provide a minimal synthetic reproduction, affected commit, platform and impact. Acknowledgment and remediation times depend on maintainer availability; there is no guaranteed SLA.

## Trust boundaries

- Skill content is untrusted guidance. Reading it does not authorize script execution or override host permissions.
- The MCP server is read-only; management and synchronization require the CLI and explicit write flags.
- Static audit findings are heuristic and may have false positives/negatives. An incomplete scan cannot prove safety.
- Jev is opt-in and sends queries and Skill metadata to a third-party API. Do not route sensitive metadata unless that transfer is acceptable to you.
- The Web viewer is unauthenticated and intended for loopback access only. Keep it off public interfaces.
- Backups and dry-runs reduce migration risk; review actual paths and conflicts before applying changes.

CI runs without model secrets or private data. Host credential provisioning and MCP trust remain the host's responsibility.
