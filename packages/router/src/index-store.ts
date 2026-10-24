import { open, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { catalogHash, sha256Content, type Catalog, type CatalogSkillEntry } from "@skill-hub/core";
import { SkillHubError, isPathInside, resolveAbsolutePath } from "@skill-hub/shared";
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
    // catalogHash 只证明两份元数据一致；文件可能已经被用户更新。
    // 只校验 SKILL.md，不扫描/执行附件，也不把正文放进检索索引。
    const entries = Object.values(options.catalog!.skills);
    const drifted: string[] = [];
    for (let start = 0; start < entries.length; start += 16) {
      const batch = await Promise.all(
        entries
          .slice(start, start + 16)
          .map(async (entry) => ((await skillContentMatches(entry)) ? null : entry.name)),
      );
      drifted.push(...batch.filter((name): name is string => name !== null));
    }
    if (drifted.length) {
      return {
        fresh: false,
        reason: `SKILL.md 内容变化、缺失或不可安全读取（${drifted.length}项：${drifted.slice(0, 8).join(", ")}）；请运行 index --rebuild 刷新 catalog/索引`,
        meta,
        artifactPath,
        router: null,
      };
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

async function skillContentMatches(entry: CatalogSkillEntry): Promise<boolean> {
  try {
    const root = await realpath(entry.path);
    const file = await realpath(path.join(entry.path, "SKILL.md")).catch(
      (err: NodeJS.ErrnoException) => {
        if (err.code !== "ENOENT") throw err;
        return realpath(path.join(entry.path, "skill.md"));
      },
    );
    if (!isPathInside(file, root)) return false;
    const handle = await open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await handle.stat();
      if (!before.isFile() || before.size > 10 * 1024 * 1024) return false;
      const buffer = Buffer.alloc(before.size + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await handle.read(buffer, length, buffer.length - length, null);
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      const after = await handle.stat();
      return (
        length === before.size &&
        after.size === before.size &&
        after.mtimeMs === before.mtimeMs &&
        sha256Content(buffer.subarray(0, length)) === entry.hash
      );
    } finally {
      await handle.close();
    }
  } catch {
    // 不把路径/内容泄露到错误详情；fresh=false 是显式失败信号。
    return false;
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
