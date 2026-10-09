import { readFile } from "node:fs/promises";
import path from "node:path";
import { catalogHash, type Catalog } from "@skill-hub/core";
import { SkillHubError, resolveAbsolutePath } from "@skill-hub/shared";
import { Bm25Router } from "./bm25.js";
import type { Bm25IndexArtifact, IndexMeta } from "./types.js";

export const BM25_ARTIFACT_FILENAME = "bm25.json";

export interface IndexInspection {
  fresh: boolean;
  reason: string;
  meta: IndexMeta | null;
  artifactPath: string | null;
  router: Bm25Router | null;
}

/** 读取 freshness marker 和可加载 BM25 artifact。损坏时显式返回 stale 原因。 */
export async function inspectBm25Index(options: {
  indexDir: string;
  catalog: Catalog | null;
}): Promise<IndexInspection> {
  const indexDir = resolveAbsolutePath(options.indexDir);
  const metaPath = path.join(indexDir, "index-meta.json");
  let meta: IndexMeta;
  try {
    meta = assertIndexMeta(JSON.parse(await readFile(metaPath, "utf8")) as unknown);
  } catch (err) {
    return {
      fresh: false,
      reason: `索引元数据不存在、无效或不可读: ${metaPath}${err instanceof Error ? `（${err.message}）` : ""}`,
      meta: null,
      artifactPath: null,
      router: null,
    };
  }

  const currentHash = options.catalog ? catalogHash(options.catalog) : null;
  if (meta.engine !== "bm25") {
    return {
      fresh: false,
      reason: `索引 engine=${String(meta.engine)}，当前只支持加载 bm25 artifact`,
      meta,
      artifactPath: null,
      router: null,
    };
  }
  if (!currentHash) {
    return {
      fresh: false,
      reason: "catalog 不可用，无法确认索引 freshness；请先 ingest/index",
      meta,
      artifactPath: null,
      router: null,
    };
  }
  if (!meta.catalogHash) {
    return {
      fresh: false,
      reason: "index-meta.json 缺少 catalogHash；请运行 index --rebuild",
      meta,
      artifactPath: null,
      router: null,
    };
  }
  if (meta.catalogHash !== currentHash) {
    return {
      fresh: false,
      reason: "catalogHash 与索引不一致；请运行 index --rebuild",
      meta,
      artifactPath: null,
      router: null,
    };
  }

  const artifactPath = path.join(indexDir, meta.artifact ?? BM25_ARTIFACT_FILENAME);
  try {
    const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as Bm25IndexArtifact;
    const router = Bm25Router.fromArtifact(artifact);
    if (meta.skillCount !== router.toArtifact().docs.length) {
      throw new Error(
        `skillCount 不一致（meta=${meta.skillCount}, artifact=${router.toArtifact().docs.length}）`,
      );
    }
    return {
      fresh: true,
      reason: "catalogHash 匹配且 BM25 artifact 可加载",
      meta,
      artifactPath,
      router,
    };
  } catch (err) {
    return {
      fresh: false,
      reason: `BM25 artifact 不可加载；请运行 index --rebuild（${err instanceof Error ? err.message : String(err)}）`,
      meta,
      artifactPath,
      router: null,
    };
  }
}

export function assertIndexMeta(value: unknown): IndexMeta {
  if (!value || typeof value !== "object") {
    throw new SkillHubError({ code: "E_INDEX", message: "index-meta.json 根必须是对象" });
  }
  const meta = value as Partial<IndexMeta>;
  if (typeof meta.engine !== "string" || typeof meta.builtAt !== "string") {
    throw new SkillHubError({ code: "E_INDEX", message: "index-meta.json 缺少 engine/builtAt" });
  }
  return meta as IndexMeta;
}
