# Qoder App through Skill Hub

Status: configuration/runtime initialization checks recorded; model/GUI regression pending.
Updated: 2026-10-09

This guide concerns Qoder App's user configuration, not QoderWork/QoderWork CN or Qoder IDE. Adapters must be checked separately.

## Native Skill support and MCP

The installed Qoder runtime 1.1.64 inspected during development declares:

```json
{
  "skills": {
    "enabled": false,
    "loadFromAgentsDirectory": false,
    "disableShellExecution": true
  }
}
```

`skills.enabled` requires a new runtime/restart. Back up settings first; merge these fields into existing `~/.qoder/settings.json`, preserving providers and business MCP entries. Configure `mcpServers.skill-hub` as described in [MCP_INTEGRATION](MCP_INTEGRATION.md), and append content-search/fetch/files/read guidance to global `AGENTS.md`.

Do not remove Skill files, modify application code, or claim native-tool removal merely because the Skill list is empty. Project settings may override user settings; verify each workspace's effective runtime.

## Recorded validation boundaries

| Check | Recorded outcome |
|-------|------------------|
| Configuration backup/hash and unrelated provider/17 other MCP entries | Preserved |
| Configured stdio MCP connection and Chinese search/read | Passed; 11 tools, 110 local catalog entries |
| Installed runtime new process initialization | `skills=[]`, Hub connected, 11 Hub tools |
| Real model rewrite without a Skill name | Failed before tool calls: `Not logged in · Please run /login` |
| GUI new task | Not verified; input/submit automation did not succeed |

The runtime still listed a native `Skill` tool name. Empty discovery is the measured fact; a successful model task was not observed. GUI login does not imply the independently executed CLI runtime is logged in. This project does not ship that login state or a user's model credentials.

## Verify and recover

After running tasks finish, open a new Qoder session. Check effective Skill discovery, Hub connection and actual task-content search/fetch calls. If using a standalone CLI, establish its login through the normal vendor flow; do not copy private authentication payloads into the repository.

Keep a private backup of settings and global instructions, then compare changed keys before reverting. Source checkout/CI tests cannot establish that the desktop host adopted the new settings.
