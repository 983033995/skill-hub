#!/usr/bin/env node
/** Explicitly opt-in Jev evaluation. Never uses the default Hub or retries billable calls. */
import console from "node:console";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_API_URL = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_API_HOST = "api.typesafe.ai";
const USAGE = `Usage: pnpm eval:router:jev -- --catalog <catalog.json> --model <model> --max-requests <n> --confirm-paid-requests --confirm-skill-metadata-upload [--input-usd-per-million <rate>] [--output-usd-per-million <rate>] [--out <report.json>]\n       pnpm eval:router:jev -- --preview --catalog <catalog.json> --model <model> --max-requests <n> [--preview-out <private-payloads.json>]\nLive mode sends the selected generic queries and candidate name/description/keywords to the official TypeSafe API; it never sends Skill bodies, paths, or attachment content. TYPESAFE_API_URL is ignored. Preview mode is local-only and does not read TYPESAFE_API_KEY, call the network, or write a live report. Full queries and candidate metadata are saved only when --preview-out is explicitly provided; keep that file private.`;
const VALUE_FLAGS = new Set([
  "catalog",
  "model",
  "max-requests",
  "input-usd-per-million",
  "output-usd-per-million",
  "out",
  "preview-out",
]);
const BOOLEAN_FLAGS = new Set([
  "confirm-paid-requests",
  "confirm-skill-metadata-upload",
  "help",
  "preview",
]);

function parseArguments(argv) {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--")) throw new Error(`Unexpected positional argument: ${token}`);
    const [key, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (BOOLEAN_FLAGS.has(key)) {
      if (inlineValue !== undefined) throw new Error(`--${key} does not accept a value`);
      options[key] = true;
      continue;
    }
    if (!VALUE_FLAGS.has(key)) throw new Error(`Unknown option: --${key}`);
    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
    options[key] = value;
  }
  return options;
}

function requiredPositiveInteger(value, label, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`--${label} must be an integer from 1 to ${maximum}`);
  }
  return parsed;
}

