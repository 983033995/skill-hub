import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("writes human-readable info lines", () => {
    const lines: string[] = [];
    const log = createLogger({
      level: "info",
      json: false,
      name: "test",
      stdout: { write: (c) => lines.push(c) },
      stderr: { write: (c) => lines.push(`ERR:${c}`) },
    });
    log.debug("hidden");
    log.info("hello", { n: 1 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("INFO");
    expect(lines[0]).toContain("hello");
    expect(lines[0]).toContain('"n":1');
  });

  it("writes JSON when enabled", () => {
    const lines: string[] = [];
    const log = createLogger({
      level: "debug",
      json: true,
      name: "test",
      now: () => new Date("2026-08-10T00:00:00.000Z"),
      stdout: { write: (c) => lines.push(c) },
      stderr: { write: () => undefined },
    });
    log.debug("d");
    const obj = JSON.parse(lines[0]!.trim()) as { level: string; message: string; ts: string };
    expect(obj.level).toBe("debug");
    expect(obj.message).toBe("d");
    expect(obj.ts).toBe("2026-08-10T00:00:00.000Z");
  });

  it("routes warn/error to stderr", () => {
    const out: string[] = [];
    const err: string[] = [];
    const log = createLogger({
      level: "debug",
      stdout: { write: (c) => out.push(c) },
      stderr: { write: (c) => err.push(c) },
    });
    log.warn("w");
    log.error("e");
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(2);
  });

  it("child merges fields", () => {
    const lines: string[] = [];
    const log = createLogger({
      level: "info",
      json: true,
      now: () => new Date("2026-08-10T00:00:00.000Z"),
      stdout: { write: (c) => lines.push(c) },
      stderr: { write: () => undefined },
    });
    log.child({ cmd: "route" }).info("ok", { k: 2 });
    const obj = JSON.parse(lines[0]!.trim()) as { cmd: string; k: number };
    expect(obj.cmd).toBe("route");
    expect(obj.k).toBe(2);
  });
});
