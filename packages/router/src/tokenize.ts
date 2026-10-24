/**
 * 简易分词：英文词 + 连字符/下划线拆分 + 连续 CJK 二元切分。
 */

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    if (!t || seen.has(t)) return;
    // 极短数字噪音跳过
    if (/^\d+$/.test(t) && t.length < 2) return;
    seen.add(t);
    tokens.push(t);
  };

  // 英文/数字 token（保留连字符整体 + 拆分片段）
  for (const m of lower.matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
    const full = m[0]!;
    push(full);
    // 按 - _ . 拆成子词，提升 gitnexus-impact-analysis ↔ "impact analysis" 命中
    for (const part of full.split(/[-_.]+/)) {
      if (part.length >= 2) push(part);
    }
  }

  // 多字汉字使用 bigram，避免“生/成/音”等单字把无关任务召回。
  // 单字查询仍保留，保持短中文 Skill 名可检索。
  for (const m of lower.matchAll(/[\u4e00-\u9fff]+/g)) {
    const run = m[0]!;
    if (run.length === 1) push(run);
    for (let i = 0; i + 1 < run.length; i += 1) {
      push(run.slice(i, i + 2));
    }
  }

  return tokens;
}
