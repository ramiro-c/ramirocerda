import { afterEach, describe, expect, it, vi } from "vitest";

import {
  agreement,
  answerFaithful,
  claimSnippets,
  evalJudgeConfig,
  judgeAbstention,
  judgeClaim,
  parseClaims,
} from "./stage-judges";

const jev = evalJudgeConfig({ apiKey: null });

function decisionResponse(answers: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ model: "jev-1.13-free", answers, usage: { input_tokens: 10, output_tokens: 1 } }), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

describe("stage judges", () => {
  it("parses extractor output, tolerating prose around the JSON and capping the claims", () => {
    expect(parseClaims('{"claims": ["Usa React.", "  "]}')).toEqual(["Usa React."]);
    expect(parseClaims('Sure:\n{"claims": ["A"]}\nDone')).toEqual(["A"]);
    expect(parseClaims('{"claims": []}')).toEqual([]);
    expect(parseClaims("no json")).toBeNull();
    expect(parseClaims(JSON.stringify({ claims: Array.from({ length: 20 }, (_, i) => `c${i}`) }))?.length).toBe(12);
  });

  it("keeps the judge config independent of DECISION_MODEL and only enables the paid retry with a key", () => {
    expect(jev.model).toBe("jev-1.13-free");
    expect(jev.fallbackModel).toBeNull();
    expect(evalJudgeConfig({ apiKey: "k" }).fallbackModel).toBe("jev-1.13");
    expect(evalJudgeConfig({ apiKey: "k", EVAL_JEV_FALLBACK_MODEL: "" }).fallbackModel).toBeNull();
  });

  it("asks Jev one noul per claim with the generation chunks in the state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(decisionResponse({ supported: { type: "noul", noul: 0.2 } }));
    vi.stubGlobal("fetch", fetchMock);
    const snippets = claimSnippets([{ id: "kb-x-1", score: 0.8, metadata: { section: "Stack", text: "React  y\nNode" } }]);
    const check = await judgeClaim(jev, "Usa Rust.", snippets);
    expect(check).toMatchObject({ supported: false, p: 0.2, tier: "free" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.state).toEqual({ snippets: ["[Stack] React y Node"], claim: "Usa Rust." });
    expect(body.questions.supported.type).toBe("noul");
  });

  it("treats a claim with no generation chunks as unsupported without calling Jev, and a judge failure as ungraded", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("down", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await judgeClaim(jev, "Trabaja en LDP.", [])).toMatchObject({ supported: false, tier: "rule" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await judgeClaim(jev, "Trabaja en LDP.", ["[x] y"])).toMatchObject({ supported: null, error: "http_503" });
  });

  it("fails an answer on any unsupported claim and leaves it ungraded when nothing decided it", () => {
    const c = (supported: boolean | null) => ({ claim: "x", p: null, supported, tier: "free" as const });
    expect(answerFaithful([c(true), c(false)])).toBe(false);
    expect(answerFaithful([c(true), c(true)])).toBe(true);
    expect(answerFaithful([c(true), c(null)])).toBeNull();
    expect(answerFaithful([])).toBeNull();
  });

  it("maps the abstention choice and surfaces judge failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(decisionResponse({ abstention: { type: "choice", choice: "abstains", confidence: 0.93 } })));
    expect(await judgeAbstention(jev, "¿Edad?", "No tengo ese dato.")).toMatchObject({ abstained: true, confidence: 0.93, via: "judge" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(decisionResponse({ abstention: { type: "choice", choice: "maybe", confidence: 0.5 } })));
    expect(await judgeAbstention(jev, "¿Edad?", "30")).toMatchObject({ abstained: null, via: "error" });
  });

  it("scores judge agreement against fixture labels", () => {
    expect(
      agreement([
        { label: true, verdict: true },
        { label: false, verdict: true },
        { label: true, verdict: false },
        { label: false, verdict: null },
      ]),
    ).toEqual({ total: 3, agree: 1, falseTrue: 1, falseFalse: 1, errors: 1 });
  });
});
