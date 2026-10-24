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

  it("round-trips a persistent artifact", async () => {
    const built = createBm25Router();
    await built.build(skills);
    const loaded = createBm25Router();
    loaded.loadArtifact(built.toArtifact());

    const hits = await loaded.query({ text: "merge pdf files", topK: 2 });
    expect(hits[0]?.name).toBe("pdf-merge");
    expect(loaded.toArtifact().docs).toHaveLength(skills.length);
  });

  it("prioritizes an explicit name or keyword over an incidental description mention", async () => {
    const r = createBm25Router();
    await r.build([
      { ...skills[0]!, name: "render", description: "Produce a formatted artifact" },
      { ...skills[0]!, name: "mention", description: "Explain render and formatted artifacts" },
      {
        ...skills[0]!,
        name: "keyword",
        description: "Produce a formatted artifact",
        keywords: ["render"],
      },
    ]);
    const hits = await r.query({ text: "render", topK: 3 });
    expect(hits.map((hit) => hit.name)).toEqual(["render", "keyword", "mention"]);
  });

  it("does not retrieve generation skills solely because Chinese words share a character", async () => {
    const r = createBm25Router();
    await r.build([
      { ...skills[0]!, name: "music", description: "网页音乐生成" },
      { ...skills[0]!, name: "people", description: "生成人物视角" },
    ]);
    expect((await r.query({ text: "音乐", topK: 3 })).map((hit) => hit.name)).toEqual(["music"]);
  });

  it("supports single-character discovery without reintroducing unigrams to multi-character queries", async () => {
    const r = createBm25Router();
    await r.build([
      { ...skills[0]!, name: "music", description: "网页音乐生成" },
      { ...skills[0]!, name: "people", description: "生成人物视角" },
    ]);
    const loaded = createBm25Router();
    loaded.loadArtifact(r.toArtifact());
    expect((await r.query({ text: "音" })).map((hit) => hit.name)).toEqual(["music"]);
    expect((await r.query({ text: "音" }))[0]?.reasons).toContain("single_char_fallback");
    expect(await loaded.query({ text: "音" })).toEqual(await r.query({ text: "音" }));
    expect((await r.query({ text: "音乐" })).map((hit) => hit.name)).toEqual(["music"]);
  });
});

describe("music backend intent regression", () => {
  // Synthetic metadata only: do not import personal Skill bodies into the public suite.
  const candidates: SkillMeta[] = [
    {
      ...skills[0]!,
      name: "media-tools",
      description:
        "Generate images, video and MiniMax music using web sessions. 网页端音乐生成、歌词提取与历史作品下载。",
      keywords: [
        "MiniMax Music",
        "网页版音乐生成",
        "网页端音乐生成",
        "免 API Key",
        "web music",
        "历史音乐下载",
      ],
    },
    {
      ...skills[0]!,
      name: "minimax-music-api",
      description: "Generate songs through the MiniMax API using mmx CLI. 开放平台 API 音乐生成。",
      keywords: ["API 音乐生成", "mmx", "API key music"],
    },
    {
      ...skills[0]!,
      name: "minimax-music-playlist",
      description: "Build personalized music playlists and recommendations. 音乐推荐歌单。",
      keywords: ["歌单", "playlist"],
    },
    {
      ...skills[0]!,
      name: "browser",
      description: "Open websites, extract pages and fill browser forms. 浏览器网页操作。",
    },
    { ...skills[0]!, name: "persona", description: "我想提升决策质量，生成思维视角。" },
  ];
  const cases = [
    ["网页版 minimax music", "media-tools"],
    ["我想要用网页版minimax music来生成音乐", "media-tools"],
    ["MiniMax 网页端历史音乐下载", "media-tools"],
    ["MiniMax Music web generation", "media-tools"],
    ["MiniMax mmx API 音乐生成", "minimax-music-api"],
    ["MiniMax music API key", "minimax-music-api"],
    ["MiniMax 音乐推荐歌单", "minimax-music-playlist"],
    ["personalized music playlist recommendations", "minimax-music-playlist"],
  ];
  it.each(cases)("routes %s to %s with memory/persistent parity", async (query, expected) => {
    const r = createBm25Router();
    await r.build(candidates);
    const loaded = createBm25Router();
    loaded.loadArtifact(r.toArtifact());
    const memory = await r.query({ text: query!, topK: 3 });
    expect(memory[0]?.name).toBe(expected);
    expect(await loaded.query({ text: query!, topK: 3 })).toEqual(memory);
  });
});
