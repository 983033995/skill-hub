import {
  routeWithProfile,
  skillSearch,
} from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runRoute(options: {
  json: boolean;
  query: string;
  topK: number;
  profile?: string;
  includeBody: boolean;
  catalogPath?: string;
  engine?: string;
  profilesDir?: string;
}): Promise<number> {
  if (!options.query.trim()) {
    throw new SkillHubError({
      code: "E_CONFIG",
      message: "route 需要查询字符串",
    });
  }

  const result = await skillSearch({
    query: options.query,
    topK: options.topK,
    profile: options.profile,
    engine: options.engine,
    catalogPath: options.catalogPath,
    profilesDir: options.profilesDir,
  });

  const payload = {
    query: result.query,
    top_k: result.top_k,
    engine: result.engineId,
    degraded: result.degraded,
    degrade_reason: result.degradeReason ?? null,
    profile: result.profile,
    profile_matched: result.profileMatched,
    profile_fallback: result.profileFallback,
    candidate_count: result.candidateCount,
    results: result.results.map((r) => ({
      name: r.name,
      score: Number(r.score.toFixed(4)),
      description: r.description,
      path: r.path,
      reasons: r.reasons,
    })),
  };

  if (options.json) printJson(payload);
  else {
    const head = [
      `route top-${options.topK}  engine=${payload.engine}${payload.degraded ? " (degraded)" : ""}  q="${options.query}"`,
    ];
    if (payload.profile) {
      head.push(
        `  profile=${payload.profile} matched=${payload.profile_matched ?? 0} fallback=${payload.profile_fallback} candidates=${payload.candidate_count}`,
      );
    }
    if (payload.results.length === 0) {
      printLines([...head, "  (无结果)"]);
    } else {
      printLines([
        ...head,
        ...payload.results.map(
          (r, i) =>
            `  ${String(i + 1).padStart(2)}. ${r.name.padEnd(28)} ${r.score.toFixed(3)}  ${r.description.slice(0, 56)}`,
        ),
      ]);
    }
  }

  void options.includeBody;
  void routeWithProfile;
  return 0;
}
