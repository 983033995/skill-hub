import { describe, expect, it } from "vitest";
import {
  SkillHubError,
  createError,
  exitCodeFor,
  isErrorCode,
  toSkillHubError,
} from "./errors.js";

describe("SkillHubError", () => {
  it("maps conflict to exit code 2", () => {
    const e = createError("E_CONFLICT", "同名冲突", { name: "pdf" });
    expect(e).toBeInstanceOf(SkillHubError);
    expect(e.code).toBe("E_CONFLICT");
    expect(e.exitCode).toBe(2);
    expect(e.toDisplayString()).toContain("E_CONFLICT");
    expect(e.toJSON()).toMatchObject({ code: "E_CONFLICT", exitCode: 2 });
  });

  it("maps config/path to exit code 3", () => {
    expect(exitCodeFor("E_CONFIG")).toBe(3);
    expect(exitCodeFor("E_PATH")).toBe(3);
  });

  it("normalizes unknown throws", () => {
    const e = toSkillHubError(new Error("boom"));
    expect(e.code).toBe("E_INTERNAL");
    expect(e.message).toBe("boom");
  });

  it("detects error codes", () => {
    expect(isErrorCode("E_PARSE")).toBe(true);
    expect(isErrorCode("E_NOPE")).toBe(false);
  });
});
