import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAXONOMY,
  OTHER_TAG,
  parseTaxonomyYaml,
  tagSkill,
} from "./taxonomy.js";

describe("taxonomy 自动打标签", () => {
  it("按 name_globs 与 keywords 打分，返回 Top 3", () => {
    const tags = tagSkill(
      { name: "music-to-video", description: "把音乐变成节拍同步的视频" },
      DEFAULT_TAXONOMY,
    );
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.length).toBeLessThanOrEqual(3);
    const ids = tags.map((t) => t.id);
    expect(ids).toContain("video");
    expect(ids).toContain("audio");
    // 排序：分数高的在前
    for (let i = 1; i < tags.length; i += 1) {
      expect(tags[i - 1]!.score).toBeGreaterThanOrEqual(tags[i]!.score);
    }
  });

  it("无命中时回退“其他”", () => {
    const tags = tagSkill(
      { name: "xyzzy-qqq", description: "zz top nowhere" },
      DEFAULT_TAXONOMY,
    );
    expect(tags).toEqual([{ ...OTHER_TAG }]);
  });

  it("解析 taxonomy.yaml 子集", () => {
    const parsed = parseTaxonomyYaml(`# 注释
tags:
  - id: video
    label: 视频与动画
    name_globs:
      - "*video*"
    keywords:
      - 视频
      - animation
  - id: docs
    label: 文档
    keywords:
      - pdf
`);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({
      id: "video",
      label: "视频与动画",
      nameGlobs: ["*video*"],
      keywords: ["视频", "animation"],
    });
    expect(parsed[1]).toMatchObject({ id: "docs", label: "文档", keywords: ["pdf"] });
  });

  it("空 tags 列表报错而非静默回退", () => {
    expect(() => parseTaxonomyYaml("name: nothing\n")).toThrowError(/tags/);
  });

  it("自定义 taxonomy 生效", () => {
    const custom = parseTaxonomyYaml(`tags:
  - id: ops
    label: 运维
    keywords:
      - vps
`);
    const tags = tagSkill({ name: "vps-checkup", description: "检查 VPS 健康" }, custom);
    expect(tags[0]).toMatchObject({ id: "ops", label: "运维" });
  });
});
