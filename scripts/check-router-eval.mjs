#!/usr/bin/env node
/** Validate the checked-in generic router evaluation dataset without reading a Skill catalog. */
import console from "node:console";
import process from "node:process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = path.resolve(process.argv[2] ?? path.join(repo, "evals/router/recall.v1.json"));

const privacyPatterns = [
  { id: "unix-home-path", pattern: /(?:^|[\s"'=])\/(?:Users|home)\/[^\s/]+/i },
  { id: "windows-user-path", pattern: /\b[A-Za-z]:[\\/](?:Users|home)[\\/][^\s\\/]+/i },
  { id: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  {
    id: "credential-token",
    pattern:
      /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-glm5-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{24,})\b/,
  },
  {
    id: "credential-assignment",
    pattern:
      /\b(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
  },
];

// Freeze the checked-in v1 sampling mix; a different composition needs a new contract version.
const datasetContracts = new Map([
  [1, { taskCount: 50, counts: { required: 30, none: 15, ambiguous: 5 } }],
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateDataset(dataset) {
  const errors = [];
  const add = (pathValue, code) => errors.push({ path: pathValue, code });

  if (!isRecord(dataset)) {
    return { ok: false, errors: [{ path: "$", code: "root-must-be-object" }] };
  }
  const contract = datasetContracts.get(dataset.version);
  if (!contract) add("version", "unsupported-version");
  const rootKeys = new Set(["version", "dataClass", "labelStatus", "notes", "cases"]);
  for (const key of Object.keys(dataset)) {
    if (!rootKeys.has(key)) add(key, "unknown-root-field");
  }
  if (dataset.dataClass !== "synthetic-generic") add("dataClass", "must-be-synthetic-generic");
  if (typeof dataset.labelStatus !== "string" || !dataset.labelStatus.trim()) {
    add("labelStatus", "required-nonempty-string");
  }
  if (typeof dataset.notes !== "string" || !dataset.notes.trim()) {
    add("notes", "required-nonempty-string");
  }
  if (!Array.isArray(dataset.cases)) {
    add("cases", "must-be-array");
    return { ok: false, errors };
  }
  if (dataset.cases.length < 30) add("cases", "requires-at-least-30-tasks");
  if (contract && dataset.cases.length !== contract.taskCount) {
    add("cases", `requires-exactly-${contract.taskCount}-tasks`);
  }

  const ids = new Set();
  const counts = { required: 0, none: 0, ambiguous: 0 };
  dataset.cases.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!isRecord(item)) {
      add(prefix, "task-must-be-object");
      return;
    }
    const allowedKeys = new Set(["id", "query", "kind", "expectedAnyOf"]);
    for (const key of Object.keys(item)) {
      if (!allowedKeys.has(key)) add(`${prefix}.${key}`, "unknown-field");
    }
    if (typeof item.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id)) {
      add(`${prefix}.id`, "invalid-id");
    } else if (ids.has(item.id)) {
      add(`${prefix}.id`, "duplicate-id");
    } else {
      ids.add(item.id);
    }
    if (typeof item.query !== "string" || !item.query.trim() || item.query.length > 500) {
      add(`${prefix}.query`, "query-must-be-1-to-500-characters");
    }
    if (!Object.hasOwn(counts, item.kind)) {
      add(`${prefix}.kind`, "unknown-kind");
    } else {
      counts[item.kind] += 1;
    }
    if (!Array.isArray(item.expectedAnyOf)) {
      add(`${prefix}.expectedAnyOf`, "must-be-array");
    } else {
      if (item.expectedAnyOf.some((name) => typeof name !== "string")) {
        add(`${prefix}.expectedAnyOf`, "entries-must-be-strings");
      } else {
        if (new Set(item.expectedAnyOf).size !== item.expectedAnyOf.length) {
          add(`${prefix}.expectedAnyOf`, "duplicate-skill-name");
        }
        if (item.expectedAnyOf.some((name) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))) {
          add(`${prefix}.expectedAnyOf`, "invalid-skill-name");
        }
        if (item.kind === "none" && item.expectedAnyOf.length !== 0) {
          add(`${prefix}.expectedAnyOf`, "none-task-must-not-have-skill-labels");
        }
        if (
          (item.kind === "required" || item.kind === "ambiguous") &&
          item.expectedAnyOf.length === 0
        ) {
          add(`${prefix}.expectedAnyOf`, "labeled-task-requires-skill-name");
        }
      }
    }
  });

  if (!counts.required) add("cases", "requires-required-task");
  if (!counts.none) add("cases", "requires-none-task");
  if (!counts.ambiguous) add("cases", "requires-ambiguous-task");
  if (contract) {
    for (const [kind, expectedCount] of Object.entries(contract.counts)) {
      if (counts[kind] !== expectedCount) {
        add("cases", `requires-exactly-${expectedCount}-${kind}-tasks`);
      }
    }
  }

  const strings = [];
  const collectStrings = (value, keyPath) => {
    if (typeof value === "string") strings.push([keyPath, value]);
    else if (Array.isArray(value))
      value.forEach((entry, index) => collectStrings(entry, `${keyPath}[${index}]`));
    else if (isRecord(value)) {
      for (const [key, entry] of Object.entries(value)) collectStrings(entry, `${keyPath}.${key}`);
    }
  };
  collectStrings(dataset, "$");
  for (const [keyPath, value] of strings) {
    for (const { id, pattern } of privacyPatterns) {
      if (pattern.test(value)) add(keyPath, `possible-${id}`);
    }
  }

  return {
    ok: errors.length === 0,
    version: dataset.version,
    dataClass: dataset.dataClass,
    labelStatus: dataset.labelStatus,
    taskCount: dataset.cases.length,
    counts,
    privacyHeuristicMatches: errors.filter((error) => error.code.startsWith("possible-")).length,
    retrievalQualityThresholdsApplied: false,
    notes:
      "Static privacy patterns do not prove semantic anonymity. Draft labels are validated structurally only; no catalog, model API, or paid service is used.",
    errors,
  };
}

async function main() {
  let dataset;
  try {
    dataset = JSON.parse(await readFile(datasetPath, "utf8"));
  } catch (error) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          datasetPath,
          errors: [{ path: "$", code: "cannot-read-or-parse-json", message: error.message }],
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const result = validateDataset(dataset);
  console.log(JSON.stringify({ datasetPath, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}

export { validateDataset };
