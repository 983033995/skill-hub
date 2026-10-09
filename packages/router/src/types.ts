import type { SkillMeta } from "@skill-hub/core";
import type { SkillScope } from "@skill-hub/shared";

export interface RouteQuery {
  text: string;
  topK?: number;
  profile?: string;
  scope?: SkillScope | SkillScope[];
}

export interface RankedSkill extends SkillMeta {
  score: number;
  reasons: string[];
}

/**
 * 可选外部决策层的只读结果。
 *
 * `selected` 是本地 Skill 名称；为空表示 Jev 选择了 none-of-the-above。
 * 概率只用于排序和升级建议，不能单独作为执行授权或正确性证明。
 */
export interface RouterDecision {
  kind: "choice";
  model: string | null;
  selected: string | null;
  confidence: number;
  selectedProbability: number;
  noneProbability: number;
  threshold: number;
  escalationRecommended: boolean;
  probabilities: Record<string, number>;
}

export interface RouterEngine {
  readonly engineId: string;
  build(skills: SkillMeta[]): Promise<void>;
  query(q: RouteQuery): Promise<RankedSkill[]>;
  getDecision?(): RouterDecision | undefined;
}

export interface IndexMeta {
  version?: 1;
  engine: string;
  builtAt: string;
  skillCount: number;
  catalogHash?: string;
  artifact?: string;
  artifactFormat?: string;
}

export interface Bm25IndexArtifact {
  version: 1;
  engine: "bm25";
  k1: number;
  b: number;
  avgdl: number;
  df: Record<string, number>;
  docs: Array<{
    meta: SkillMeta;
    tf: Record<string, number>;
    length: number;
  }>;
}
