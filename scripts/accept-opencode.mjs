#!/usr/bin/env node
import process from "node:process";
import console from "node:console";
/** Real model acceptance. Uses a synthetic Hub; optionally loads one existing real Skill. */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const exec = promisify(execFile);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const model = process.argv[2];
const realSkill = process.argv[3];
await mkdir(path.join(repo, "outputs"), { recursive: true });
const root = await mkdtemp(path.join(repo, "outputs/opencode-real-"));
const hub = path.join(root, "hub");
const project = path.join(root, "project");
const source = path.join(root, "source/hub-proof");
await mkdir(path.join(source, "references"), { recursive: true });
await mkdir(project);
const marker = randomUUID();
const skillBody =
  "---\nname: hub-proof\ndescription: Arithmetic transport verification. 求和验证并读取验收标记。\n---\nUse Skill Hub to read references/proof.txt, sum the two values, and include its marker in your answer. Do not use native skill, shell or direct filesystem reads.\n";
await writeFile(path.join(source, "SKILL.md"), skillBody);
await writeFile(
  path.join(source, "references/proof.txt"),
  `Marker: ${marker}\nValues: 137 and 286\n`,
);
const tail = `END-${randomUUID()}`;
await writeFile(path.join(source, "references/long.txt"), "中英🙂分页文本\n".repeat(7000) + tail);
const cli = async (...args) =>
  JSON.parse(
    (
      await exec(process.execPath, [path.join(repo, "apps/cli/dist/index.js"), ...args, "--json"], {
        env: { ...process.env, SKILL_HUB_HOME: hub },
        maxBuffer: 8 * 1024 * 1024,
      })
    ).stdout,
  );
const report = {
  at: new Date().toISOString(),
  root,
  model: model ?? "provider-default",
  checks: [],
  cases: [],
};
const check = (name, ok) => {
  report.checks.push({ name, ok });
};
const preview = await cli("install", source);
check("install defaults to dry-run", preview.dryRun === true);
await cli("install", source, "--apply", "--yes");
check(
  "managed install present",
  (await cli("list")).items.some((x) => x.name === "hub-proof" && x.status === "present"),
);

