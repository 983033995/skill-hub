import path from "node:path";
import { describe, expect, it } from "vitest";
import { SkillHubError } from "./errors.js";
import {
  expandUserPath,
  getDefaultConfigPath,
  getDefaultHubHome,
  hubLayout,
  isPathInside,
  normalizeSkillName,
  resolveAbsolutePath,
} from "./paths.js";

const FAKE_HOME = "/Users/tester";

describe("expandUserPath / resolveAbsolutePath", () => {
  it("expands ~ and ~/...", () => {
    expect(expandUserPath("~", FAKE_HOME)).toBe(path.resolve(FAKE_HOME));
    expect(expandUserPath("~/skills", FAKE_HOME)).toBe(path.resolve(FAKE_HOME, "skills"));
  });

  it("rejects empty path", () => {
    expect(() => expandUserPath("  ")).toThrow(SkillHubError);
    try {
      expandUserPath("");
    } catch (e) {
      expect(e).toBeInstanceOf(SkillHubError);
      expect((e as SkillHubError).code).toBe("E_PATH");
    }
  });

  it("resolves relative against cwd", () => {
    const abs = resolveAbsolutePath("foo/bar", { cwd: "/tmp/proj", home: FAKE_HOME });
    expect(abs).toBe(path.resolve("/tmp/proj", "foo/bar"));
  });
});

describe("hub home helpers", () => {
  it("uses SKILL_HUB_HOME override", () => {
    const home = getDefaultHubHome({ SKILL_HUB_HOME: "~/custom-hub" } as NodeJS.ProcessEnv);
    // expand uses real homedir for ~ unless we only pass override without expand home inject
    // SKILL_HUB_HOME uses expandUserPath which uses real homedir — acceptable.
    expect(home.endsWith(`${path.sep}custom-hub`) || home.includes("custom-hub")).toBe(true);
  });

  it("builds layout under hub root", () => {
    const layout = hubLayout("/tmp/skill-hub-test");
    expect(layout.skills).toBe(path.resolve("/tmp/skill-hub-test/skills"));
    expect(layout.catalog).toBe(path.resolve("/tmp/skill-hub-test/catalog.json"));
    expect(layout.config).toBe(path.resolve("/tmp/skill-hub-test/config.yaml"));
  });

  it("honors SKILL_HUB_CONFIG", () => {
    const p = getDefaultConfigPath({
      SKILL_HUB_CONFIG: "/etc/skill-hub.yaml",
    } as NodeJS.ProcessEnv);
    expect(p).toBe(path.resolve("/etc/skill-hub.yaml"));
  });
});

describe("normalizeSkillName", () => {
  it("normalizes spaces and case", () => {
    expect(normalizeSkillName("  Frontend Design ")).toBe("frontend-design");
    expect(normalizeSkillName("PDF_Tools")).toBe("pdf-tools");
  });

  it("strips illegal characters", () => {
    expect(normalizeSkillName("foo@bar!")).toBe("foobar");
  });

  it("throws E_PARSE on empty result", () => {
    expect(() => normalizeSkillName("@@@")).toThrow(SkillHubError);
    try {
      normalizeSkillName("   ");
    } catch (e) {
      expect((e as SkillHubError).code).toBe("E_PARSE");
    }
  });
});

describe("isPathInside", () => {
  it("detects nested paths", () => {
    expect(isPathInside("/tmp/hub/skills/pdf", "/tmp/hub")).toBe(true);
    expect(isPathInside("/tmp/other", "/tmp/hub")).toBe(false);
  });
});
