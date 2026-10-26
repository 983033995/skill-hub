/** Offline draft recall evaluation. Uses metadata only, never reads/executes Skill bodies. */
import console from "node:console";
import process from "node:process";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { readCatalog, catalogHash, catalogToSkillMetas } from "../packages/core/dist/index.js";
import { Bm25Router } from "../packages/router/dist/bm25.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args[0] === "--") args.shift();
const [catalogArgument, outputArgument] = args;
if (!catalogArgument || catalogArgument.startsWith("-")) {
  console.error("用法: pnpm eval:router -- <catalog.json> [report.json]");
  console.error("该评估需要显式提供 catalog 路径，不会读取默认用户 Hub。");
  process.exitCode = 2;
  process.exit();
}
const catalogPath = path.resolve(catalogArgument);
const catalog = await readCatalog(catalogPath);
const dataset = JSON.parse(await readFile(path.join(repo, "evals/router/recall.v1.json"), "utf8"));
const skills = catalogToSkillMetas(catalog);
const names = new Set(skills.map((skill) => skill.name));
for (const task of dataset.cases)
  for (const expected of task.expectedAnyOf)
    assert(names.has(expected), `Missing labeled Skill: ${expected}`);

// Frozen pre-change token rules; comparisons share current metadata to isolate ranking changes.
function legacyTokens(text) {
  const seen = new Set();
  const push = (token) => {
    if (token && !(/^\d+$/.test(token) && token.length < 2)) seen.add(token);
  };
  for (const match of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9._-]*/g)) {
    push(match[0]);
    for (const part of match[0].split(/[-_.]+/)) if (part.length >= 2) push(part);
  }
  for (const match of text.toLowerCase().matchAll(/[\u4e00-\u9fff]+/g))
    for (let i = 0; i < match[0].length; i++) {
      push(match[0][i]);
      if (i + 1 < match[0].length) push(match[0].slice(i, i + 2));
    }
  return [...seen];
}
const current = new Bm25Router();
const currentBuildStarted = performance.now();
await current.build(skills);
const currentBuildMs = performance.now() - currentBuildStarted;
function referenceRouter(weighted) {
  const artifact = current.toArtifact();
  artifact.df = {};
  for (const doc of artifact.docs) {
    doc.tf = {};
    const fields = weighted
      ? [
          [doc.meta.name, 3],
          [doc.meta.description, 1],
          [(doc.meta.keywords ?? []).join(" "), 3],
        ]
      : [
          [
            `${doc.meta.name} ${doc.meta.name} ${doc.meta.name} ${doc.meta.description} ${(doc.meta.keywords ?? []).join(" ")}`,
            1,
          ],
        ];
    for (const [text, weight] of fields)
      for (const term of legacyTokens(text)) doc.tf[term] = (doc.tf[term] ?? 0) + weight;
    doc.length = Object.values(doc.tf).reduce((sum, tf) => sum + tf, 0) || 1;
    for (const term of Object.keys(doc.tf)) artifact.df[term] = (artifact.df[term] ?? 0) + 1;
  }
  artifact.avgdl = artifact.docs.reduce((sum, doc) => sum + doc.length, 0) / artifact.docs.length;
  return Bm25Router.fromArtifact(artifact);
}
const report = {
  generatedAt: new Date().toISOString(),
  catalogHash: catalogHash(catalog),
  skillCount: skills.length,
  labelStatus: dataset.labelStatus,
  mode: "offline-bm25-only",
  variants: [],
  notes:
    "Reference variants use the same current metadata; not a historical before/after comparison. Legacy query tokens are space-separated so current query tokenization preserves the old unigram set. Catalog path is explicit; no default user catalog is read. Offline BM25 makes no model calls: measured cost is not applicable, Jev escalation rate is null, and noneCandidateRate is candidate availability rather than false activation. Rows contain query and Skill names; keep any saved report local. Draft labels are not a product quality guarantee.",
};
const preChangeBuildStarted = performance.now();
const preChange = referenceRouter(false);
const preChangeBuildMs = performance.now() - preChangeBuildStarted;
const weightedBuildStarted = performance.now();
const weighted = referenceRouter(true);
const weightedBuildMs = performance.now() - weightedBuildStarted;
for (const { variant, router, legacy, buildMs } of [
  { variant: "pre-change-ranking", router: preChange, legacy: true, buildMs: preChangeBuildMs },
  { variant: "weighted-with-unigrams", router: weighted, legacy: true, buildMs: weightedBuildMs },
  { variant: "weighted-bigrams", router: current, legacy: false, buildMs: currentBuildMs },
]) {
  const rows = [];
  const queryLatenciesMs = [];
  for (const task of dataset.cases) {
    const tokens = legacyTokens(task.query);
    // Duplicate a single legacy token so its control query bypasses the new single-char fallback;
    // query token deduplication keeps the original term set and old artifact term statistics.
    const referenceQuery =
      tokens.length === 1 && /^[\u4e00-\u9fff]$/.test(tokens[0])
        ? `${tokens[0]} ${tokens[0]}`
        : tokens.join(" ");
    const queryStarted = performance.now();
    const hits = await router.query({ text: legacy ? referenceQuery : task.query, topK: 5 });
    queryLatenciesMs.push(performance.now() - queryStarted);
    const top5 = hits.map((hit) => hit.name);
    rows.push({
      ...task,
      top5,
      hitAt1: task.expectedAnyOf.includes(top5[0]),
      hitAt5: top5.some((name) => task.expectedAnyOf.includes(name)),
      returnedCandidates: top5.length,
    });
  }
  const required = rows.filter((row) => row.kind === "required");
  const none = rows.filter((row) => row.kind === "none");
  const ambiguous = rows.filter((row) => row.kind === "ambiguous");
  report.variants.push({
    variant,
    metrics: {
      requiredCount: required.length,
      hitAt1: required.filter((row) => row.hitAt1).length / required.length,
      recallAt5: required.filter((row) => row.hitAt5).length / required.length,
      noneCount: none.length,
      noneCandidateRate: none.filter((row) => row.returnedCandidates > 0).length / none.length,
      ambiguousCount: ambiguous.length,
      ambiguousHitAt5: ambiguous.filter((row) => row.hitAt5).length / ambiguous.length,
      falseActivationRate: null,
      queryLatencyMs: {
        p50: percentile(queryLatenciesMs, 0.5),
        p95: percentile(queryLatenciesMs, 0.95),
        total: queryLatenciesMs.reduce((sum, value) => sum + value, 0),
      },
      indexBuildLatencyMs: buildMs,
      modelCalls: 0,
      measuredCostUsd: null,
      costStatus: "not-applicable-offline",
      escalationRate: null,
      escalationStatus: "not-applicable-bm25-has-no-jev-decision",
    },
    rows,
  });
}
if (outputArgument) {
  const outputPath = path.resolve(outputArgument);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ok: true, outputPath, variants: report.variants }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)].toFixed(3));
}
