import { describe, expect, it } from "vitest";

import { zeroCounters } from "./backends";
import { chunkRecall, factHit, summarize, type CaseResult, type EvalCase } from "./metrics";

describe("eval metrics", () => {
  it("matches chunk ids by prefix, ignoring the content hash", () => {
    expect(chunkRecall(["kb-educacion"], ["kb-educacion-5b6f6a1d"])).toBe(1);
    expect(chunkRecall(["kb-educacion", "kb-overview"], ["kb-educacion-5b6f6a1d"])).toBe(0.5);
    expect(chunkRecall(["kb-overview"], [])).toBe(0);
  });

  it("detects expected facts case and accent insensitively", () => {
    expect(factHit(["Ingeniería en Sistemas"], "Estudió INGENIERIA EN SISTEMAS en la UTN")).toBe(true);
    expect(factHit(["XGBoost"], "No tengo ese dato.")).toBe(false);
    expect(factHit(["XGBoost"], null)).toBe(false);
  });

  it("grades retrieval decisions, routes and declines", () => {
    const cases: EvalCase[] = [
      { id: "a", category: "smalltalk", lang: "es", message: "hola", expected: { route: "smalltalk", retrieve: false, answerable: null, offerContact: false } },
      { id: "b", category: "off_topic", lang: "en", message: "x", expected: { route: "off_topic", retrieve: false, answerable: false, offerContact: false } },
      { id: "c", category: "hire", lang: "en", message: "hire?", expected: { route: "search", retrieve: null, answerable: null, offerContact: true } },
    ];
    const base = { chunkIds: [], reply: "r", faithful: null, latencyMs: 10, counters: zeroCounters() };
    const results: CaseResult[] = [
      { ...base, caseId: "a", pipeline: "adaptive", route: "smalltalk", routeVia: "llm", offerContact: false, searched: false, replyKind: "generated", declined: null },
      { ...base, caseId: "b", pipeline: "adaptive", route: "search", routeVia: "timeout", offerContact: false, searched: true, replyKind: "no_info", declined: true },
      { ...base, caseId: "c", pipeline: "adaptive", route: "search", routeVia: "llm", offerContact: false, searched: true, replyKind: "generated", declined: null },
    ];
    const s = summarize("adaptive", cases, results);
    expect(s.retrievalDecision).toEqual({ hits: 1, total: 2 });
    expect(s.route).toEqual({ hits: 2, total: 3 });
    expect(s.offerContact).toEqual({ hits: 2, total: 3 });
    expect(s.routerFallbacks).toEqual({ hits: 1, total: 3 });
    expect(s.noInfoCorrect).toEqual({ hits: 1, total: 1 });
  });
});
