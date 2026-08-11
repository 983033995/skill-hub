import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import {
  filterByProfile,
  loadProfile,
  matchNameGlob,
  parseProfileYaml,
  skillMatchesProfile,
} from "./profile.js";

const skills: SkillMeta[] = [
  {
    name: "frontend-design",
    description: "UI components",
    path: "/s/frontend-design",
    hash: "sha256:1",
    mtimeMs: 1,
  },
  {
    name: "hyperframes-core",
    description: "video composition",
    path: "/s/hf",
    hash: "sha256:2",
    mtimeMs: 1,
  },
  {
    name: "pdf",
    description: "merge pdf",
    path: "/s/pdf",
    hash: "sha256:3",
    mtimeMs: 1,
  },
];

describe("profile", () => {
  it("matchNameGlob", () => {
    expect(matchNameGlob("frontend-design", "frontend-*")).toBe(true);
    expect(matchNameGlob("hyperframes-core", "hyperframes*")).toBe(true);
    expect(matchNameGlob("pdf", "*video*")).toBe(false);
  });

  it("parseProfileYaml", () => {
    const p = parseProfileYaml(`
name: coding
description: test
include_name_globs:
  - "frontend-*"
  - "*test*"
keywords:
  - code
`);
    expect(p.name).toBe("coding");
    expect(p.include_name_globs).toContain("frontend-*");
    expect(p.keywords).toContain("code");
  });

  it("filterByProfile keeps matching names", () => {
    const profile = parseProfileYaml(`
name: coding
include_name_globs:
  - "frontend-*"
keywords:
  - code
`);
    const r = filterByProfile(skills, profile);
    expect(r.fallback).toBe(false);
    expect(r.skills.map((s) => s.name)).toEqual(["frontend-design"]);
  });

  it("loadProfile coding from repo configs", async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const p = await loadProfile("coding", path.join(repoRoot, "configs/profiles"));
    expect(p.name).toBe("coding");
    expect(p.include_name_globs.length).toBeGreaterThan(0);
    expect(skillMatchesProfile(skills[0]!, p)).toBe(true);
  });
});
