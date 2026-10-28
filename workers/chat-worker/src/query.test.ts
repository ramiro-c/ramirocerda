import { describe, expect, it, vi } from "vitest";

import { readAdaptiveConfig } from "./config";
import { reformulateQuery, rewriteQuery, sanitizeQuery } from "./query";

const config = readAdaptiveConfig({});
const history = [
  { role: "user" as const, content: "¿Dónde trabaja Ramiro?" },
  { role: "assistant" as const, content: "En LDP (Libro de Pases) como Tech Lead hands-on." },
];

describe("sanitizeQuery", () => {
  it("keeps the first line and strips quotes and prefixes", () => {
    expect(sanitizeQuery('Query: "experiencia previa de Ramiro antes de LDP"\nextra')).toBe(
      "experiencia previa de Ramiro antes de LDP",
    );
  });

  it("rejects empty, tiny or runaway outputs", () => {
    expect(sanitizeQuery(null)).toBeNull();
    expect(sanitizeQuery("  \n ")).toBeNull();
    expect(sanitizeQuery("ok")).toBeNull();
    expect(sanitizeQuery("x".repeat(400))).toBeNull();
  });
});

describe("rewriteQuery", () => {
  it("skips the LLM entirely when there is no history", async () => {
    const run = vi.fn();
    const result = await rewriteQuery("¿Qué stack usa Ramiro?", [], { AI: { run } }, config);
    expect(result).toEqual({ query: "¿Qué stack usa Ramiro?", rewritten: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("rewrites a follow-up into a standalone query with a small, deterministic call", async () => {
    const run = vi.fn().mockResolvedValue({ response: "¿Dónde trabajó Ramiro antes de LDP?" });
    const result = await rewriteQuery("¿y antes?", history, { AI: { run } }, config);
    expect(result).toEqual({ query: "¿Dónde trabajó Ramiro antes de LDP?", rewritten: true });
    expect(run.mock.calls[0][1]).toMatchObject({ temperature: 0, max_tokens: 64 });
    expect(run.mock.calls[0][1].messages[1].content).toContain("Libro de Pases");
  });

  it("falls back to the raw message when the LLM throws", async () => {
    const run = vi.fn().mockRejectedValue(new Error("down"));
    expect(await rewriteQuery("¿y antes?", history, { AI: { run } }, config)).toEqual({
      query: "¿y antes?",
      rewritten: false,
    });
  });

  it("falls back to the raw message on empty or unusable output", async () => {
    const run = vi.fn().mockResolvedValue({ response: "" });
    expect((await rewriteQuery("¿y antes?", history, { AI: { run } }, config)).query).toBe("¿y antes?");
    const run2 = vi.fn().mockResolvedValue({});
    expect((await rewriteQuery("¿y antes?", history, { AI: { run: run2 } }, config)).query).toBe("¿y antes?");
  });

  it("falls back to the raw message on timeout", async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn().mockReturnValue(new Promise(() => {}));
      const pending = rewriteQuery("¿y antes?", history, { AI: { run } }, { ...config, rewriteTimeoutMs: 100 });
      await vi.advanceTimersByTimeAsync(150);
      expect(await pending).toEqual({ query: "¿y antes?", rewritten: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("reformulateQuery", () => {
  it("returns the alternative query", async () => {
    const run = vi.fn().mockResolvedValue({ response: "certificaciones de Ramiro en Google Cloud" });
    expect(await reformulateQuery("cursos que hizo", { AI: { run } }, config)).toBe(
      "certificaciones de Ramiro en Google Cloud",
    );
  });

  it("returns null on failure so the caller does not re-search", async () => {
    const run = vi.fn().mockRejectedValue(new Error("down"));
    expect(await reformulateQuery("cursos que hizo", { AI: { run } }, config)).toBeNull();
  });
});
