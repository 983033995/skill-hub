import type { SkillMeta } from "@skill-hub/core";
import { tokenize } from "./tokenize.js";
import type {
  Bm25IndexArtifact,
  RankedSkill,
  RouteQuery,
  RouterEngine,
} from "./types.js";

interface DocEntry {
  meta: SkillMeta;
  /** term -> tf */
  tf: Map<string, number>;
  length: number;
}

/**
 * 内存 BM25 引擎（Okapi BM25）。
 * 字段加权：name ×3 计入 token 流（通过重复拼接实现）。
 */
export class Bm25Router implements RouterEngine {
  readonly engineId = "bm25" as const;
  private docs: DocEntry[] = [];
  private df = new Map<string, number>();
  private avgdl = 0;
  private readonly k1: number;
  private readonly b: number;

  constructor(options?: { k1?: number; b?: number }) {
    this.k1 = options?.k1 ?? 1.2;
    this.b = options?.b ?? 0.75;
  }

  async build(skills: SkillMeta[]): Promise<void> {
    this.docs = [];
    this.df = new Map();
    let totalLen = 0;

    for (const meta of skills) {
      const text = [
        meta.name,
        meta.name,
        meta.name,
        meta.description,
        ...(meta.keywords ?? []),
      ].join(" ");
      const tokens = tokenize(text);
      const tf = new Map<string, number>();
      for (const t of tokens) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
      }
      for (const term of tf.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
      this.docs.push({ meta, tf, length: tokens.length || 1 });
      totalLen += tokens.length || 1;
    }

    this.avgdl = this.docs.length > 0 ? totalLen / this.docs.length : 0;
  }

  /** 将 BM25 运行时状态转换为可落盘、可重新加载的 JSON artifact。 */
  toArtifact(): Bm25IndexArtifact {
    return {
      version: 1,
      engine: "bm25",
      k1: this.k1,
      b: this.b,
      avgdl: this.avgdl,
      df: Object.fromEntries(this.df),
      docs: this.docs.map((doc) => ({
        meta: doc.meta,
        tf: Object.fromEntries(doc.tf),
        length: doc.length,
      })),
    };
  }

  /** 从 index/bm25.json 恢复索引，不读取 Skill 正文。 */
  loadArtifact(artifact: Bm25IndexArtifact): void {
    if (artifact.version !== 1 || artifact.engine !== "bm25") {
      throw new Error("不支持的 BM25 index artifact 版本或 engine");
    }
    if (!Number.isFinite(artifact.avgdl) || artifact.avgdl < 0) {
      throw new Error("BM25 index artifact.avgdl 无效");
    }
    this.df = new Map(Object.entries(artifact.df));
    this.docs = artifact.docs.map((doc) => ({
      meta: doc.meta,
      tf: new Map(Object.entries(doc.tf)),
      length: doc.length,
    }));
    this.avgdl = artifact.avgdl;
  }

  static fromArtifact(artifact: Bm25IndexArtifact): Bm25Router {
    const router = new Bm25Router({ k1: artifact.k1, b: artifact.b });
    router.loadArtifact(artifact);
    return router;
  }

  async query(q: RouteQuery): Promise<RankedSkill[]> {
    const topK = q.topK ?? 5;
    const qTokens = tokenize(q.text);
    if (qTokens.length === 0 || this.docs.length === 0) {
      return [];
    }

    const N = this.docs.length;
    const scored: RankedSkill[] = [];

    for (const doc of this.docs) {
      let score = 0;
      const reasons: string[] = [];
      const seen = new Set<string>();

      for (const term of qTokens) {
        if (seen.has(term)) continue;
        seen.add(term);
        const f = doc.tf.get(term) ?? 0;
        if (f === 0) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const denom =
          f + this.k1 * (1 - this.b + (this.b * doc.length) / (this.avgdl || 1));
        const termScore = idf * ((f * (this.k1 + 1)) / denom);
        score += termScore;

        if (doc.meta.name.includes(term) || tokenize(doc.meta.name).includes(term)) {
          reasons.push(`name_token:${term}`);
        } else {
          reasons.push(`desc_hit:${term}`);
        }
      }

      // 名称完全相等加权
      if (doc.meta.name === qTokens.join("-") || doc.meta.name === q.text.trim().toLowerCase()) {
        score += 2;
        reasons.push("name_exact");
      }

      if (score > 0) {
        scored.push({
          ...doc.meta,
          score,
          reasons: reasons.slice(0, 8),
        });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return scored.slice(0, topK);
  }
}

export function createBm25Router(options?: { k1?: number; b?: number }): Bm25Router {
  return new Bm25Router(options);
}
