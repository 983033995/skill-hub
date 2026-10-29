import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildCatalog, writeCatalog } from "@skill-hub/core";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const roots: string[] = [];
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const datasetPath = path.join(repo, "evals/router/recall.v1.json");
const evaluator = path.join(repo, "scripts/eval-router.mjs");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("offline router evaluation report output", () => {
  it("rejects reports that alias the catalog or dataset before reading or writing either", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-offline-eval-guard-"));
    roots.push(root);
    const catalogPath = path.join(root, "catalog.json");
    const catalogBefore = "protected-catalog-fixture\n";
    await writeFile(catalogPath, catalogBefore, "utf8");
    const datasetBefore = await readFile(datasetPath, "utf8");
    const aliasDirectory = path.join(root, "dataset-alias");
    await symlink(path.dirname(datasetPath), aliasDirectory, "dir");

    const sameCatalog = await exec(process.execPath, [evaluator, catalogPath, catalogPath], {
      cwd: root,
    }).catch((error) => error);
    expect(sameCatalog.code).toBe(1);
    expect(String(sameCatalog.stderr)).toContain("must not overwrite an input file");
    expect(await readFile(catalogPath, "utf8")).toBe(catalogBefore);

    const datasetAlias = path.join(aliasDirectory, path.basename(datasetPath));
    const sameDataset = await exec(
      process.execPath,
      [evaluator, path.join(root, "missing.json"), datasetAlias],
      {
        cwd: root,
      },
    ).catch((error) => error);
    expect(sameDataset.code).toBe(1);
    expect(String(sameDataset.stderr)).toContain("must not overwrite an input file");
    expect(await readFile(datasetPath, "utf8")).toBe(datasetBefore);
  });

  it("rejects symlink targets and permits replacement of an ordinary report file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-offline-eval-report-"));
    roots.push(root);
    const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as {
      cases: Array<{ expectedAnyOf: string[] }>;
    };
    const names = [...new Set(dataset.cases.flatMap((task) => task.expectedAnyOf))];
    const catalogPath = path.join(root, "catalog.json");
    await writeCatalog(
      catalogPath,
      buildCatalog(
        names.map((name) => ({
          name,
          description: `Synthetic description for ${name}.`,
          path: `/synthetic/${name}`,
          hash: `sha256:${"0".repeat(64)}`,
          mtimeMs: 0,
          keywords: [name],
        })),
      ),
    );

    const symlinkTarget = path.join(root, "protected-report-target.json");
    const symlinkPath = path.join(root, "report-link.json");
    await writeFile(symlinkTarget, "protected-target\n", "utf8");
    await symlink(symlinkTarget, symlinkPath);
    const symlinkResult = await exec(process.execPath, [evaluator, catalogPath, symlinkPath], {
      cwd: root,
    }).catch((error) => error);
    expect(symlinkResult.code).toBe(1);
    expect(String(symlinkResult.stderr)).toContain("regular file");
    expect(await readFile(symlinkTarget, "utf8")).toBe("protected-target\n");
    expect((await lstat(symlinkPath)).isSymbolicLink()).toBe(true);

    const reportPath = path.join(root, "report.json");
    await writeFile(reportPath, "previous report\n", "utf8");
    await exec(process.execPath, [evaluator, catalogPath, reportPath], { cwd: root });
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      mode: string;
      variants: unknown[];
    };
    expect(report).toMatchObject({ mode: "offline-bm25-only" });
    expect(report.variants).toHaveLength(3);
  });
});
