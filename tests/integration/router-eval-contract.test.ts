import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateDataset } from "../../scripts/check-router-eval.mjs";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const checker = path.join(repo, "scripts/check-router-eval.mjs");
const datasetPath = path.join(repo, "evals/router/recall.v1.json");

describe("router evaluation dataset CI contract", () => {
  it("accepts the generic 50-task draft dataset without a catalog or model service", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-eval-contract-"));
    try {
      const result = await exec(process.execPath, [checker, datasetPath], { cwd: root });
      const report = JSON.parse(result.stdout) as Record<string, unknown>;
      expect(report).toMatchObject({
        ok: true,
        dataClass: "synthetic-generic",
        labelStatus: "agent-authored draft; requires owner review",
        taskCount: 50,
        counts: { required: 30, none: 15, ambiguous: 5 },
        privacyHeuristicMatches: 0,
        retrievalQualityThresholdsApplied: false,
      });
      await expect(
        readFile(path.join(root, "outputs/router-recall-latest.json")),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("enforces the versioned v1 task count and class mix without a quality threshold", async () => {
    const dataset = JSON.parse(await readFile(datasetPath, "utf8"));

    const tooMany = structuredClone(dataset);
    tooMany.cases.push({ ...tooMany.cases[0], id: "extra-required" });
    const totalDrift = validateDataset(tooMany);
    expect(totalDrift.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["requires-exactly-50-tasks", "requires-exactly-30-required-tasks"]),
    );

    const tooFew = structuredClone(dataset);
    tooFew.cases.pop();
    const totalUnderflow = validateDataset(tooFew);
    expect(totalUnderflow.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining(["requires-exactly-50-tasks", "requires-exactly-5-ambiguous-tasks"]),
    );

    const skewed = structuredClone(dataset);
    const required = skewed.cases.find((task) => task.kind === "required");
    required.kind = "none";
    required.expectedAnyOf = [];
    const classDrift = validateDataset(skewed);
    expect(classDrift.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "requires-exactly-30-required-tasks",
        "requires-exactly-15-none-tasks",
      ]),
    );

    const missingRequiredLabel = structuredClone(dataset);
    const requiredWithoutLabel = missingRequiredLabel.cases.find(
      (task) => task.kind === "required",
    );
    requiredWithoutLabel.expectedAnyOf = [];
    const invalidLabel = validateDataset(missingRequiredLabel);
    expect(invalidLabel.counts).toEqual({ required: 30, none: 15, ambiguous: 5 });
    expect(invalidLabel.errors.map((error) => error.code)).toContain(
      "labeled-task-requires-skill-name",
    );

    const unsupportedVersion = validateDataset({ ...dataset, version: 2 });
    expect(unsupportedVersion.errors.map((error) => error.code)).toContain("unsupported-version");
    expect(unsupportedVersion.errors.map((error) => error.code)).not.toContain(
      "requires-exactly-50-tasks",
    );
  });

  it("makes an unsupported dataset contract version fail the CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-eval-version-"));
    try {
      const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
      dataset.version = 2;
      const file = path.join(root, "dataset-v2.json");
      await writeFile(file, JSON.stringify(dataset), "utf8");

      const result = await exec(process.execPath, [checker, file], { cwd: root }).catch(
        (error) => error,
      );
      expect(result.code).toBe(1);
      expect(String(result.stdout)).toContain("unsupported-version");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects structural errors and common exposed identifiers without printing task text", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-eval-invalid-"));
    try {
      const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as {
        cases: Array<Record<string, unknown>>;
      };
      dataset.cases[1]!.id = dataset.cases[0]!.id;
      dataset.cases[2]!.query = "Please contact person@example.invalid for details";
      const file = path.join(root, "dataset.json");
      await writeFile(file, JSON.stringify(dataset), "utf8");

      const result = await exec(process.execPath, [checker, file], { cwd: root }).catch(
        (error) => error,
      );
      expect(result.code).toBe(1);
      expect(String(result.stdout)).toContain("duplicate-id");
      expect(String(result.stdout)).toContain("possible-email-address");
      expect(String(result.stdout)).not.toContain("person@example.invalid");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects an undersized dataset and invalid none labels", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-eval-small-"));
    try {
      const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as {
        cases: Array<Record<string, unknown>>;
      };
      dataset.cases[0]!.kind = "none";
      dataset.cases = dataset.cases.slice(0, 29);
      const file = path.join(root, "dataset.json");
      await writeFile(file, JSON.stringify(dataset), "utf8");

      const result = await exec(process.execPath, [checker, file], { cwd: root }).catch(
        (error) => error,
      );
      expect(result.code).toBe(1);
      expect(String(result.stdout)).toContain("requires-at-least-30-tasks");
      expect(String(result.stdout)).toContain("none-task-must-not-have-skill-labels");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
