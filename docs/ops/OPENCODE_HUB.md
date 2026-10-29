# OpenCode through Skill Hub

Status: Active · Updated: 2026-10-29

The npm package includes `skill-hub-opencode`, an opt-in launcher for OpenCode with a packaged Hub MCP configuration and profile templates. It does not require a source checkout or build. Version 0.2.2 is this round's npm candidate; check the registry before installing it.

## Install and launch

```bash
npm install --global @zhangheteng/skill-hub@0.2.2
skill-hub-opencode --model your-provider/your-model
```

Or run the launcher at a pinned version without a global install:

```bash
npm exec --yes --package=@zhangheteng/skill-hub@0.2.2 -- skill-hub-opencode --model your-provider/your-model
```

By default, the launcher uses the Hub at `~/.skill-hub` and reads provider/model configuration from OpenCode's existing JSON config. It generates an isolated profile with the packaged Hub MCP server and profile templates. Options:

```bash
skill-hub-opencode --provider-config /absolute/path/to/providers.json --hub-home /absolute/path/to/hub --model your-provider/your-model
```

The provider config must be pure JSON; the launcher does not parse JSONC. It imports provider/model settings only, not the existing file's MCP servers, plugins, or Skill paths. Keep credentials in their normal local configuration and do not copy them into project files.

## Isolation behavior

This is an explicit launch path. The generated profile isolates `XDG_CONFIG_HOME` and `OPENCODE_CONFIG_DIR`, disables project/default external plugins and native disk Skill discovery for that launched process, and configures the Hub MCP server. It does not delete native Skill files, rewrite the usual OpenCode settings, replace the ordinary `opencode` command, or change other agent hosts. Project-specific plugins and MCP settings are not inherited by this isolated session.

The MCP profile is `full` by default. Set `SKILL_HUB_MCP_MODE=runtime` or pass `--mcp-mode runtime` for the three-tool profile. Usage recording remains off by default. If explicitly enabled with `SKILL_HUB_USAGE_LOG=/absolute/path/to/usage.jsonl`, the launcher forwards it to its MCP process. Those records describe Hub requests; they cannot identify client use, model adoption, or task success. See [MCP integration](MCP_INTEGRATION.md) and [usage definitions](USAGE_AND_CONTEXT.md).

## Recorded acceptance

Historical local checks on OpenCode 1.18.31/1.18.34 covered eight scenarios: exact Skill reads and attachments, task-based discovery, browsing, paging, errors, update/new session behavior, and a Chinese rewrite example. A local catalog was compared over stdio MCP against disk contents and hashes.

These results are host-specific historical evidence. They do not promise compatibility with every OpenCode version and do not prove that npm candidate 0.2.2 has passed registry installation or package-level acceptance. Public offline CI uses synthetic fixtures; rerun host checks after upgrading OpenCode.

## Repository development checks

These commands are for contributors working from a source checkout, not required for npm users:

```bash
pnpm build
pnpm opencode -- --model your-provider/your-model
```

The source repository does not change the ordinary `opencode` command. If you choose to create a global wrapper yourself, point `OPENCODE_NATIVE_BIN` to the absolute original OpenCode executable to avoid recursion. Exit the isolated session and invoke the original executable to return to native behavior.
