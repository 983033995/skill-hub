/* global console, process */

import { readFileSync, writeFileSync } from "node:fs";
import { skillSearch } from "../packages/router/dist/index.js";

const tasks = [
  { id: 1, q: "pdf merge", profile: null, expect: ["pdf"] },
  { id: 2, q: "frontend design landing page", profile: "coding", expect: ["frontend-design"] },
  { id: 3, q: "git impact analysis", profile: "coding", expect: ["gitnexus"] },
  { id: 4, q: "product launch video", profile: "video", expect: ["product-launch-video", "video"] },
  { id: 5, q: "caption overlay talking head", profile: "video", expect: ["caption"] },
  { id: 6, q: "ssh harden security", profile: null, expect: ["ssh"] },
  { id: 7, q: "write word document docx", profile: null, expect: ["docx", "tencent-docx", "minimax-docx"] },
  { id: 8, q: "browser automation scrape", profile: null, expect: ["browser", "agent-browser", "playwright"] },
  { id: 9, q: "excel spreadsheet analysis", profile: null, expect: ["excel", "sheet", "xlsx"] },
  { id: 10, q: "changelog weekly video", profile: "video", expect: ["changelog", "video"] },
];

const catalog = JSON.parse(
  readFileSync(`${process.env.HOME}/.skill-hub/catalog.json`, "utf8"),
);
const allSkills = Object.values(catalog.skills);
let fullDescChars = 0;
for (const s of allSkills) fullDescChars += (s.description || "").length;

const rows = [];
let hitAt1 = 0;
let hitAt3 = 0;
let topkDescChars = 0;

for (const t of tasks) {
  const r = await skillSearch({
    query: t.q,
    topK: 3,
    profile: t.profile || undefined,
  });
  const names = r.results.map((x) => x.name);
  const topDesc = r.results.reduce((a, x) => a + (x.description || "").length, 0);
  topkDescChars += topDesc;
  const expectHit = (rank) =>
    names
      .slice(0, rank)
      .some((n) => t.expect.some((e) => n.toLowerCase().includes(e.toLowerCase())));
  const ok1 = expectHit(1);
  const ok3 = expectHit(3);
  if (ok1) hitAt1 += 1;
  if (ok3) hitAt3 += 1;
  rows.push({
    id: t.id,
    query: t.q,
    profile: t.profile,
    candidates: r.candidateCount,
    top3: names,
    scores: r.results.map((x) => Number(x.score.toFixed(2))),
    hit_at_1: ok1,
    hit_at_3: ok3,
    top3_desc_chars: topDesc,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  catalogSkillCount: allSkills.length,
  tasks: rows,
  metrics: {
    hit_at_1: hitAt1 / tasks.length,
    hit_at_3: hitAt3 / tasks.length,
    hit_at_1_count: hitAt1,
    hit_at_3_count: hitAt3,
    full_catalog_description_chars: fullDescChars,
    sum_top3_description_chars_over_10_queries: topkDescChars,
    avg_top3_description_chars: Math.round(topkDescChars / tasks.length),
    avg_full_description_chars: fullDescChars,
    rough_token_saving_ratio:
      fullDescChars > 0
        ? Number((1 - topkDescChars / tasks.length / fullDescChars).toFixed(4))
        : null,
    note: "相对「注入全部 skill description」：仅用 Top-3 description 字符；token≈chars/4",
  },
};

writeFileSync("outputs/phase3-route-eval.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.metrics, null, 2));
for (const row of rows) {
  console.log(
    `${row.id}. hit1=${row.hit_at_1} hit3=${row.hit_at_3} | ${row.query} -> ${row.top3.join(", ")}`,
  );
}
