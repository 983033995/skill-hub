# Handoff / cross-session entry

Status: Active · Updated: 2026-10-09

Read `HARNESS.md`, `AGENTS.md`, [STATUS](STATUS.md), the current [API](../architecture/API.md) and the task board before implementing changes. The original Phase-1 handoff is obsolete; the project now includes managed lifecycle, MCP progressive reads, Web, taxonomy and optional Jev.

Next priorities: portable manifest, managed pin/rollback/overlay, labeled router evaluation and remaining WorkBuddy/Qoder model-level regression. Do not treat previous configuration/MCP checks as GUI acceptance.

Use an isolated Hub and synthetic fixtures for validation. The development machine's global wrappers and personal agent settings are outside the repository. Keep local artifacts under ignored `outputs/`, never commit a personal Skill library or credentials. Read [CONTRIBUTING](../../CONTRIBUTING.md) for the full local checks.
