/** Live, opt-in comparison of two Hub-only MCP profiles. Uses synthetic Skills only. */
import console from "node:console";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog, scanSkills, writeCatalog } from "../packages/core/dist/index.js";

const model = process.argv[2];
if (!model)
  throw new Error("Specify one provider/model explicitly; this benchmark makes paid model calls.");
if (!process.env.OPENCODE_NATIVE_BIN) {
  throw new Error("Set OPENCODE_NATIVE_BIN to the native OpenCode binary to avoid wrapper recursion.");
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = await mkdtemp(path.join(tmpdir(), "hub-runtime-usage-"));
const hub = path.join(root, "hub");
const marker = `PROOF-${randomUUID()}`;
for (let i = 0; i < 100; i++) {
  const name = i === 0 ? "arithmetic-proof" : `distractor-${i}`;
  const dir = path.join(hub, "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${i === 0 ? "Arithmetic verification: add values and report the proof marker. 求和验证并报告标记。" : `Synthetic illustration layout task ${i}`}\n---\n` +
      (i === 0
        ? `For the requested arithmetic verification, add 137 and 286; include marker ${marker}. Only read Hub files; do not execute anything.`
        : "Synthetic unrelated instructions."),
  );
}
await writeCatalog(
  path.join(hub, "catalog.json"),
  buildCatalog(await scanSkills(path.join(hub, "skills"))),
);
await writeFile(
  path.join(hub, "config.yaml"),
  `version: 1\ncanonical_dir: ${hub}/skills\nindex_dir: ${hub}/index\nrouter:\n  engine: bm25\n  top_k: 5\n`,
);
const report = {
  at: new Date().toISOString(),
  model,
  syntheticSkillCount: 100,
  cases: [],
  nativeModeCompared: false,
  initialContextTokens: null,
  notes:
    "Same pinned model, task prompts, synthetic library and non-Skill tool settings. Compares full/runtime Hub-only profiles, not Native/Hybrid/Hub-only. Usage is provider-reported, not a Skill-only context breakdown or billing guarantee. One run per task/profile is a pilot, not a quality or savings benchmark.",
};
const tasks = [
  {
    id: "specialized",
    prompt:
      "完成求和验收：从 Skill Hub 寻找求和验证的相关技能，读取说明并报告其中的验收标记与计算结果。只用Hub读取工具，不执行任何脚本。",
    expected: [marker, "423"],
  },
  { id: "ordinary", prompt: "只计算 2 + 2，回答结果。", expected: ["4"] },
];
const output = path.join(repo, "outputs", "opencode-runtime-comparison-latest.json");
await mkdir(path.dirname(output), { recursive: true });
try {
  for (const mode of ["full", "runtime"])
    for (const task of tasks) {
      console.log(JSON.stringify({ mode, task: task.id, status: "started" }));
      const project = await mkdtemp(path.join(root, "project-"));
      const start = Date.now();
      const run = promisify(execFile)(
        process.execPath,
        [
          path.join(repo, "scripts/opencode-hub.mjs"),
          "--hub-home",
          hub,
          "--mcp-mode",
          mode,
          "run",
          "--model",
          model,
          "--dir",
          project,
          "--format",
          "json",
          task.prompt,
        ],
        { cwd: repo, maxBuffer: 16 * 1024 * 1024, timeout: 180000 },
      );
      run.child.stdin.end();
      const { stdout } = await run;
      const events = stdout
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line));
      const calls = events.filter((event) => event.type === "tool_use").map((event) => event.part);
      const tools = calls.map((call) => call.tool);
      const answer = events
        .filter((event) => event.type === "text")
        .map((event) => event.part.text)
        .join("\n");
      const usage = events
        .filter((event) => event.type === "step_finish")
        .map((event) => ({ tokens: event.part.tokens ?? null, cost: event.part.cost ?? null }));
      const passed =
        !events.some((event) => event.type === "error") &&
        task.expected.every((value) => answer.includes(value)) &&
        calls.every(
          (call) => call.tool.startsWith("skill-hub_") && call.state.status === "completed",
        ) &&
        (task.id !== "specialized" ||
          (tools.includes("skill-hub_skill_search") &&
            tools.includes(mode === "runtime" ? "skill-hub_skill_read" : "skill-hub_skill_fetch")));
      report.cases.push({
        mode,
        task: task.id,
        passed,
        tools,
        answer,
        elapsedMs: Date.now() - start,
        usage,
      });
      await writeFile(output, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ mode, task: task.id, passed, tools, usage }));
    }
} catch (err) {
  // Keep partial evidence, never dump provider credentials or command stderr.
  report.error = String(err.message).split("\n")[0];
} finally {
  report.ok =
    !report.error && report.cases.length === 4 && report.cases.every((item) => item.passed);
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, model, output, error: report.error ?? null }));
  process.exitCode = report.ok ? 0 : 1;
}
