# npm distribution and GitHub Actions publishing

Status: 0.2.2 release candidate; latest verified registry version 0.2.1 · Updated: 2026-10-29

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

Local acceptance uses only synthetic Skills and an isolated Hub. It verifies CLI version, actual npm exec, template/profile lookup from another cwd, local install/route/read, stdio SDK initialization and pagination/hash, absence of the HTTP bin/source from the current candidate, shipped Web HTML, and the installed OpenCode launcher with a fake native binary and explicit Hub/config/profile/usage forwarding. It contacts the public npm registry to install dependencies, but calls no model API and records no personal usage.

## Use a local tarball

```bash
npm install --prefix ./hub-trial /absolute/path/to/zhangheteng-skill-hub-0.2.2.tgz
npm exec --offline --prefix ./hub-trial -- skill-hub version --json
```

Current-source commands: `skill-hub`, `skill-hub-mcp`, `skill-hub-web`, `skill-hub-opencode`. HTTP was withdrawn on 2026-10-29; existing v0.2.1 registry bytes remain unchanged. See the [package README](NPM_PACKAGE_README.md) and [transport boundary](REMOTE_MCP.md). Node >=20 and macOS/Linux are the intended baseline; Windows bin-shim/process acceptance remains unverified.

## Actual registry publication

After login and browser MFA, npm rejected the unscoped name `skill-hub` with E403 because it is too similar to `skillhub`. The distribution now uses the logged-in owner scope `@zhangheteng/skill-hub`. No version was uploaded by that rejected request. Registry publication and acceptance are recorded separately below.

Before uploading, establish a valid npm identity without putting tokens in chat/repo/logs, verify the chosen package name/scope and version, and inspect the exact tested tarball/content report. Publish that tarball explicitly with public access and the intended registry; never publish the private repository root or silently repack a different artifact. Handle any required two-factor authentication through npm's own flow.

After publishing, run `pnpm check:npm --registry <absolute-tested-acceptance.json>`. It queries the registry for the exact name/version, compares `dist.integrity` to the tested tarball, installs that exact registry version into a fresh prefix, and repeats command/MCP acceptance without repacking. Only then report the npm URL/version as published. A tarball, local installation or Git commit is not publication evidence.

No long-lived npm credential, paid hosting or public endpoint is created. Current source no longer provides HTTP MCP hosting; npm only distributes the local CLI/stdio/Web program.

## GitHub Actions trusted publishing

The `publish-npm.yml` workflow runs on version-tag pushes (`v*`). Manual dispatch performs checks and dry-run only. It reuses all three existing CI matrix entries, builds/accepts one exact tarball under Node24 and pinned npm11.19.0, then publishes only when the tag equals the package version and HEAD is an ancestor of origin/main in the official repository. The publish job alone has id-token write; no NPM_TOKEN is configured. Workflow actions use full-SHA pins. Outputs retain tarball, integrity and acceptance receipts as Actions artifacts.

The trusted publisher on npm must match exactly: GitHub owner `983033995`, repository `skill-hub`, filename `publish-npm.yml`, direct publish allowed. Configure it with `npm trust github @zhangheteng/skill-hub --file publish-npm.yml --repo 983033995/skill-hub --allow-publish --yes` using an authenticated npm session; account MFA may be required. Read back the trust record. Configuration alone is not proof of an OIDC publish; new npm trust records expire unless first used successfully within two days.

For each later release: update the root/workspace/protocol versions and release notes in a PR, pass CI, merge into main, then create/push the matching stable version tag. Never move an existing release tag or reuse an npm version. Tag pushes trigger publishing; plain main pushes do not. Already-published versions are accepted only when the registry integrity exactly matches the built tarball; otherwise the job fails and requires a version bump.

The release job directly reads official version metadata and downloads its registered tarball, verifies bytes against the tested integrity, then installs in a fresh prefix and repeats CLI/MCP/Web acceptance. This avoids stale mirror metadata for a newly created package and does not modify personal npm configuration. npm installs of public dependencies may still contact the registry. If a publish response is uncertain, inspect the registry first; do not blindly retry or bump the version.

Trusted publishing adds npm provenance for this public repository/package. The initial 0.2.0 was published manually and does not claim Action provenance. A broken later version is repaired by a new version; automatic unpublish or dist-tag rollback is not configured. Restricting existing npm tokens/account settings is a separate operation and is not changed by this workflow.

## Verified release evidence

- Package: [@zhangheteng/skill-hub 0.2.1](https://www.npmjs.com/package/@zhangheteng/skill-hub/v/0.2.1); tag `v0.2.1` at `12d023177b73b5af20d1a9b765081b55a2f193c4`.
- [Action run](https://github.com/983033995/skill-hub/actions/runs/40319985700): three CI matrices, OIDC publication and registry acceptance. The first attempt published successfully but hit a short registry-visibility 404 during verification; retry checks the already-published integrity and skips duplicate upload.
- Registry integrity: `sha512-PCF++fVXN2Dyr6Os3z0zaw3xm82JYoitNbWFbMuLZiZUHutsKaUzyEV5X9BCrcByyaOlUrHIE2RFSaVk7b04kg==`, 93 files / 144431 bytes. This is the accepted Action artifact, not an assertion that a different local toolchain produces identical tar bytes.
- npm's SLSA provenance identifies the public GitHub repository, `.github/workflows/publish-npm.yml`, `refs/tags/v0.2.1`, the source commit above, and Action attempt 1. No long-lived npm token is installed in GitHub.

Registry verification waits up to twelve bounded attempts with 15-second spacing for newly published metadata. Action artifact replacement is allowed on reruns; prior source tags and published npm versions are never moved or overwritten.
