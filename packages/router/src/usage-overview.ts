import path from "node:path";
import { readUsageReport, type UsageOrigin } from "@skill-hub/core";
export type { UsageOrigin } from "@skill-hub/core";
import { getDefaultHubHome, SkillHubError } from "@skill-hub/shared";
import { loadHubSkills } from "./hub-service.js";
import { skillContextCost } from "./context-cost.js";
import { loadTaxonomy, tagSkill } from "./taxonomy.js";

type UsageReport = Awaited<ReturnType<typeof readUsageReport>>;
export type UsageSort =
  "usage-desc" | "usage-asc" | "recent" | "tokens-desc" | "tokens-asc" | "name";
export async function skillUsageOverview(
  options: {
    days?: number;
    origin?: UsageOrigin;
    query?: string;
    tag?: string;
    status?: "all" | "read" | "observed" | "unobserved";
    sort?: UsageSort;
    offset?: number;
    limit?: number;
    maxChars?: number;
    catalogPath?: string;
    configPath?: string;
    taxonomyPath?: string;
    now?: Date;
  } = {},
) {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 24;
  const sort = options.sort ?? "usage-desc";
  const status = options.status ?? "all";
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10000000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !["usage-desc", "usage-asc", "recent", "tokens-desc", "tokens-asc", "name"].includes(sort) ||
    !["all", "read", "observed", "unobserved"].includes(status) ||
    (options.days !== undefined &&
      (!Number.isSafeInteger(options.days) || options.days < 1 || options.days > 3650)) ||
    (options.origin !== undefined && !["cli", "mcp", "web", "library"].includes(options.origin))
  ) {
    throw new SkillHubError({ code: "E_CONFIG", message: "usage-overview筛选或分页参数无效" });
  }
  const { skills } = await loadHubSkills(options);
  const costs = await skillContextCost(options);
  const taxonomy = await loadTaxonomy({ path: options.taxonomyPath });
  const file = process.env.SKILL_HUB_USAGE_LOG || path.join(getDefaultHubHome(), "usage.jsonl");
  let usage: UsageReport | null = null;
  let usageErrorCode: string | null = null;
  try {
    usage = await readUsageReport({
      file,
      days: options.days,
      origin: options.origin,
      now: options.now,
    });
  } catch (error) {
    usageErrorCode = error instanceof SkillHubError ? error.code : "E_PATH";
  }
  const grouped = new Map<string, UsageReport["skills"][number]>();
  for (const value of usage?.skills ?? []) {
    const previous = grouped.get(value.name);
    if (!previous) {
      grouped.set(value.name, { ...value });
      continue;
    }
    for (const field of [
      "appearances",
      "initialBodyReads",
      "continuationBodyReads",
      "attachmentReads",
      "errors",
      "returnedChars",
      "returnedBytes",
      "estimatedReturnedTokens",
    ] as const)
      previous[field] += value[field];
    if (
      value.lastReadAt &&
      (!previous.lastReadAt || Date.parse(value.lastReadAt) > Date.parse(previous.lastReadAt))
    )
      previous.lastReadAt = value.lastReadAt;
  }
  // The denominator is computed BEFORE any UI filters and excludes Skills no longer in the catalog.
  const totalInitialReads = skills.reduce(
    (sum, skill) => sum + (grouped.get(skill.name)?.initialBodyReads ?? 0),
    0,
  );
  const costMap = new Map(costs.items.map((item) => [item.name, item]));
  const all = skills.map((skill) => {
    const observed = grouped.get(skill.name);
    return {
      name: skill.name,
      description: skill.description,
      tags: tagSkill(skill, taxonomy),
      observed: Boolean(observed),
      initialBodyReads: observed?.initialBodyReads ?? null,
      continuationBodyReads: observed?.continuationBodyReads ?? null,
      attachmentReads: observed?.attachmentReads ?? null,
      appearances: observed?.appearances ?? null,
      errors: observed?.errors ?? null,
      lastReadAt: observed?.lastReadAt ?? null,
      estimatedReturnedTokens: observed?.estimatedReturnedTokens ?? null,
      usageRate:
        observed && totalInitialReads > 0 ? observed.initialBodyReads / totalInitialReads : null,
      cost: costMap.get(skill.name) ?? null,
    };
  });
  const query = options.query?.trim().toLocaleLowerCase();
  const selected = all.filter(
    (row) =>
      (!query || `${row.name}\n${row.description}`.toLocaleLowerCase().includes(query)) &&
      (!options.tag || row.tags.some((tag) => tag.id === options.tag)) &&
      (status === "all" ||
        (status === "read" && (row.initialBodyReads ?? 0) > 0) ||
        (status === "observed" && row.observed) ||
        (status === "unobserved" && !row.observed)),
  );
  const compareNullable = (a: number | null, b: number | null, ascending = false) => {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return ascending ? a - b : b - a;
  };
  selected.sort((a, b) => {
    let compared = 0;
    if (sort === "usage-desc" || sort === "usage-asc")
      compared = compareNullable(a.usageRate, b.usageRate, sort === "usage-asc");
    if (sort === "recent")
      compared = compareNullable(
        a.lastReadAt ? Date.parse(a.lastReadAt) : null,
        b.lastReadAt ? Date.parse(b.lastReadAt) : null,
      );
    if (sort === "tokens-desc" || sort === "tokens-asc")
      compared = compareNullable(
        a.cost?.fullBody?.estimatedTokens ?? null,
        b.cost?.fullBody?.estimatedTokens ?? null,
        sort === "tokens-asc",
      );
    return compared || a.name.localeCompare(b.name);
  });
  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    complete: usage !== null && usage.complete && costs.complete,
    days: options.days ?? null,
    origin: options.origin ?? null,
    sort,
    status,
    usage: {
      exists: usage?.exists ?? null,
      complete: usage?.complete ?? false,
      errorCode: usageErrorCode,
      issueCount: usage?.issues.length ?? 0,
      recordedSince: usage?.recordedSince ?? null,
      recordingConfigured: Boolean(process.env.SKILL_HUB_USAGE_LOG),
      totalInitialReads,
      observedSkillCount: all.filter((row) => row.observed).length,
      denominator:
        "Successful initial-body reads of the current catalog, within selected days/origin; unchanged by query/tag/status filters.",
    },
    context: {
      complete: costs.complete,
      method: costs.method,
      maxChars: costs.maxChars,
      readable: all.filter((row) => row.cost?.fullBody !== null && row.cost?.fullBody !== undefined)
        .length,
      metadataTotalEstimatedTokens: costs.metadataTotalEstimatedTokens,
      actualModelTokens: null,
      actualCost: null,
    },
    catalogTotal: all.length,
    total: selected.length,
    offset,
    nextOffset: offset + limit < selected.length ? offset + limit : null,
    items: selected.slice(offset, offset + limit),
  };
}
