/**
 * Taxonomy 自动打标签：项目的内建分类能力。
 *
 * - 规则驱动：name_globs / keywords 命中即得分，纯函数、无 IO、确定性可测
 * - 用户可在 ~/.skill-hub/taxonomy.yaml（或 SKILL_HUB_TAXONOMY 指定路径）覆盖默认规则
 * - 标签是派生数据，不写回 catalog；任何用户的 skill 库载入即自动生效
 * - 未来可叠加模型打标（embedding/LLM），输出与本模块同一 SkillTag 结构
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "@skill-hub/core";
import {
  SkillHubError,
  getDefaultHubHome,
  resolveAbsolutePath,
} from "@skill-hub/shared";
import { matchNameGlob } from "./profile.js";

export interface TaxonomyTag {
  id: string;
  label: string;
  nameGlobs: string[];
  keywords: string[];
}

export interface SkillTag {
  id: string;
  label: string;
  score: number;
}

export const OTHER_TAG: SkillTag = { id: "other", label: "其他", score: 0 };

/** 内置默认分类（基于真实库分布设计；用户可用 taxonomy.yaml 整体覆盖）。 */
export const DEFAULT_TAXONOMY: TaxonomyTag[] = [
  {
    id: "video",
    label: "视频与动画",
    nameGlobs: ["*video*", "*hyperframes*", "*animation*", "*motion*", "*caption*", "*remotion*", "*slideshow", "*sora"],
    keywords: ["视频", "动画", "分镜", "字幕", "成片", "帧", "seedance", "footage", "animation"],
  },
  {
    id: "image",
    label: "图像与设计",
    nameGlobs: ["*image*", "*design*", "figma", "*character*", "*shot-craft", "*scene-craft"],
    keywords: ["图像", "图片", "绘图", "设计", "海报", "ui", "ux", "视觉"],
  },
  {
    id: "audio",
    label: "音频与音乐",
    nameGlobs: ["*music*", "*tts*", "*audio*"],
    keywords: ["音乐", "音频", "配音", "歌曲", "歌词", "voice"],
  },
  {
    id: "docs",
    label: "文档与办公",
    nameGlobs: ["*pdf*", "*docx*", "*xlsx*", "*pptx*", "doc", "*sheet*", "*docs*"],
    keywords: ["文档", "表格", "演示", "pdf", "word", "excel", "ppt", "排版"],
  },
  {
    id: "browser",
    label: "浏览器自动化",
    nameGlobs: ["*browser*", "playwright", "*puppeteer*"],
    keywords: ["浏览器", "网页", "爬虫", "截图", "表单", "自动化"],
  },
  {
    id: "dev",
    label: "开发与运维",
    nameGlobs: ["gitnexus*", "pr-*", "devops*", "vps*", "ssh*", "electron", "*nextjs*", "vercel*", "*react*", "frontend*", "workctl", "context7*"],
    keywords: ["代码", "调试", "重构", "部署", "运维", "开发", "mcp", "review", "前端"],
  },
  {
    id: "marketing",
    label: "营销与增长",
    nameGlobs: ["*cro", "*seo*", "*marketing*", "*ads", "pricing*", "lead*", "launch*", "paywall*", "onboarding*", "popup*", "copywriting", "copy-editing", "social*", "programmatic*"],
    keywords: ["营销", "增长", "文案", "转化", "广告", "定价", "落地页", "seo"],
  },
  {
    id: "writing",
    label: "写作与内容",
    nameGlobs: ["story*", "humanizer*", "*article*", "*explainer"],
    keywords: ["写作", "改写", "文章", "公众号", "内容创作", "叙事"],
  },
  {
    id: "agent",
    label: "智能体与技能管理",
    nameGlobs: ["*skill*", "*agent*", "*superpowers*", "paseo*", "dispatch*", "claudeception", "find-*", "*mail*"],
    keywords: ["技能", "智能体", "agent", "工作流", "调度", "协作"],
  },
];

const MAX_TAGS_PER_SKILL = 3;

type SkillTagInput = Pick<SkillMeta, "name" | "description"> & {
  keywords?: string[] | undefined;
};

/** 纯函数：为单个 skill 打分并返回 Top 标签（最多 3 个；无命中回退“其他”）。 */
export function tagSkill(skill: SkillTagInput, taxonomy: TaxonomyTag[]): SkillTag[] {
  const name = skill.name.toLowerCase();
  const desc = (skill.description ?? "").toLowerCase();
  const extra = (skill.keywords ?? []).join(" ").toLowerCase();

  const scored: SkillTag[] = [];
  for (const tag of taxonomy) {
    let score = 0;
    for (const glob of tag.nameGlobs) {
      if (matchNameGlob(name, glob)) score += 3;
    }
    for (const keyword of tag.keywords) {
      const kw = keyword.toLowerCase();
      if (!kw) continue;
      if (name.includes(kw)) score += 2;
      if (desc.includes(kw) || extra.includes(kw)) score += 1;
    }
    if (score > 0) scored.push({ id: tag.id, label: tag.label, score });
  }

  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1));
  const top = scored.slice(0, MAX_TAGS_PER_SKILL);
  return top.length > 0 ? top : [{ ...OTHER_TAG }];
}

/** 与 profile 同款的手写 YAML 子集解析（项目零 yaml 依赖惯例）。 */
export function parseTaxonomyYaml(raw: string): TaxonomyTag[] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const tags: TaxonomyTag[] = [];
  let inTags = false;
  let current: TaxonomyTag | null = null;
  let section: "nameGlobs" | "keywords" | null = null;

  const unquote = (v: string) => v.trim().replace(/^["']|["']$/g, "");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (!inTags) {
      if (trimmed === "tags:") inTags = true;
      continue;
    }

    const newItem = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (newItem) {
      const id = unquote(newItem[1]!);
      current = { id, label: id, nameGlobs: [], keywords: [] };
      tags.push(current);
      section = null;
      continue;
    }
    if (!current) continue;

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (section && listItem) {
      current[section].push(unquote(listItem[1]!));
      continue;
    }

    const kv = line.match(/^\s+(id|label|name_globs|keywords):\s*(.*)$/);
    if (kv) {
      const key = kv[1]!;
      const val = unquote(kv[2] ?? "");
      section = null;
      if (key === "label") current.label = val || current.id;
      else if (key === "name_globs") section = "nameGlobs";
      else if (key === "keywords") section = "keywords";
    }
  }

  if (tags.length === 0) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "taxonomy.yaml 缺少有效的 tags 列表",
    });
  }
  return tags;
}

/**
 * 加载 taxonomy：显式路径 > SKILL_HUB_TAXONOMY > ~/.skill-hub/taxonomy.yaml > 内置默认。
 * 显式指定的文件解析失败会直接报错（不静默回退）。
 */
export async function loadTaxonomy(options?: { path?: string }): Promise<TaxonomyTag[]> {
  const explicit = options?.path ?? process.env.SKILL_HUB_TAXONOMY;
  if (explicit) {
    return parseTaxonomyYaml(await readFile(resolveAbsolutePath(explicit), "utf8"));
  }
  const userFile = path.join(getDefaultHubHome(), "taxonomy.yaml");
  try {
    return parseTaxonomyYaml(await readFile(userFile, "utf8"));
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "ENOENT") {
      return DEFAULT_TAXONOMY;
    }
    throw err;
  }
}
