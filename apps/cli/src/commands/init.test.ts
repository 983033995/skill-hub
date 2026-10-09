import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHubConfigYaml } from "@skill-hub/core";
import { runInit } from "./init.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isolated init", () => {
  it("keeps generated data paths in SKILL_HUB_HOME and preserves an existing config", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-init-"));
    vi.stubEnv("SKILL_HUB_HOME", root);
    vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await runInit({ json: true, force: false });
      const raw = await readFile(path.join(root, "config.yaml"), "utf8");
      const config = parseHubConfigYaml(raw);
      expect(config.canonical_dir).toBe(path.join(root, "skills"));
      expect(config.index_dir).toBe(path.join(root, "index"));
      expect(config.backup_dir).toBe(path.join(root, "backups"));
      await runInit({ json: true, force: false });
      expect(await readFile(path.join(root, "config.yaml"), "utf8")).toBe(raw);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
