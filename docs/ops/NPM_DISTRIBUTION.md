# npm distribution candidate

Status: 0.2.0 candidate · Registry publication pending · Updated: 2026-10-26

The source root and all workspaces remain `private: true`. Packaging creates a separate installable command package; it does not change npm credentials or upload anything. See [ADR 0014](../adr/0014-single-npm-distribution.md).

## Build and inspect

```bash
pnpm install --frozen-lockfile
pnpm pack:npm
# Optional, after selecting an owned package name:
pnpm pack:npm --name @your-scope/skill-hub
pnpm check:npm
```

`pack:npm` builds and emits one JSON result containing the tarball's absolute path, integrity, size and `published: false`. The generated `outputs/npm-*/` directory retains the staged package and `pack-report.json` with the actual npm pack contents. `check:npm` builds its own candidate, installs it into a fresh local prefix and writes `acceptance.json` alongside that exact tarball. It does not clean previous candidate directories or replace personal files.

Only compiled JS corresponding to current production source files, Web assets, five explicit configuration templates, README/license/NOTICE and the generated manifest enter the package. Package imports resolve internal modules locally, so no `@skill-hub/*` registry package is needed. There are no install hooks, source maps, dev dependencies or personal Skills in this artifact. The existing SDK remains an external npm dependency; npm resolves its transitive dependencies at install time.

Local acceptance uses only synthetic Skills and an isolated Hub. It verifies CLI version, actual npm exec, template/profile lookup from another cwd, local install/route/read, stdio SDK initialization and pagination/hash, the installed HTTP bin symlink with authentication, and shipped Web HTML. It contacts the public npm registry to install dependencies, but calls no model API and records no personal usage.

## Use a local tarball

```bash
npm install --prefix ./hub-trial /absolute/path/to/zhangheteng-skill-hub-0.2.0.tgz
npm exec --offline --prefix ./hub-trial -- skill-hub version --json
```

Commands: `skill-hub`, `skill-hub-mcp`, `skill-hub-mcp-http`, `skill-hub-web`. See the [package README](NPM_PACKAGE_README.md) and [HTTP hosting guide](REMOTE_MCP.md). Node >=20 and macOS/Linux are the intended baseline; Windows bin-shim/process acceptance remains unverified.

## Actual registry publication

After login and browser MFA, npm rejected the unscoped name `skill-hub` with E403 because it is too similar to `skillhub`. The distribution now uses the logged-in owner scope `@zhangheteng/skill-hub`. No version was uploaded by that rejected request. Registry publication and acceptance are recorded separately below.

Before uploading, establish a valid npm identity without putting tokens in chat/repo/logs, verify the chosen package name/scope and version, and inspect the exact tested tarball/content report. Publish that tarball explicitly with public access and the intended registry; never publish the private repository root or silently repack a different artifact. Handle any required two-factor authentication through npm's own flow.

After publishing, run `pnpm check:npm --registry <absolute-tested-acceptance.json>`. It queries the registry for the exact name/version, compares `dist.integrity` to the tested tarball, installs that exact registry version into a fresh prefix, and repeats command/MCP acceptance without repacking. Only then report the npm URL/version as published. A tarball, local installation or Git commit is not publication evidence.

No automatic publish workflow, credentials, paid hosting or public endpoint is created. HTTP hosting requires a separate selected host with HTTPS and persistent authorized Skill storage; npm only distributes the program.
