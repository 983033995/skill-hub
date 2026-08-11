import { describe, expect, it } from "vitest";
import type { SkillMeta } from "@skill-hub/core";
import { createBm25Router } from "./bm25.js";

const skills: SkillMeta[] = [
  {
    name: "pdf-merge",
    description: "Merge multiple PDF files into one document. 合并 PDF.",
    path: "/f/pdf-merge",
    hash: "sha256:1",
    mtimeMs: 1,
    keywords: ["pdf", "merge"],
  },
  {
    name: "frontend-design",
    description: "Create production-grade frontend UI components and pages.",
    path: "/f/frontend-design",
    hash: "sha256:2",
    mtimeMs: 1,
    keywords: ["ui", "frontend"],
  },
  {
    name: "sample-skill",
    description: "Fixture skill for skill-hub tests.",
    path: "/f/sample",
    hash: "sha256:3",
    mtimeMs: 1,
  },
];

describe("Bm25Router", () => {
  it("ranks pdf query toward pdf-merge", async () => {
    const r = createBm25Router();
    await r.build(skills);
    const hits = await r.query({ text: "merge pdf files", topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.name).toBe("pdf-merge");
    expect(hits[0]!.score).toBeGreaterThan(0);
  });

  it("ranks frontend query toward frontend-design", async () => {
    const r = createBm25Router();
    await r.build(skills);
    const hits = await r.query({ text: "frontend ui design page", topK: 2 });
    expect(hits[0]!.name).toBe("frontend-design");
  });
});
