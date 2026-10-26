import { AsyncLocalStorage } from "node:async_hooks";
import {
  appendUsage,
  estimateContext,
  type SkillUsageEvent,
  type UsageOrigin,
} from "@skill-hub/core";
import { SkillHubError } from "@skill-hub/shared";

const scope = new AsyncLocalStorage<{ origin: UsageOrigin; record: boolean }>();
function enabled() {
  return Boolean(process.env.SKILL_HUB_USAGE_LOG) && scope.getStore()?.record !== false;
}
export function withUsageScope<T>(origin: UsageOrigin, call: () => T, record = true): T {
  return scope.run({ origin, record }, call);
}

async function record(event: Omit<SkillUsageEvent, "version" | "at" | "origin">) {
  const file = process.env.SKILL_HUB_USAGE_LOG;
  if (!file || scope.getStore()?.record === false) return;
  try {
    await appendUsage(file, {
      ...event,
      version: 1,
      at: new Date().toISOString(),
      origin: scope.getStore()?.origin ?? "library",
    });
  } catch {
    // Deliberately preserve the original operation; never print the private path or error detail.
    console.error(
      "[skill-hub usage] E_USAGE_WRITE: 本次记录失败，请检查日志路径、格式、权限或大小；原调用结果不受影响。",
    );
  }
}

export async function observeRead<
  T extends { name: string; body: string; file: string; offset: number },
>(name: string, call: () => Promise<T>): Promise<T> {
  if (!enabled()) return call();
  let result: T;
  try {
    result = await call();
  } catch (error) {
    const safeName =
      typeof name === "string" && /^[a-zA-Z0-9._-]{1,256}$/.test(name) ? name : undefined;
    await record({
      operation: "read",
      name: safeName,
      success: false,
      errorCode: error instanceof SkillHubError ? error.code : "E_INTERNAL",
    });
    throw error;
  }
  await record({
    operation: "read",
    success: true,
    name: result.name,
    kind: result.file.toLowerCase() === "skill.md" ? "body" : "attachment",
    phase: result.offset === 0 ? "initial" : "continuation",
    content: estimateContext(result.body),
  });
  return result;
}

export async function observeSearch<T extends { results: Array<{ name: string }> }>(
  call: () => Promise<T>,
): Promise<T> {
  if (!enabled()) return call();
  let result: T;
  try {
    result = await call();
  } catch (error) {
    await record({
      operation: "search",
      success: false,
      errorCode: error instanceof SkillHubError ? error.code : "E_INTERNAL",
    });
    throw error;
  }
  await record({
    operation: "search",
    success: true,
    candidates: result.results.map((r) => r.name),
  });
  return result;
}
