# WorkBuddy through Skill Hub

Status: configuration/MCP checks recorded; application model-level regression pending.
Updated: 2026-10-09

## Host-specific configuration

The installed WorkBuddy runtime inspected during development supports `skillOverrides[name] = "off"` and a native `Skill` deny rule. WorkBuddy uses its own `mcp.json` `mcpServers` configuration. Back up your settings, use exact Skill names from your installation, preserve provider/other MCP entries, and configure Node plus the absolute built Hub MCP path from [MCP_INTEGRATION](MCP_INTEGRATION.md).

Task-content search/fetch/files/read guidance can be appended to an existing custom prompt. Do not replace other custom guidance or delete Skill files just to disable their loader. New Skills may require new off entries; project settings and built-in plugin policy can differ.

## What was actually verified

A developer installation had 149 user-Skill records (147 names). Off entries and a native deny setting were written after backup; unrelated settings and custom-prompt prefix were preserved. The exact MCP command connected with 11 tools/110 catalog entries and returned a Chinese search and full rewrite-Skill body.

This was **not** WorkBuddy GUI/model acceptance. A running task was not interrupted, and UI automation could not complete a new-session test. The application protects some built-in Skills and may remove disable overrides. It is not equivalent to OpenCode's recorded zero disk discovery.

## Apply/recover

Use the host's supported settings UI/configuration for your installed version, review a preview of changed keys, and save a private backup outside Git. Once running work completes, restart WorkBuddy and create a new conversation to verify search/fetch tool traces and native-tool denial.

Restore only this adapter's changed keys or compare with the original backup before replacing files, so later model/MCP changes are not lost. This repository does not contain a user's settings, credentials or personal backup.
