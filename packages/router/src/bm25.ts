import type { SkillMeta } from "@skill-hub/core";
import { tokenize } from "./tokenize.js";
import type { Bm25IndexArtifact, RankedSkill, RouteQuery, RouterEngine } from "./types.js";

interface DocEntry {
  meta: SkillMeta;
  /** term -> tf */
  tf: Map<string, number>;
  length: number;
}

/**
 * 内存 BM25 引擎（Okapi BM25）。
 * 每个字段内去重，字段权重独立累计：name ×3、keywords ×3、description ×1。
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
      const tf = new Map<string, number>();
      for (const [text, weight] of [
        [meta.name, 3],
        [meta.description, 1],
        [(meta.keywords ?? []).join(" "), 3],
      ] as const) {
        for (const term of tokenize(text)) {
          tf.set(term, (tf.get(term) ?? 0) + weight);
        }
      }
      for (const term of tf.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
      const length = [...tf.values()].reduce((sum, weight) => sum + weight, 0) || 1;
      this.docs.push({ meta, tf, length });
      totalLen += length;
    }

    this.avgdl = this.docs.length > 0 ? totalLen / this.docs.length : 0;
  }

  /** 将 BM25 运行时状态转换为可落盘、可重新加载的 JSON artifact。 */
  toArtifact(): Bm25IndexArtifact {
    return {
      version: 2,
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
    if (artifact.version !== 2 || artifact.engine !== "bm25") {
      throw new Error("BM25 index artifact 算法版本过期或 engine 不支持；请运行 index --rebuild");
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
    // 单字中文查询没有 bigram；仅此场景按元数据中的字符覆盖回退。
    // 不把 unigram 放回普通查询，避免恢复“生/成/音”等噪音召回。
    const singleChar = /^[\u4e00-\u9fff]$/.test(q.text.trim()) ? q.text.trim() : null;
    const singleCharFrequency = (meta: SkillMeta) =>
      singleChar
        ? (meta.name.includes(singleChar) ? 3 : 0) +
          (meta.description.includes(singleChar) ? 1 : 0) +
          ((meta.keywords ?? []).some((keyword) => keyword.includes(singleChar)) ? 3 : 0)
        : 0;
    const singleCharDf = singleChar
      ? this.docs.filter((doc) => singleCharFrequency(doc.meta) > 0).length
      : 0;

    for (const doc of this.docs) {
      let score = 0;
      const reasons: string[] = [];
      const seen = new Set<string>();

      for (const term of qTokens) {
        if (seen.has(term)) continue;
        seen.add(term);
        const f = singleChar ? singleCharFrequency(doc.meta) : (doc.tf.get(term) ?? 0);
        if (f === 0) continue;
        const df = singleChar ? singleCharDf : (this.df.get(term) ?? 0);
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        const denom = f + this.k1 * (1 - this.b + (this.b * doc.length) / (this.avgdl || 1));
        const termScore = idf * ((f * (this.k1 + 1)) / denom);
        score += termScore;
        if (singleChar) reasons.push("single_char_fallback");

        if (doc.meta.name.includes(term) || tokenize(doc.meta.name).includes(term)) {
          reasons.push(`name_token:${term}`);
        } else if (tokenize((doc.meta.keywords ?? []).join(" ")).includes(term)) {
          reasons.push(`keyword_hit:${term}`);
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
