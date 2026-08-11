import { describe, expect, it } from "vitest";
import {
  SKILL_HUB_VERSION,
  SkillHubError,
  createLogger,
  expandUserPath,
  normalizeSkillName,
  ok,
  sharedPlaceholder,
} from "./index.js";

describe("@skill-hub/shared public surface", () => {
  it("exports version", () => {
    expect(SKILL_HUB_VERSION).toBe("0.1.0");
  });

  it("keeps placeholder for smoke compatibility", () => {
    expect(sharedPlaceholder()).toBe("skill-hub/shared");
  });

  it("re-exports core helpers", () => {
    expect(normalizeSkillName("A B")).toBe("a-b");
    expect(expandUserPath("~").length).toBeGreaterThan(1);
    expect(ok(1)).toEqual({ ok: true, data: 1 });
    expect(createLogger({ level: "error" }).level).toBe("error");
    expect(new SkillHubError({ code: "E_INDEX", message: "x" }).code).toBe("E_INDEX");
  });
});
