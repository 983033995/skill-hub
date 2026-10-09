import { routeWithProfile, skillSearch } from "@skill-hub/router";
import { SkillHubError } from "@skill-hub/shared";
import type { SkillScope } from "@skill-hub/shared";
import { printJson, printLines } from "../output.js";

export async function runRoute(options: {
  json: boolean;
  query: string;
  topK: number;
  profile?: string;
  includeBody: boolean;
  catalogPath?: string;
  configPath?: string;
  indexDir?: string;
  engine?: string;
  profilesDir?: string;
  scopes?: SkillScope[];
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
    configPath: options.configPath,
    indexDir: options.indexDir,
    profilesDir: options.profilesDir,
    scope: options.scopes,
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
    scope: result.scope,
    scope_matched: result.scopeMatched,
    candidate_count: result.candidateCount,
    index_fresh: result.indexFresh,
    index_rebuild_recommended: result.indexRebuildRecommended,
    index_source: result.indexSource,
    index_reason: result.indexReason,
    decision: result.decision
      ? {
          kind: result.decision.kind,
          model: result.decision.model,
          selected: result.decision.selected,
          confidence: Number(result.decision.confidence.toFixed(4)),
          selected_probability: Number(result.decision.selectedProbability.toFixed(4)),
          none_probability: Number(result.decision.noneProbability.toFixed(4)),
          threshold: Number(result.decision.threshold.toFixed(4)),
          escalation_recommended: result.decision.escalationRecommended,
          probabilities: Object.fromEntries(
            Object.entries(result.decision.probabilities).map(([name, value]) => [
              name,
              Number(value.toFixed(4)),
            ]),
          ),
        }
      : null,
    results: result.results.map((r) => ({
      name: r.name,
      score: Number(r.score.toFixed(4)),
      description: r.description,
      path: r.path,
      provenance: r.provenance ?? null,
      reasons: r.reasons,
    })),
  };

  if (options.json) printJson(payload);
  else {
    const head = [
      `route top-${options.topK}  engine=${payload.engine}${payload.degraded ? " (degraded)" : ""}  q="${options.query}"`,
      `  index=${payload.index_source} fresh=${payload.index_fresh === null ? "unknown" : payload.index_fresh}${payload.index_rebuild_recommended ? " → 请运行 index --rebuild" : ""}`,
    ];
    if (payload.profile) {
      head.push(
        `  profile=${payload.profile} matched=${payload.profile_matched ?? 0} fallback=${payload.profile_fallback} candidates=${payload.candidate_count}`,
      );
    }
    if (payload.scope?.length) {
      head.push(
        `  scope=${payload.scope.join(",")} matched=${payload.scope_matched ?? 0} candidates=${payload.candidate_count}`,
      );
    }
    if (payload.decision) {
      head.push(
        `  decision selected=${payload.decision.selected ?? "none"} confidence=${payload.decision.confidence.toFixed(3)}${payload.decision.escalation_recommended ? " → 建议升级判断" : ""}`,
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
