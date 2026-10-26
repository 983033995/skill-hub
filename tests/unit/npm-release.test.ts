import { describe, expect, it } from "vitest";
import { validateNpmRelease } from "../../scripts/publish-npm.mjs";

const manifest = { name: "@zhangheteng/skill-hub", version: "0.2.1" };
const officialTag = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "983033995/skill-hub",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/tags/v0.2.1",
  ACTIONS_ID_TOKEN_REQUEST_URL: "https://example.invalid/oidc",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "synthetic-oidc-test-only",
};

describe("npm publication authorization boundaries", () => {
  it("permits local dry-runs but requires the official matching tag and OIDC for a write", () => {
    expect(() => validateNpmRelease(manifest, {}, false)).not.toThrow();
    expect(() => validateNpmRelease(manifest, officialTag, true)).not.toThrow();
    for (const override of [
      { GITHUB_ACTIONS: "false" },
      { GITHUB_REPOSITORY: "someone/fork" },
      { GITHUB_EVENT_NAME: "pull_request" },
      { GITHUB_EVENT_NAME: "workflow_dispatch" },
      { GITHUB_REF: "refs/heads/main" },
      { GITHUB_REF: "refs/tags/v0.2.0" },
      { ACTIONS_ID_TOKEN_REQUEST_TOKEN: "" },
    ])
      expect(() => validateNpmRelease(manifest, { ...officialTag, ...override }, true)).toThrow();
  });
  it("rejects an unrelated package, malformed tags and prerelease versions", () => {
    expect(() => validateNpmRelease({ ...manifest, name: "other" }, officialTag, false)).toThrow();
    for (const version of ["01.2.1", "0.2.1-beta.1", "v0.2.1", "0.2"]) {
      expect(() => validateNpmRelease({ ...manifest, version }, {}, false)).toThrow();
    }
  });
});
