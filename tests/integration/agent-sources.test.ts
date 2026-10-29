import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentSkillSources, loadHubConfig } from "@skill-hub/core";
import { skillInventorySummary } from "@skill-hub/router";

let root: string;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});

async function fixture() {
  root = await mkdtemp(path.join(tmpdir(), "skill-hub-agent-sources-"));
  vi.stubEnv("HOME", root);
  vi.stubEnv("DSH_HOME", path.join(root, "dsh-custom"));
  vi.stubEnv("XDG_CONFIG_HOME", path.join(root, "xdg"));
  vi.stubEnv("SKILL_HUB_HOME", path.join(root, "hub"));
  const configPath = path.join(root, "config.yaml");
  vi.stubEnv("SKILL_HUB_CONFIG", configPath);
  const raw = `version: 1
canonical_dir: ${root}/hub/skills
index_dir: ${root}/hub/index
backup_dir: ${root}/hub/backups
agents:
  - id: sandbox
    skills_dir: ${root}/target
    enabled: false
sources: []
`;
  await writeFile(configPath, raw);
  const config = await loadHubConfig();
  for (const source of agentSkillSources(config)) {
    await mkdir(path.join(source.path, source.id), { recursive: true });
    await writeFile(
      path.join(source.path, source.id, "SKILL.md"),
      `---\nname: ${source.id}\ndescription: synthetic source fixture\n---\n\nFixture.\n`,
    );
  }
  await writeFile(path.join(root, "dsh-custom/skills/flat.md"), "Not a directory Skill.\n");
  return { configPath, raw };
}

const cliEntry = path.resolve("apps/cli/dist/index.js");

function cli(...args: string[]) {
  return cliAt(process.cwd(), ...args);
}

function cliAt(cwd: string, ...args: string[]) {
  return JSON.parse(
    execFileSync(process.execPath, [cliEntry, "--json", ...args], {
      cwd,
      env: { ...process.env, SKILL_HUB_USAGE_LOG: "" },
      encoding: "utf8",
    }),
  );
}

describe("Agent Sources across inventory and explicit ingest", () => {
  it("exposes new sources from an unchanged legacy config in MCP/Web and CLI without writes", async () => {
    const { configPath, raw } = await fixture();
    const before = (await readdir(root, { recursive: true })).sort();
    const summary = await skillInventorySummary();
    expect(summary.agents).toEqual([]);
    expect(summary.sources).toHaveLength(10);
    expect(summary.sources.every((source) => source.exists && source.count === 1)).toBe(true);
    expect(summary.unionApprox).toBe(10);
    const report = cli("inventory", "--sources", "deepseek-harness,opencode");
    expect(report.sources.map((source: { id: string }) => source.id)).toEqual([
      "deepseek-harness",
      "opencode",
    ]);
    expect(report.union_count).toBe(2);
    expect((await skillInventorySummary({ agent: "deepseek-harness" })).sources).toHaveLength(1);
    expect((await skillInventorySummary({ scope: "project" })).sources).toEqual([]);
    expect(await readFile(configPath, "utf8")).toBe(raw);
    expect((await readdir(root, { recursive: true })).sort()).toEqual(before);
  });

  it("respects custom paths and disabling, reports missing roots, and only imports explicit ids", async () => {
    const { configPath, raw } = await fixture();
    const disabled = `${raw.replace("sources: []", "sources:")}
  - id: deepseek-harness
    path: ${root}/missing-custom
    scope: user
    enabled: true
  - id: opencode
    path: ${root}/xdg/opencode/skills
    scope: user
    enabled: false
`;
    await writeFile(configPath, disabled);
    const summary = await skillInventorySummary();
    expect(summary.sources.find((source) => source.id === "deepseek-harness")).toMatchObject({
      path: path.join(root, "missing-custom"),
      exists: false,
      count: 0,
    });
    expect(summary.sources.some((source) => source.id === "opencode")).toBe(false);
    await writeFile(configPath, raw);
    const before = (await readdir(root, { recursive: true })).sort();
    const preview = cli("ingest", "--sources", "deepseek-harness", "--dry-run");
    expect(preview.scanned).toBe(1);
    expect(preview.sources[0].sourceId).toBe("deepseek-harness");
    expect(preview.dryRun).toBe(true);
    expect(() => cli("ingest")).toThrow();
    expect((await readdir(root, { recursive: true })).sort()).toEqual(before);
  });

  it("ingests an explicitly selected built-in ID through its existing Agent path", async () => {
    const { configPath, raw } = await fixture();
    const agentSkills = path.join(root, "legacy-qoder-skills");
    await mkdir(path.join(agentSkills, "agent-qoder"), { recursive: true });
    await writeFile(
      path.join(agentSkills, "agent-qoder", "SKILL.md"),
      "---\nname: agent-qoder\ndescription: synthetic legacy Agent source\n---\n\nFixture.\n",
    );
    const withQoderAgent = raw.replace(
      "sources: []",
      `  - id: qoder\n    skills_dir: ${agentSkills}\n    enabled: true\nsources: []`,
    );
    await writeFile(configPath, withQoderAgent);

    const before = (await readdir(root, { recursive: true })).sort();
    const preview = cli("ingest", "--sources", "qoder", "--dry-run");

    expect(preview.sources).toEqual([{ requested: "qoder", path: agentSkills, sourceId: "qoder" }]);
    expect(preview.scanned).toBe(1);
    expect(preview.dryRun).toBe(true);
    expect((await readdir(root, { recursive: true })).sort()).toEqual(before);
  });

  it("keeps a disabled source mapping from falling back to a same-name CWD directory", async () => {
    const { configPath, raw } = await fixture();
    const disabledPath = path.join(root, "disabled-qoder-skills");
    await mkdir(disabledPath, { recursive: true });
    await mkdir(path.join(root, "qoder", "cwd-shadow"), { recursive: true });
    await writeFile(
      path.join(root, "qoder", "cwd-shadow", "SKILL.md"),
      "---\nname: cwd-shadow\ndescription: synthetic CWD shadow\n---\n\nFixture.\n",
    );
    const withDisabledQoder = raw.replace(
      "sources: []",
      `sources:\n  - id: qoder\n    path: ${disabledPath}\n    scope: user\n    enabled: false`,
    );
    await writeFile(configPath, withDisabledQoder);

    const preview = cliAt(root, "ingest", "--sources", "qoder", "--dry-run");

    expect(preview.sources).toEqual([
      { requested: "qoder", path: disabledPath, sourceId: "qoder" },
    ]);
    expect(preview.scanned).toBe(0);
  });
});
