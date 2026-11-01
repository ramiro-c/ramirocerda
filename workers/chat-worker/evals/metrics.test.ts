import { describe, expect, it } from "vitest";

import { zeroCounters } from "./backends";
import { chunkRecall, factHit, markdownTable, summarize, type CaseResult, type EvalCase } from "./metrics";

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
      { ...base, caseId: "a", pipeline: "adaptive", route: "smalltalk", routeVia: "llm", offerContact: false, searched: false, replyKind: "generated", abstained: null },
      { ...base, caseId: "b", pipeline: "adaptive", route: "search", routeVia: "timeout", offerContact: false, searched: true, replyKind: "no_info", abstained: true },
      { ...base, caseId: "c", pipeline: "adaptive", route: "search", routeVia: "llm", offerContact: false, searched: true, replyKind: "generated", abstained: null },
    ];
    const s = summarize("adaptive", cases, results);
    expect(s.retrievalDecision).toEqual({ hits: 1, total: 2 });
    expect(s.route).toEqual({ hits: 2, total: 3 });
    expect(s.offerContact).toEqual({ hits: 2, total: 3 });
    expect(s.routerFallbacks).toEqual({ hits: 1, total: 3 });
    expect(s.correctAbstention).toEqual({ hits: 1, total: 1 });
  });

  it("labels each metric by eval mode so mocked or stubbed numbers are never shown as real", () => {
    const cases: EvalCase[] = [
      { id: "a", category: "hire", lang: "es", message: "¿tarifa?", expected: { route: "search", retrieve: true, answerable: null, offerContact: true } },
    ];
    const r = { caseId: "a", route: "search", routeVia: "llm", routerMs: 240, offerContact: true, searched: true, chunkIds: [], replyKind: "generated" as const, reply: "r", abstained: null, faithful: null, latencyMs: 900, counters: { ...zeroCounters(), decisionTokensIn: 551, decisionTokensOut: 3 } };
    const summaries = {
      linear: summarize("linear", cases, [{ ...r, pipeline: "linear", route: null, routeVia: null, routerMs: null, offerContact: false }]),
      adaptive: summarize("adaptive", cases, [{ ...r, pipeline: "adaptive" }]),
    };
    const row = (table: string, name: string) => table.split("\n").find((l) => l.startsWith(`| ${name}`));
    const offline = markdownTable(summaries, { mode: "offline" });
    expect(row(offline, "Ruta correcta")).toContain("mock (no mide el router)");
    expect(row(offline, "Tokens decisión")).toContain("pending");
    const decision = markdownTable(summaries, { mode: "decision" });
    expect(row(decision, "Ruta correcta")).toContain("1/1 (100%)");
    expect(row(decision, "Latencia del router")).toContain("240 / 240");
    expect(row(decision, "Tokens decisión")).toContain("551 / 3");
    expect(row(decision, "Recall")).toContain("pending");
    expect(row(decision, "Latencia p50")).toContain("pending");
    expect(row(markdownTable(summaries, { mode: "real" }), "Latencia p50")).toContain("900");
  });

  it("reports each stage separately: retrieval hit, sufficiency, faithfulness, abstention", () => {
    const cases: EvalCase[] = [
      { id: "kb", category: "kb", lang: "es", message: "stack", expected: { route: "search", retrieve: true, answerable: true, expectedChunks: ["kb-stack-tecnico"], offerContact: false } },
      { id: "nm", category: "unanswerable", lang: "es", message: "equipo", expected: { route: "search", retrieve: true, answerable: false, expectedChunks: ["kb-full-stack"], offerContact: false, unanswerableKind: "near_miss" } },
      { id: "oo", category: "unanswerable", lang: "en", message: "movie", expected: { route: null, retrieve: null, answerable: false, offerContact: false, unanswerableKind: "out_of_kb" } },
    ];
    const base = { pipeline: "adaptive" as const, route: "search", routeVia: "llm", offerContact: false, searched: true, latencyMs: 10 };
    const supported = { claim: "a", p: 0.9, supported: true, tier: "free" as const };
    const unsupported = { claim: "b", p: 0.1, supported: false, tier: "free" as const };
    const results: CaseResult[] = [
      { ...base, caseId: "kb", chunkIds: ["kb-stack-tecnico-39dd7493"], replyKind: "generated", reply: "React", verdict: "sufficient", abstained: false, faithful: true, claims: [supported], counters: { ...zeroCounters(), vectorizeQueries: 1 } },
      { ...base, caseId: "nm", chunkIds: ["kb-full-stack-x"], replyKind: "generated", reply: "8 personas", verdict: "insufficient", abstained: false, faithful: false, claims: [supported, unsupported], counters: { ...zeroCounters(), vectorizeQueries: 2 } },
      { ...base, caseId: "oo", chunkIds: [], replyKind: "no_info", reply: "No tengo ese dato.", verdict: "skipped", abstained: true, faithful: null, counters: { ...zeroCounters(), vectorizeQueries: 1 } },
    ];
    const s = summarize("adaptive", cases, results);
    expect(s.hit).toEqual({ hits: 2, total: 2 });
    expect(s.sufficiency).toMatchObject({ judged: 2, sufficient: 1, insufficient: 1, errors: 0, agreement: { hits: 2, total: 2 }, researches: { hits: 1, total: 3 } });
    expect(s.unsupportedAnswers).toEqual({ hits: 1, total: 2 });
    expect(s.claims).toEqual({ total: 3, unsupported: 1, ungraded: 0 });
    expect(s.correctAbstention).toEqual({ hits: 1, total: 2 });
    expect(s.nearMissAbstention).toEqual({ hits: 0, total: 1 });
    expect(s.outOfKbAbstention).toEqual({ hits: 1, total: 1 });
    expect(s.falseAbstention).toEqual({ hits: 0, total: 1 });
    expect(summarize("linear", cases, results.map((r) => ({ ...r, pipeline: "linear" as const }))).sufficiency).toBeNull();

    const summaries = { linear: summarize("linear", cases, []), adaptive: s };
    const row = (table: string, name: string) => table.split("\n").find((l) => l.startsWith(`| ${name}`));
    const real = markdownTable(summaries, { mode: "real" });
    expect(row(real, "Respuestas con al menos un claim sin soporte")).toContain("1/2 (50%)");
    expect(row(real, "Abstención correcta, near_miss")).toContain("0/1 (0%)");
    expect(row(real, "Falsa abstención")).toContain("0/1 (0%)");
    expect(row(real, "Acuerdo del juez")).toContain("2/2 (100%)");
    for (const name of ["Respuestas con al menos un claim", "Abstención correcta (", "Falsa abstención", "Acuerdo del juez", "Hit"]) {
      expect(row(markdownTable(summaries, { mode: "decision" }), name)).toContain("pending");
    }
  });
});
