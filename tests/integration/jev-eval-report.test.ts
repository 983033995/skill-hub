import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { buildCatalog, writeCatalog } from "@skill-hub/core";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { preflightReportPath, writeReportAtomically } from "../../scripts/eval-router-jev.mjs";

const roots: string[] = [];
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const datasetPath = path.join(repoRoot, "evals/router/recall.v1.json");
const runnerPath = path.join(repoRoot, "scripts/eval-router-jev.mjs");
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("opt-in Jev evaluation report output", () => {
  it("previews full request payloads locally without reading credentials or calling fetch", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-jev-preview-"));
    roots.push(root);
    const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as {
      cases: Array<{ expectedAnyOf: string[]; query: string }>;
    };
    const skillNames = [...new Set(dataset.cases.flatMap((task) => task.expectedAnyOf))];
    const catalogPath = path.join(root, "catalog.json");
    await writeCatalog(
      catalogPath,
      buildCatalog(
        skillNames.map((name) => ({
          name,
          description: `Synthetic description for ${name}.`,
          path: `/synthetic/${name}`,
          hash: `sha256:${"0".repeat(64)}`,
          mtimeMs: 0,
          keywords: [name],
        })),
      ),
    );
    const guardPath = path.join(root, "preview-guards.mjs");
    await writeFile(
      guardPath,
      `const env = process.env;\nObject.defineProperty(process, "env", { configurable: true, get() { return new Proxy(env, { get(target, key, receiver) { if (key === "TYPESAFE_API_KEY" || key === "TYPESAFE_API_URL") throw new Error("forbidden config read"); return Reflect.get(target, key, receiver); } }); } });\nglobalThis.fetch = async () => { throw new Error("network access forbidden"); };\n`,
      "utf8",
    );
    const childEnv = {
      PATH: process.env.PATH ?? "",
      TYPESAFE_API_KEY: "preview-must-not-read",
      TYPESAFE_API_URL: "preview-must-not-read",
    };
    const baseArgs = [
      "--import",
      guardPath,
      runnerPath,
      "--preview",
      "--catalog",
      catalogPath,
      "--model",
      "jev-latest",
      "--max-requests",
      "3",
    ];

    const summary = execFileSync(process.execPath, baseArgs, {
      cwd: repoRoot,
      encoding: "utf8",
      env: childEnv,
    });
    expect(JSON.parse(summary)).toMatchObject({
      ok: true,
      mode: "local-payload-preview",
      requestsPreviewed: 3,
      fullPayloadWritten: false,
    });
    expect(summary).not.toContain(dataset.cases[0]?.query ?? "");
    expect(summary).not.toContain("Synthetic description");

    const previewPath = path.join(root, "private-preview.json");
    const privateSummary = execFileSync(
      process.execPath,
      [...baseArgs, "--preview-out", previewPath],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: childEnv,
      },
    );
    const preview = JSON.parse(await readFile(previewPath, "utf8")) as {
      requests: Array<{
        request: {
          state: { query: string };
          questions: { route: { criteria: Record<string, { description?: string }> } };
        };
      }>;
    };
    expect(JSON.parse(privateSummary).fullPayloadWritten).toBe(true);
    expect(preview.requests).toHaveLength(3);
    expect(preview.requests[0]?.request.state.query).toBeTruthy();
    expect(
      preview.requests[0]?.request.questions.route.criteria.__none_of_the_above__,
    ).toMatchObject({
      description: "None of the listed skills is a reasonable match for the task.",
    });
    expect(
      Object.values(preview.requests[0]?.request.questions.route.criteria ?? {}).some((candidate) =>
        candidate.description?.startsWith("Synthetic description for "),
      ),
    ).toBe(true);
    expect((await stat(previewPath)).mode & 0o777).toBe(0o600);
    expect(privateSummary).not.toContain(preview.requests[0]?.request.state.query ?? "");

    const catalogAlias = path.join(root, "catalog-alias");
    await symlink(root, catalogAlias, "dir");
    let aliasError: unknown;
    try {
      execFileSync(
        process.execPath,
        [...baseArgs, "--preview-out", path.join(catalogAlias, "catalog.json")],
        { cwd: repoRoot, encoding: "utf8", env: childEnv },
      );
    } catch (error) {
      aliasError = error;
    }
    expect(aliasError).toMatchObject({ status: 1 });
    expect(String((aliasError as { stderr?: string }).stderr)).toContain('"code":"E_EVAL_OUTPUT"');
    expect(JSON.parse(await readFile(catalogPath, "utf8")).version).toBe(1);
  });

  it("preflights the report directory and target before any model call", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-jev-preflight-"));
    roots.push(root);
    const reportPath = path.join(root, "new-directory", "report.json");

    await preflightReportPath(reportPath);

    expect(await readdir(path.dirname(reportPath))).toEqual([]);
    await expect(readFile(reportPath, "utf8")).rejects.toThrow();
  });

  it("atomically replaces only an explicit regular-file target with private mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-jev-report-"));
    roots.push(root);
    const reportPath = path.join(root, "nested", "report.json");

    await writeReportAtomically(reportPath, '{"version":1}\n');

    expect(await readFile(reportPath, "utf8")).toBe('{"version":1}\n');
    expect((await stat(reportPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(path.dirname(reportPath))).toEqual(["report.json"]);

    await writeReportAtomically(reportPath, '{"version":2}\n');
    expect(await readFile(reportPath, "utf8")).toBe('{"version":2}\n');
    expect(await readdir(path.dirname(reportPath))).toEqual(["report.json"]);
  });

  it("rejects symlink and directory output targets without changing the link target", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-jev-report-link-"));
    roots.push(root);
    const actual = path.join(root, "actual.json");
    const link = path.join(root, "report-link.json");
    const directory = path.join(root, "report-dir");
    await writeFile(actual, "protected\n", "utf8");
    await symlink(actual, link);
    await mkdir(directory);

    await expect(preflightReportPath(link)).rejects.toMatchObject({ code: "E_EVAL_OUTPUT" });
    await expect(preflightReportPath(directory)).rejects.toMatchObject({ code: "E_EVAL_OUTPUT" });

    await expect(writeReportAtomically(link, "replacement\n")).rejects.toMatchObject({
      code: "E_EVAL_OUTPUT",
    });
    await expect(writeReportAtomically(directory, "replacement\n")).rejects.toMatchObject({
      code: "E_EVAL_OUTPUT",
    });
    expect(await readFile(actual, "utf8")).toBe("protected\n");
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readdir(root)).toEqual(["actual.json", "report-dir", "report-link.json"]);
  });
});
