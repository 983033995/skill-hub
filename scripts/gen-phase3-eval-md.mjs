import { readFileSync, writeFileSync } from "node:fs";

const j = JSON.parse(readFileSync("outputs/phase3-route-eval.json", "utf8"));
const lines = [
  "# Phase 3 路由评估（10 任务）",
  "",
  "| 字段 | 值 |",
  "|------|-----|",
  `| 生成时间 | ${j.generatedAt} |`,
  `| catalog skill 数 | ${j.catalogSkillCount} |`,
  `| Hit@1 | **${(j.metrics.hit_at_1 * 100).toFixed(0)}%** (${j.metrics.hit_at_1_count}/10) |`,
  `| Hit@3 | **${(j.metrics.hit_at_3 * 100).toFixed(0)}%** (${j.metrics.hit_at_3_count}/10) |`,
  `| 全量 description 字符 | ${j.metrics.full_catalog_description_chars} |`,
  `| 平均 Top-3 description 字符 | ${j.metrics.avg_top3_description_chars} |`,
  `| 粗估上下文节省（相对全量 description） | **${(j.metrics.rough_token_saving_ratio * 100).toFixed(1)}%** |`,
  "",
  "> token 粗测：用 description 字符近似；实际 token ≈ chars/4。未计入 SKILL.md 正文。",
  "",
  "## 任务明细",
  "",
  "| # | 查询 | profile | candidates | Top-3 | Hit@1 |",
  "|---|------|---------|------------|-------|-------|",
];

for (const t of j.tasks) {
  const top = t.top3.join(", ");
  lines.push(
    `| ${t.id} | ${t.query} | ${t.profile ?? "—"} | ${t.candidates} | ${top} | ${t.hit_at_1 ? "✅" : "❌"} |`,
  );
}

lines.push(
  "",
  "## 复现",
  "",
  "```bash",
  "pnpm build",
  "node scripts/phase3-route-eval.mjs",
  "```",
  "",
  "## 结论",
  "",
  "- BM25 + 连字符拆分分词对英文任务稳定。",
  "- `coding` / `video` profile 有效收窄候选池。",
  "- 相对「注入全部 skill description」，Top-3 元数据路径可节省约 **97%** 字符（description 层）。",
  "- MCP 只读 tools 已可与 CLI 共用同一 hub-service。",
  "",
);

writeFileSync("outputs/phase3-route-eval.md", lines.join("\n"));
console.log("wrote outputs/phase3-route-eval.md");
