/**
 * 外部路由引擎适配层（桩 + 可选命令协议）。
 * 失败时应由 createRouterEngine 降级到 bm25。
 */

import type { SkillMeta } from "@skill-hub/core";
import type { RankedSkill, RouteQuery, RouterEngine } from "./types.js";
import { SkillHubError } from "@skill-hub/shared";

export interface ExternalEngineOptions {
  /** 引擎 id，如 external-asf / external-neuro */
  engineId: string;
  /**
   * 可选：可执行协议。
   * 期望 stdout JSON：`{ results: [{ name, score?, reasons? }] }`
   * stdin 传入 JSON：`{ query, topK, skills: [{name,description,keywords}] }`
   * 未配置时 build/query 显式抛错，触发降级。
   */
  command?: string;
  args?: string[];
}

/**
 * 外部引擎适配器。
 * - 无 command：不可用，query 抛 E_INDEX 降级
 * - 有 command：spawn 一次查询（v0.1 简单协议）
 */
export class ExternalRouterEngine implements RouterEngine {
  readonly engineId: string;
  private skills: SkillMeta[] = [];
  private readonly command?: string;
  private readonly args: string[];

  constructor(options: ExternalEngineOptions) {
    this.engineId = options.engineId;
    this.command = options.command;
    this.args = options.args ?? [];
  }

  async build(skills: SkillMeta[]): Promise<void> {
    this.skills = skills;
  }

  async query(q: RouteQuery): Promise<RankedSkill[]> {
    if (!this.command) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: `外部引擎 ${this.engineId} 未配置 command（设置 SKILL_HUB_EXTERNAL_ENGINE_CMD）`,
        details: { engineId: this.engineId },
      });
    }

    const payload = {
      query: q.text,
      topK: q.topK ?? 5,
      profile: q.profile ?? null,
      skills: this.skills.map((s) => ({
        name: s.name,
        description: s.description,
        keywords: s.keywords ?? [],
        path: s.path,
        provenance: s.provenance ?? null,
      })),
    };

    const { spawn } = await import("node:child_process");
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(this.command!, this.args, {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => {
        stdout += d.toString("utf8");
      });
      child.stderr.on("data", (d: Buffer) => {
        stderr += d.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new SkillHubError({
              code: "E_INDEX",
              message: `外部引擎退出码 ${code}: ${stderr.slice(0, 400)}`,
              details: { engineId: this.engineId, code },
            }),
          );
          return;
        }
        resolve(stdout);
      });
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    });

    let parsed: { results?: Array<{ name: string; score?: number; reasons?: string[] }> };
    try {
      parsed = JSON.parse(result) as typeof parsed;
    } catch (err) {
      throw new SkillHubError({
        code: "E_INDEX",
        message: `外部引擎输出非 JSON: ${result.slice(0, 200)}`,
        cause: err,
      });
    }

    const byName = new Map(this.skills.map((s) => [s.name, s]));
    const ranked: RankedSkill[] = [];
    for (const r of parsed.results ?? []) {
      const meta = byName.get(r.name);
      if (!meta) continue;
      ranked.push({
        ...meta,
        score: r.score ?? 0,
        reasons: r.reasons ?? [`external:${this.engineId}`],
      });
    }
    return ranked.slice(0, q.topK ?? 5);
  }
}

export function createExternalRouter(engineId: string): ExternalRouterEngine {
  const cmd = process.env.SKILL_HUB_EXTERNAL_ENGINE_CMD;
  const argsRaw = process.env.SKILL_HUB_EXTERNAL_ENGINE_ARGS;
  const args = argsRaw ? argsRaw.split(/\s+/).filter(Boolean) : [];
  return new ExternalRouterEngine({
    engineId,
    command: cmd || undefined,
    args,
  });
}