function optionalRate(value, label) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`--${label} must be a nonnegative number`);
  return parsed;
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)].toFixed(3));
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(`${USAGE}\n${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const missing = [
    ...(!options.catalog ? ["--catalog"] : []),
    ...(!options.model ? ["--model"] : []),
    ...(!options["max-requests"] ? ["--max-requests"] : []),
    ...(!options.preview && !options["confirm-paid-requests"] ? ["--confirm-paid-requests"] : []),
    ...(!options.preview && !options["confirm-skill-metadata-upload"]
      ? ["--confirm-skill-metadata-upload"]
      : []),
  ];
  if (missing.length > 0) {
    console.error(`${USAGE}\nMissing explicit opt-in/options: ${missing.join(", ")}`);
    process.exitCode = 2;
    return;
  }
  if (
    !options.catalog.trim() ||
    !options.model.trim() ||
    (options.out !== undefined && !options.out.trim()) ||
    (options["preview-out"] !== undefined && !options["preview-out"].trim())
  ) {
    console.error("--catalog, --model, and any explicitly provided output path must be non-empty.");
    process.exitCode = 2;
    return;
  }
  if (
    options.preview &&
    (options["confirm-paid-requests"] || options["confirm-skill-metadata-upload"])
  ) {
    console.error(
      "--preview cannot be combined with paid-request or metadata-upload confirmations.",
    );
    process.exitCode = 2;
    return;
  }
  if (
    options.preview &&
    (options.out !== undefined ||
      options["input-usd-per-million"] !== undefined ||
      options["output-usd-per-million"] !== undefined)
  ) {
    console.error(
      "--preview uses --preview-out only; live report and cost-rate options are not accepted.",
    );
    process.exitCode = 2;
    return;
  }
  if (!options.preview && options["preview-out"] !== undefined) {
    console.error("--preview-out requires --preview.");
    process.exitCode = 2;
    return;
  }
  const datasetPath = path.join(repo, "evals/router/recall.v1.json");
  const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  const { validateDataset } = await import("./check-router-eval.mjs");
  const datasetValidation = validateDataset(dataset);
  if (!datasetValidation.ok) {
    console.error(
      JSON.stringify({ ok: false, code: "E_EVAL_DATASET", errors: datasetValidation.errors }),
    );
    process.exitCode = 2;
    return;
  }
  const maxRequests = requiredPositiveInteger(
    options["max-requests"],
    "max-requests",
    dataset.cases.length,
  );
  const inputRate = optionalRate(options["input-usd-per-million"], "input-usd-per-million");
  const outputRate = optionalRate(options["output-usd-per-million"], "output-usd-per-million");
  const catalogPath = path.resolve(options.catalog.trim());
  const model = options.model.trim();
  const selectedTasks = selectEvaluationTasks(dataset.cases, maxRequests);
  const countKinds = (tasks) =>
    Object.fromEntries(
      ["required", "none", "ambiguous"].map((kind) => [
        kind,
        tasks.filter((task) => task.kind === kind).length,
      ]),
    );

  // Load the project runtime only after explicit network/billing/metadata consent was supplied.
  const { readCatalog, catalogToSkillMetas, catalogHash } =
    await import("../packages/core/dist/index.js");
  const catalog = await readCatalog(catalogPath);
  const skills = catalogToSkillMetas(catalog);
  const missingLabels = findMissingExpectedSkills(
    selectedTasks,
    new Set(skills.map((skill) => skill.name)),
  );
  if (missingLabels.length > 0) {
    console.error(
      JSON.stringify({
        ok: false,
        code: "E_EVAL_CATALOG_LABELS",
        missingSkillNames: missingLabels,
      }),
    );
    process.exitCode = 2;
    return;
  }
  if (options.preview) {
    const { buildTypeSafeRouteRequestBody } = await import("../packages/router/dist/typesafe.js");
    const candidates = skills.map((meta, index) => ({ id: `s${index}`, meta }));
    const requests = selectedTasks.map((task) => ({
      taskId: task.id,
      kind: task.kind,
      expectedAnyOf: task.expectedAnyOf,
      request: buildTypeSafeRouteRequestBody({ text: task.query, topK: 5 }, candidates, model),
    }));
    const preview = {
      mode: "local-payload-preview",
      generatedAt: new Date().toISOString(),
      datasetVersion: dataset.version,
      labelStatus: dataset.labelStatus,
      catalogHash: catalogHash(catalog),
      catalogSkillCount: skills.length,
      apiHost: DEFAULT_API_HOST,
      requestedModel: model,
      requestLimit: maxRequests,
      selectionStrategy: "deterministic-round-robin-by-kind|required,none,ambiguous",
      selectedTaskCounts: countKinds(selectedTasks),
      requests,
      note: "Local request-body preview only. Contains task queries and candidate metadata; no API key or Skill body/path/attachments.",
    };
    let previewFileWritten = false;
    if (options["preview-out"]) {
      const previewPath = path.resolve(options["preview-out"].trim());
      const [canonicalPreviewPath, canonicalCatalogPath, canonicalDatasetPath] = await Promise.all([
        canonicalizePath(previewPath),
        canonicalizePath(catalogPath),
        canonicalizePath(datasetPath),
      ]);
      if (
        canonicalPreviewPath === canonicalCatalogPath ||
        canonicalPreviewPath === canonicalDatasetPath
      ) {
        throw Object.assign(new Error("Preview output must not overwrite the catalog or dataset"), {
          code: "E_EVAL_OUTPUT",
        });
      }
      await preflightReportPath(previewPath);
      await writeReportAtomically(previewPath, `${JSON.stringify(preview, null, 2)}\n`);
      previewFileWritten = true;
    }
    console.log(
      JSON.stringify({
        ok: true,
        mode: preview.mode,
        requestedModel: model,
        catalogSkillCount: skills.length,
        requestsPreviewed: requests.length,
        selectedTaskCounts: preview.selectedTaskCounts,
        fullPayloadWritten: previewFileWritten,
      }),
    );
    return;
  }
  const [{ TypeSafeRouterEngine }, { Bm25Router }] = await Promise.all([
    import("../packages/router/dist/typesafe.js"),
    import("../packages/router/dist/bm25.js"),
  ]);
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    console.error("TYPESAFE_API_KEY is not configured; no request was sent.");
    process.exitCode = 2;
    return;
  }
  if (options.out) await preflightReportPath(path.resolve(options.out.trim()));
  const bm25 = new Bm25Router();
  const bm25BuildStarted = performance.now();
  await bm25.build(skills);
  const bm25BuildLatencyMs = elapsedMs(bm25BuildStarted);
  const engine = new TypeSafeRouterEngine({
    apiKey: process.env.TYPESAFE_API_KEY,
    model,
    apiUrl: DEFAULT_API_URL,
  });
  const counts = {
    required: { total: 0, hitAt1: 0, hitAt5: 0 },
    none: { total: 0, correctNone: 0, selectedCandidate: 0 },
    ambiguous: { total: 0, expectedHitAt5: 0 },
  };
  const bm25Counts = {
    required: { total: 0, hitAt1: 0, hitAt5: 0 },
    none: { total: 0, candidateReturned: 0 },
    ambiguous: { total: 0, expectedHitAt5: 0 },
  };
  const rows = [];
  const latencies = [];
  const bm25Latencies = [];
  let inputTokensTotal = 0;
  let outputTokensTotal = 0;
  let inputUsageKnown = 0;
  let outputUsageKnown = 0;
  let escalationRecommendedCount = 0;
  let failures = 0;

  await engine.build(skills);
  console.error(
    JSON.stringify({
      event: "jev-eval-preflight",
      endpointHost: DEFAULT_API_HOST,
      model,
      catalogSkillCount: skills.length,
      requestsToAttemptAtMost: selectedTasks.length,
      selectionStrategy: "deterministic-round-robin-by-kind",
      metadataUploadConfirmed: true,
      paidRequestsConfirmed: true,
    }),
  );
  for (const task of selectedTasks) {
    const bm25Result = await evaluateBm25Baseline(bm25, task);
    const bm25LatencyMs = bm25Result.latencyMs;
    const bm25Top5 = bm25Result.top5;
    const bm25ExpectedHit = bm25Top5.some((name) => task.expectedAnyOf.includes(name));
    bm25Latencies.push(bm25LatencyMs);
    if (task.kind === "required") {
      bm25Counts.required.total += 1;
      if (task.expectedAnyOf.includes(bm25Top5[0] ?? "")) bm25Counts.required.hitAt1 += 1;
      if (bm25ExpectedHit) bm25Counts.required.hitAt5 += 1;
    } else if (task.kind === "none") {
      bm25Counts.none.total += 1;
      if (bm25Top5.length > 0) bm25Counts.none.candidateReturned += 1;
    } else {
      bm25Counts.ambiguous.total += 1;
      if (bm25ExpectedHit) bm25Counts.ambiguous.expectedHitAt5 += 1;
    }
    const bm25Evidence = { bm25Top5, bm25LatencyMs };
    try {
      const results = await engine.query({ text: task.query, topK: 5 });
      const decision = engine.getDecision();
      const metrics = engine.getLastRequestMetrics();
      if (!decision || !metrics) throw new Error("missing-request-metrics-or-decision");
      const returned = results.map((skill) => skill.name);
      const expectedHit = returned.some((name) => task.expectedAnyOf.includes(name));
      if (task.kind === "required") {
        counts.required.total += 1;
        if (task.expectedAnyOf.includes(decision.selected ?? "")) counts.required.hitAt1 += 1;
        if (expectedHit) counts.required.hitAt5 += 1;
      } else if (task.kind === "none") {
        counts.none.total += 1;
        if (decision.selected === null) counts.none.correctNone += 1;
        else counts.none.selectedCandidate += 1;
      } else {
        counts.ambiguous.total += 1;
        if (expectedHit) counts.ambiguous.expectedHitAt5 += 1;
      }
      if (decision.escalationRecommended) escalationRecommendedCount += 1;
      latencies.push(metrics.latencyMs);
      if (metrics.inputTokens !== null) {
        inputTokensTotal += metrics.inputTokens;
        inputUsageKnown += 1;
      }
      if (metrics.outputTokens !== null) {
        outputTokensTotal += metrics.outputTokens;
        outputUsageKnown += 1;
      }
      // No task query, description, source path, or API key is persisted in the report.
      rows.push({
        id: task.id,
        kind: task.kind,
        ...bm25Evidence,
        responseModel: metrics.model,
        expectedAnyOf: task.expectedAnyOf,
        selected: decision.selected,
        top5: returned,
        confidence: decision.confidence,
        selectedProbability: decision.selectedProbability,
        noneProbability: decision.noneProbability,
        escalationRecommended: decision.escalationRecommended,
        latencyMs: metrics.latencyMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
      });
    } catch (error) {
      failures += 1;
      const code = error?.code ?? "E_EVAL";
      const metrics = engine.getLastRequestMetrics();
      if (metrics) latencies.push(metrics.latencyMs);
      rows.push({
        id: task.id,
        kind: task.kind,
        ...bm25Evidence,
        ...(metrics
          ? {
              responseModel: metrics.model,
              latencyMs: metrics.latencyMs,
              inputTokens: metrics.inputTokens,
              outputTokens: metrics.outputTokens,
            }
          : {}),
        errorCode: code,
      });
      // Stop after one failure; do not retry a request with an uncertain billing outcome.
      break;
    }
  }

  const attempted = rows.length;
  const costRateComplete = inputRate !== null && outputRate !== null;
  const successful = attempted - failures;
  const usageComplete =
    failures === 0 &&
    inputUsageKnown === successful &&
    outputUsageKnown === successful &&
    successful > 0;
  const estimatedCostUsd =
    costRateComplete && usageComplete
      ? Number(
          ((inputTokensTotal * inputRate + outputTokensTotal * outputRate) / 1_000_000).toFixed(9),
        )
      : null;
  const report = {
    at: new Date().toISOString(),
    datasetVersion: dataset.version,
    labelStatus: dataset.labelStatus,
    catalogHash: catalogHash(catalog),
    catalogSkillCount: skills.length,
    apiHost: DEFAULT_API_HOST,
    requestedModel: model,
    responseModel: rows.find((row) => row.responseModel)?.responseModel ?? null,
    requestLimit: maxRequests,
    selectionStrategy: "deterministic-round-robin-by-kind|required,none,ambiguous",
    datasetTaskCounts: countKinds(dataset.cases),
    selectedTaskCounts: countKinds(selectedTasks),
    evaluatedTaskCounts: {
      required: counts.required.total,
      none: counts.none.total,
      ambiguous: counts.ambiguous.total,
    },
    requestsAttempted: attempted,
    successfulRequests: successful,
    failedRequests: failures,
    complete: attempted === selectedTasks.length && failures === 0,
    datasetComplete:
      selectedTasks.length === dataset.cases.length &&
      attempted === selectedTasks.length &&
      failures === 0,
    rows,
    metrics: {
      bm25: {
        required: {
          count: bm25Counts.required.total,
          hitAt1: ratio(bm25Counts.required.hitAt1, bm25Counts.required.total),
          recallAt5: ratio(bm25Counts.required.hitAt5, bm25Counts.required.total),
        },
        none: {
          count: bm25Counts.none.total,
          candidateReturnedRate: ratio(bm25Counts.none.candidateReturned, bm25Counts.none.total),
        },
        ambiguous: {
          count: bm25Counts.ambiguous.total,
          expectedRecallAt5: ratio(bm25Counts.ambiguous.expectedHitAt5, bm25Counts.ambiguous.total),
        },
        indexBuildLatencyMs: bm25BuildLatencyMs,
        queryLatencyMs: {
          p50: percentile(bm25Latencies, 0.5),
          p95: percentile(bm25Latencies, 0.95),
        },
        modelCalls: 0,
        estimatedCostUsd: 0,
        escalationRecommendationRate: null,
      },
      required: {
        count: counts.required.total,
        hitAt1: ratio(counts.required.hitAt1, counts.required.total),
        recallAt5: ratio(counts.required.hitAt5, counts.required.total),
      },
      none: {
        count: counts.none.total,
        correctNoneRate: ratio(counts.none.correctNone, counts.none.total),
        selectedCandidateRate: ratio(counts.none.selectedCandidate, counts.none.total),
      },
      ambiguous: {
        count: counts.ambiguous.total,
        expectedRecallAt5: ratio(counts.ambiguous.expectedHitAt5, counts.ambiguous.total),
      },
      latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
      escalationRecommendationRate: ratio(escalationRecommendedCount, successful),
      usage: {
        inputTokens: inputUsageKnown === attempted ? inputTokensTotal : null,
        outputTokens: outputUsageKnown === attempted ? outputTokensTotal : null,
        inputUsageKnown,
        outputUsageKnown,
      },
      cost: {
        estimatedUsd: estimatedCostUsd,
        inputUsdPerMillion: inputRate,
        outputUsdPerMillion: outputRate,
        status:
          failures > 0
            ? "unknown-after-failed-request"
            : estimatedCostUsd === null
              ? "not-estimated-rate-or-usage-missing"
              : "estimated-from-explicit-rates",
      },
    },
    notes:
      "Tasks are selected by deterministic round-robin across required, none, ambiguous, preserving source order within each kind; low request limits intentionally change class proportions. Metrics describe only selected/completed tasks, not population estimates. For every selected task the report compares Jev against local BM25 on the same catalog. Queries and Skill descriptions are sent to TypeSafe only after explicit opt-in; no Skill bodies, paths, or attachments are sent. Queries are not stored in the report. Reports still contain Skill names and dataset labels; keep private-catalog reports local. Draft labels do not define a release quality gate. escalationRecommendationRate is the model's flag rate, not observed human escalation. Cost is estimated only when explicit rates and complete API usage are supplied. One request failure stops the run; there are no retries.",
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.out) {
    const outputPath = path.resolve(options.out.trim());
    await writeReportAtomically(outputPath, serialized);
    console.log(JSON.stringify({ ok: report.complete, requestsAttempted: attempted, failures }));
  } else {
    process.stdout.write(serialized);
  }
  if (!report.complete) process.exitCode = 1;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function selectEvaluationTasks(tasks, limit) {
  const kinds = ["required", "none", "ambiguous"];
  const queues = new Map(kinds.map((kind) => [kind, tasks.filter((task) => task.kind === kind)]));
  const offsets = new Map(kinds.map((kind) => [kind, 0]));
  const selected = [];
  while (selected.length < limit) {
    let advanced = false;
    for (const kind of kinds) {
      const offset = offsets.get(kind);
      const task = queues.get(kind)?.[offset];
      if (!task) continue;
      selected.push(task);
      offsets.set(kind, offset + 1);
      advanced = true;
      if (selected.length === limit) break;
    }
    if (!advanced) break;
  }
  return selected;
}

function findMissingExpectedSkills(tasks, availableSkillNames) {
  return [
    ...new Set(
      tasks.flatMap((task) => task.expectedAnyOf.filter((name) => !availableSkillNames.has(name))),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

function elapsedMs(startedAt) {
  return Number((performance.now() - startedAt).toFixed(3));
}

async function evaluateBm25Baseline(router, task) {
  const startedAt = performance.now();
  const results = await router.query({ text: task.query, topK: 5 });
  return {
    top5: results.map((skill) => skill.name),
    latencyMs: elapsedMs(startedAt),
  };
}

async function writeReportAtomically(outputPath, serialized) {
  try {
    const existing = await lstat(outputPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw Object.assign(
        new Error("Report output must be a regular file, not a symlink or directory"),
        {
          code: "E_EVAL_OUTPUT",
        },
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.jev-eval-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, serialized, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, outputPath);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function preflightReportPath(outputPath) {
  const directory = path.dirname(outputPath);
  await mkdir(directory, { recursive: true });
  try {
    const existing = await lstat(outputPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw Object.assign(
        new Error("Report output must be a regular file, not a symlink or directory"),
        { code: "E_EVAL_OUTPUT" },
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const probe = path.join(directory, `.jev-eval-preflight-${randomUUID()}.tmp`);
  try {
    await writeFile(probe, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
  } finally {
    await rm(probe, { force: true });
  }
}

async function canonicalizePath(value) {
  let current = path.resolve(value);
  const missingSegments = [];
  while (true) {
    try {
      const existing = await realpath(current);
      return path.join(existing, ...missingSegments);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(path.basename(current));
      current = parent;
    }
  }
}

async function runCli() {
  try {
    await main();
  } catch (error) {
    // Never print arbitrary provider bodies or request data in a paid-evaluation failure.
    console.error(JSON.stringify({ ok: false, code: error?.code ?? "E_EVAL" }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}

export {
  evaluateBm25Baseline,
  findMissingExpectedSkills,
  preflightReportPath,
  selectEvaluationTasks,
  writeReportAtomically,
};
