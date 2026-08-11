import { describe, expect, it } from "vitest";
import { SKILL_HUB_VERSION, SkillHubError } from "@skill-hub/shared";
import { corePlaceholder, scanSkills } from "@skill-hub/core";
import { createBm25Router } from "@skill-hub/router";
import { planSync } from "@skill-hub/sync";

describe("monorepo smoke", () => {
  it("can import workspace packages", () => {
    expect(SKILL_HUB_VERSION).toBe("0.1.0");
    expect(corePlaceholder()).toContain("skill-hub/core");
    expect(createBm25Router().engineId).toBe("bm25");
    expect(typeof planSync).toBe("function");
    expect(typeof scanSkills).toBe("function");
    expect(new SkillHubError({ code: "E_PATH", message: "x" }).exitCode).toBe(3);
  });
});
