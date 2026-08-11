import type { SkillMeta } from "@skill-hub/core";

export interface RouteQuery {
  text: string;
  topK?: number;
  profile?: string;
}

export interface RankedSkill extends SkillMeta {
  score: number;
  reasons: string[];
}

export interface RouterEngine {
  readonly engineId: string;
  build(skills: SkillMeta[]): Promise<void>;
  query(q: RouteQuery): Promise<RankedSkill[]>;
}

export interface IndexMeta {
  engine: string;
  builtAt: string;
  skillCount: number;
  catalogHash?: string;
}
