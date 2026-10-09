# OpenCode through Skill Hub

Status: Active · Updated: 2026-10-09

## Opt-in launch

```bash
pnpm build
pnpm opencode -- --model your-provider/your-model
```

The launcher imports only provider/model settings from your existing pure JSON OpenCode configuration. It supplies Hub MCP and instructions to search by task content when no Skill name is given, fetch exact names and read attachments progressively.

Options: `--provider-config /absolute/path/to/providers.json`, `--hub-home /absolute/path/to/hub`. Keep credentials outside this repository. JSONC is not parsed by the launcher; supply a pure JSON provider file.

The profile isolates `XDG_CONFIG_HOME` and `OPENCODE_CONFIG_DIR`, disables project/default external plugins and native disk Skill discovery, and denies the native Skill tool. An internal built-in Skill may remain in host inventory; verify disk discovery, permissions and real tool traces separately. This also means project-specific plugins/MCP settings are not inherited by this launch.

The source repository does not modify the ordinary `opencode` command. If you add a global wrapper yourself, set `OPENCODE_NATIVE_BIN` to the absolute original executable to avoid recursive launch. Exit the isolated session and run the original executable to return to native behavior.

## Recorded acceptance

On a developer machine with OpenCode 1.18.31/1.18.34 and MiniMax-M3, eight scenarios passed: exact fetch/attachment, task-content automatic discovery, search/fetch, browsing, tail paging, errors, update/new session and a real Chinese rewrite Skill. A local 110-entry catalog was also compared through stdio MCP with disk and hash.

These are historical local results, not a compatibility promise or published CI artifact. Outputs and private catalogs are excluded from Git. The public offline CI uses synthetic fixtures; re-run host checks after upgrading OpenCode.

## Reproduce intentionally

```bash
node scripts/accept-runtime.mjs
OPENCODE_DISABLE_MODELS_FETCH=true OPENCODE_DISABLE_AUTOUPDATE=true   node scripts/accept-opencode.mjs your-provider/your-model your-rewrite-skill
```

Live acceptance invokes your provider and can cost money. It uses a synthetic Hub for transport scenarios and optionally your real Hub for a rewrite example; the third argument should be a suitable rewrite Skill. It does not execute all Skill scripts. Reports under `outputs/` must be inspected for actual assertions and model errors.