const launch = (args, useHub = hub) => {
  const run = exec(
    process.execPath,
    [path.join(repo, "scripts/opencode-hub.mjs"), "--hub-home", useHub, ...args],
    { cwd: project, maxBuffer: 16 * 1024 * 1024 },
  );
  // OpenCode reads piped stdin before starting: an unused open pipe waits forever.
  run.child.stdin.end();
  return run;
};
const agent = JSON.parse((await launch(["debug", "agent", "build"])).stdout);
check("native skill tool disabled", agent.tools.skill === false);
check(
  "no discovered disk Skill permissions",
  !agent.permission.some(
    (p) => p.permission === "external_directory" && /\/skills?\//.test(p.pattern),
  ),
);
const discovered = JSON.parse((await launch(["debug", "skill"])).stdout);
check(
  "zero installed native Skills discovered",
  discovered.every((s) => s.location === "<built-in>"),
);
report.native = {
  skillTool: agent.tools.skill,
  discovered: discovered.map((s) => ({ name: s.name, location: s.location })),
};
const scenario = async (name, prompt, expectedTools, expectedText, useHub) => {
  console.log(JSON.stringify({ name, status: "started" }));
  const result = await launch(
    ["run", "--dir", project, "--format", "json", ...(model ? ["--model", model] : []), prompt],
    useHub,
  );
  const events = result.stdout
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  const calls = events.filter((e) => e.type === "tool_use").map((e) => e.part);
  const answer = events
    .filter((e) => e.type === "text")
    .map((e) => e.part.text)
    .join("\n");
  const item = {
    name,
    session: events.find((e) => e.sessionID)?.sessionID,
    tools: calls.map((c) => c.tool),
    answer,
    passed:
      !events.some((e) => e.type === "error") &&
      calls.every(
        (c) =>
          c.tool.startsWith("skill-hub_") && (c.state.status === "completed" || name === "errors"),
      ) &&
      expectedTools.every((t) => calls.some((c) => c.tool === `skill-hub_${t}`)) &&
      expectedText.every((t) => answer.includes(t)),
  };
  // Fixtures are synthetic; for a real Skill persist tool names/inputs only, not its body.
  await writeFile(
    path.join(root, `${name}.json`),
    JSON.stringify(
      {
        ...item,
        calls: calls.map((c) => ({
          tool: c.tool,
          input: c.state.input,
          status: c.state.status,
          ...(useHub ? {} : { output: c.state.output, error: c.state.error }),
        })),
      },
      null,
      2,
    ),
  );
  report.cases.push(item);
  console.log(JSON.stringify({ name, passed: item.passed, tools: item.tools }));
  return { calls, answer };
};
try {
  await scenario(
    "exact-attachment",
    "使用 Skill Hub 的 hub-proof 技能完成验证。只能通过 Hub 工具读取内容。",
    ["skill_fetch", "skill_read"],
    [marker, "423"],
  );
  await scenario(
    "search-load",
    "请在 Skill Hub 中寻找能做 arithmetic transport 求和验证的技能，然后按它的内容完成验证。不要使用原生文件工具。",
    ["skill_search", "skill_fetch", "skill_read"],
    [marker, "423"],
  );
  await scenario(
    "content-auto-route",
    "完成这个任务：读取验收标记，并计算 137 和 286 的和。不要假设或询问技能名称，不要使用原生文件工具。",
    ["skill_search", "skill_fetch", "skill_read"],
    [marker, "423"],
  );
  await scenario(
    "browse",
    "通过 Skill Hub 列出全部已登记技能的名称和用途。",
    ["skill_list"],
    ["hub-proof"],
  );
  const paged = await scenario(
    "pagination",
    "通过 Skill Hub 读取 hub-proof 的 references/long.txt。先以 max_chars=100 读取，取得 totalChars 后再读取最后100个字符，报告末尾 END- 标记。只用 Hub 工具。",
    ["skill_read"],
    [tail],
  );
  check(
    "long file resumed at a nonzero offset",
    paged.calls.some((c) => c.tool === "skill-hub_skill_read" && c.state.input.offset > 50000),
  );
  const errors = await scenario(
    "errors",
    "通过 Skill Hub 尝试读取不存在的 __hub_missing_acceptance__，再尝试读取 hub-proof 的 ../outside.txt。只报告实际错误，不用其它工具。",
    ["skill_read"],
    [],
  );
  check(
    "missing and traversal produce errors",
    errors.calls.some(
      (c) =>
        c.state.input.name === "__hub_missing_acceptance__" &&
        /E_NOT_FOUND/.test(c.state.error ?? c.state.output ?? ""),
    ) &&
      errors.calls.some(
        (c) =>
          c.state.input.file === "../outside.txt" &&
          /E_PATH/.test(c.state.error ?? c.state.output ?? ""),
      ),
  );
  const updated = `UPDATED-${randomUUID()}`;
  await writeFile(
    path.join(source, "references/proof.txt"),
    `Marker: ${updated}\nValues: 20 and 22\n`,
  );
  await cli("update", "hub-proof", "--apply", "--yes");
  await scenario(
    "updated-new-session",
    "使用 Skill Hub 的 hub-proof 技能完成验证，只使用 Hub 工具。",
    ["skill_fetch", "skill_read"],
    [updated, "42"],
  );
  if (realSkill) {
    const { homedir } = await import("node:os");
    await scenario(
      "real-skill",
      `从 Skill Hub 加载 ${realSkill}，按其要求改写这句中文：我们将深入探索这一领域，赋能团队并打造全新生态。仅输出改写结果；只使用 Hub 工具。`,
      ["skill_fetch"],
      [],
      process.env.SKILL_HUB_HOME ?? path.join(homedir(), ".skill-hub"),
    );
  }
} catch (err) {
  report.error = String(err.message).split("\n")[0];
} finally {
  report.ok =
    !report.error &&
    report.checks.every((c) => c.ok) &&
    report.cases.length >= 6 &&
    report.cases.every((c) => c.passed);
  await writeFile(path.join(root, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(
    path.join(repo, "outputs/opencode-acceptance-latest.json"),
    JSON.stringify({ root, report: path.join(root, "report.json"), ok: report.ok }),
  );
  console.log(
    JSON.stringify(
      {
        ok: report.ok,
        checks: report.checks,
        error: report.error,
        report: path.join(root, "report.json"),
      },
      null,
      2,
    ),
  );
  process.exitCode = report.ok ? 0 : 1;
}
