import { describe, expect, it } from "vitest";
import { detectConflicts, mergeSkillMetas } from "./conflict.js";
import type { SkillMeta } from "./types.js";

function meta(partial: Partial<SkillMeta> & Pick<SkillMeta, "name" | "hash" | "path">): SkillMeta {
  return {
    description: "d",
    mtimeMs: 1,
    ...partial,
  };
}

describe("detectConflicts / mergeSkillMetas", () => {
  it("detects same name different hash", () => {
    const conflicts = detectConflicts([
      meta({ name: "pdf", hash: "sha256:a", path: "/a/pdf", agentsPresent: ["wb"] }),
      meta({ name: "pdf", hash: "sha256:b", path: "/b/pdf", agentsPresent: ["cursor"] }),
      meta({ name: "ui", hash: "sha256:c", path: "/a/ui" }),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.name).toBe("pdf");
    expect(conflicts[0]!.variants).toHaveLength(2);
  });

  it("merges agents for same hash", () => {
    const merged = mergeSkillMetas([
      meta({ name: "pdf", hash: "sha256:a", path: "/a/pdf", agentsPresent: ["wb"] }),
      meta({ name: "pdf", hash: "sha256:a", path: "/a/pdf", agentsPresent: ["cursor"] }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.agentsPresent).toEqual(["cursor", "wb"]);
  });
});
