import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseHubConfigYaml, readCatalog } from "@skill-hub/core";
import { runIngest } from "../../apps/cli/src/commands/ingest.js";

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const temporaryRoots: string[] = [];

describe("project fork and overlay provenance workflow", () => {
  it("registers a renamed fork as a source overlay without copying it into canonical", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skill-hub-overlay-workflow-"));
    temporaryRoots.push(root);
    const home = path.join(root, "hub");
    const canonical = path.join(home, "skills");
    const baseRoot = path.join(root, "base-source");
    const baseSkill = path.join(baseRoot, "guide-base");
    const forkRoot = path.join(root, "project-overlays", "guide-custom");
    await mkdir(baseSkill, { recursive: true });
    await writeFile(
      path.join(baseSkill, "SKILL.md"),
      "---\nname: guide-base\ndescription: Base guide workflow\n---\nBase instructions.\n",
      "utf8",
    );
    await mkdir(path.dirname(forkRoot), { recursive: true });
    await cp(baseSkill, forkRoot, { recursive: true });
    await writeFile(
      path.join(forkRoot, "SKILL.md"),
      "---\nname: guide-custom\ndescription: Project-specific guide workflow\n---\nCustomized instructions.\n",
      "utf8",
    );
    vi.stubEnv("SKILL_HUB_HOME", home);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const config = parseHubConfigYaml(`version: 1
canonical_dir: ${canonical}
index_dir: ${home}/index
backup_dir: ${home}/backups
sources:
  - id: base-source
    path: ${baseRoot}
    scope: user
    enabled: true
    source_type: local
    source_ref: upstream-guide
  - id: project-guide-overlay
    path: ${path.dirname(forkRoot)}
    scope: project
    enabled: true
    source_type: local
    source_ref: project-guide-overrides
    revision: project-revision-1
    overlay_of: guide-base
`);
    expect(config.sources?.[1]?.overlay_of).toBe("guide-base");

    const baseOptions = {
      json: true,
      sources: ["base-source"],
      dryRun: false,
      conflictMode: "report" as const,
      materialize: false,
      sourceMappings: config.sources,
      canonicalDir: canonical,
    };
    await runIngest(baseOptions);

    const overlayPreview = await runIngest({
      ...baseOptions,
      sources: ["project-guide-overlay"],
      dryRun: true,
    });
    expect(overlayPreview).toBe(0);
    const previewCatalog = await readCatalog(path.join(home, "catalog.json"));
    expect(previewCatalog.skills).not.toHaveProperty("guide-custom");
    await expect(
      readFile(path.join(canonical, "guide-custom", "SKILL.md"), "utf8"),
    ).rejects.toThrow();

    await runIngest({
      ...baseOptions,
      sources: ["project-guide-overlay"],
    });
    let catalog = await readCatalog(path.join(home, "catalog.json"));
    expect(catalog.skills["guide-custom"]).toMatchObject({
      path: forkRoot,
      provenance: {
        scope: "project",
        sourceType: "local",
        sourceRef: "project-guide-overrides",
        revision: "project-revision-1",
        overlayOf: "guide-base",
      },
    });
    const history = (await readFile(path.join(home, "history.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string; name: string; action?: string });
    expect(history).toContainEqual(
      expect.objectContaining({
        type: "overlay",
        name: "guide-custom",
        action: "create",
      }),
    );

    const movedRoot = path.join(root, "project-overlays-moved");
    await rename(path.dirname(forkRoot), movedRoot);
    expect(catalog.skills["guide-custom"]?.path).toBe(forkRoot);
    expect(config.sources?.[1]?.path).toBe(path.dirname(forkRoot));
    const movedMapping = { ...config.sources![1]!, path: movedRoot };
    await runIngest({
      ...baseOptions,
      sources: ["project-guide-overlay"],
      sourceMappings: [config.sources![0]!, movedMapping],
    });
    catalog = await readCatalog(path.join(home, "catalog.json"));
    expect(catalog.skills["guide-custom"]?.path).toBe(path.join(movedRoot, "guide-custom"));
    expect(catalog.skills["guide-custom"]?.provenance?.overlayOf).toBe("guide-base");
  });
});
