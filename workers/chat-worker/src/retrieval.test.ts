import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DECISION_ENDPOINT,
  DEFAULT_DECISION_INTEGRATION_ID,
  DEFAULT_DECISION_MIN_CONFIDENCE,
  DEFAULT_DECISION_MODEL,
  DEFAULT_DECISION_TIMEOUT_MS,
  MAX_RETRIEVAL_ITERATIONS_CEILING,
  readAdaptiveConfig,
} from "./config";
import { buildJudgeState, JUDGE_SNIPPET_CHARS, mergeChunks, retrieveAdaptive, SUFFICIENT_QUESTION } from "./retrieval";
import { DECISION_OFF, DECISION_VARS, judgeAnswer, stubFetch } from "./test-utils";

function chunk(id: string, score: number) {
  return { id, score, metadata: { text: `texto ${id}`, section: "Stack" } };
}

/** Fake bindings: fixed embedding, scripted Vectorize rounds (last one repeats). */
function makeEnv(opts: { rounds: Array<Array<{ id: string; score: number }>>; vectorizeError?: Error }) {
  let round = 0;
  const query = vi.fn().mockImplementation(() => {
    if (opts.vectorizeError && round > 0) return Promise.reject(opts.vectorizeError);
    const matches = opts.rounds[Math.min(round, opts.rounds.length - 1)] ?? [];
    round += 1;
    return Promise.resolve({ matches: matches.map((m) => ({ ...m, metadata: { text: m.id, section: "Stack" } })) });
  });
  const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
  const env = { AI: { run }, VECTORIZE: { query }, EMBEDDING_MODEL: "@cf/baai/bge-m3", TOP_K: "5", SIMILARITY_THRESHOLD: "0.30" };
  return { env, query, run };
}

const config = readAdaptiveConfig(DECISION_VARS);
/** Follow-up searched with the raw message; the contextual query is the alternate. */
const followUp = { question: "¿y cursos?", query: "¿y cursos?", alternateQuery: "¿Qué estudió Ramiro? ¿y cursos?" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mergeChunks", () => {
  it("dedupes by id keeping the best score, sorted, capped at 4", () => {
    const merged = mergeChunks(
      [chunk("a", 0.4), chunk("b", 0.5), chunk("c", 0.31)],
      [chunk("a", 0.6), chunk("d", 0.35), chunk("e", 0.32)],
    );
    expect(merged.map((c) => [c.id, c.score])).toEqual([
      ["a", 0.6],
      ["b", 0.5],
      ["d", 0.35],
      ["e", 0.32],
    ]);
  });
});

describe("buildJudgeState", () => {
  it("sends the original question and short section-tagged snippets", () => {
    const long = { id: "x", score: 0.5, metadata: { section: "Experiencia", text: "a ".repeat(400) } };
    const state = buildJudgeState("¿Dónde trabaja?", [long]);
    expect(state.question).toBe("¿Dónde trabaja?");
    expect(state.snippets[0].startsWith("[Experiencia] ")).toBe(true);
    expect(state.snippets[0].length).toBeLessThanOrEqual(JUDGE_SNIPPET_CHARS + "[Experiencia] ".length);
  });
});

describe("retrieveAdaptive", () => {
  it("asks ONE noul question (sufficient) and keeps search 1 when sufficient", async () => {
    const { calls } = stubFetch({ judge: [judgeAnswer(0.91)] });
    const { env, query } = makeEnv({ rounds: [[chunk("a", 0.6)]] });
    const result = await retrieveAdaptive(followUp, env, config);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ iterations: 1, queries: ["¿y cursos?"], verdict: { kind: "sufficient", probability: 0.91 } });
    expect(result.judgeUsage).toEqual({ inputTokens: 550, outputTokens: 3 });
    expect(calls.judge[0]).toEqual({
      model: DEFAULT_DECISION_MODEL,
      state: { question: "¿y cursos?", snippets: ["[Stack] a"] },
      questions: { sufficient: SUFFICIENT_QUESTION },
    });
  });

  it("re-searches once with the alternate query when insufficient and merges by id", async () => {
    stubFetch({ judge: [judgeAnswer(0.12)] });
    const { env, query, run } = makeEnv({ rounds: [[chunk("weak", 0.33)], [chunk("good", 0.7), chunk("weak", 0.34)]] });
    const result = await retrieveAdaptive(followUp, env, config);
    expect(query).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][1]).toEqual({ text: [followUp.alternateQuery] });
    expect(result.iterations).toBe(2);
    expect(result.queries).toEqual([followUp.query, followUp.alternateQuery]);
    expect(result.chunks.map((c) => [c.id, c.score])).toEqual([
      ["good", 0.7],
      ["weak", 0.34],
    ]);
  });

  it("never calls the judge without an alternate query (nothing to retry with)", async () => {
    const { fetchMock } = stubFetch();
    const { env, query } = makeEnv({ rounds: [[]] });
    for (const alternateQuery of [null, "  ", " ¿Y CURSOS? "]) {
      const result = await retrieveAdaptive({ ...followUp, alternateQuery }, env, config);
      expect(result.verdict).toEqual({ kind: "skipped" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("skips the judge with MAX_RETRIEVAL_ITERATIONS=1 or the decision model off", async () => {
    const { fetchMock } = stubFetch();
    const { env, query } = makeEnv({ rounds: [[]] });
    await retrieveAdaptive(followUp, env, readAdaptiveConfig({ ...DECISION_VARS, MAX_RETRIEVAL_ITERATIONS: "1" }));
    await retrieveAdaptive(followUp, env, readAdaptiveConfig(DECISION_OFF));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("clamps MAX_RETRIEVAL_ITERATIONS above the ceiling to 2 searches", async () => {
    stubFetch({ judge: [judgeAnswer(0), judgeAnswer(0)] });
    const { env, query } = makeEnv({ rounds: [[]] });
    const cfg = readAdaptiveConfig({ ...DECISION_VARS, MAX_RETRIEVAL_ITERATIONS: "9" });
    expect(cfg.maxRetrievalIterations).toBe(MAX_RETRIEVAL_ITERATIONS_CEILING);
    const result = await retrieveAdaptive(followUp, env, cfg);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(2);
  });

  it.each([
    [{ status: 500 }, "http_500"],
    [{ text: "oops" }, "invalid_json"],
    [{ answers: { sufficient: { type: "choice", choice: "yes", confidence: 1 } } }, "invalid_shape"],
    [{ answers: { sufficient: { type: "noul", noul: 2 } } }, "invalid_shape"],
    ["hang", "timeout"],
  ] as const)("keeps search 1 when the judge fails (%j)", async (answer, reason) => {
    stubFetch({ judge: [answer] });
    const { env, query } = makeEnv({ rounds: [[chunk("weak", 0.33)]] });
    const result = await retrieveAdaptive(followUp, env, config);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.chunks.map((c) => c.id)).toEqual(["weak"]);
    expect(result.verdict).toEqual({ kind: "error", reason });
  });

  it("keeps the first results when the re-search fails", async () => {
    stubFetch({ judge: [judgeAnswer(0.05)] });
    const { env } = makeEnv({ rounds: [[chunk("weak", 0.33)]], vectorizeError: new Error("vectorize down") });
    const result = await retrieveAdaptive(followUp, env, config);
    expect(result.chunks.map((c) => c.id)).toEqual(["weak"]);
    expect(result.iterations).toBe(2);
  });

  it("judge: free fails, paid jev-1.13 with Bearer answers (one retry only)", async () => {
    const { calls } = stubFetch({ judge: [{ status: 503 }, judgeAnswer(0.9)] });
    const { env, query } = makeEnv({ rounds: [[chunk("weak", 0.33)]] });
    const result = await retrieveAdaptive(followUp, env, readAdaptiveConfig({ ...DECISION_VARS, DECISION_API_KEY: "k" }));
    expect(calls.judge.map((b) => b.model)).toEqual(["jev-1.13-free", "jev-1.13"]);
    expect(calls.decisionHeaders.map((h) => h.Authorization)).toEqual([undefined, "Bearer k"]);
    expect(result.verdict).toEqual({ kind: "sufficient", probability: 0.9 });
    expect(result.judgeTrace).toEqual({ tier: "paid", model: "jev-1.13", primaryError: "http_503", fallback: "used" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("judge: free and paid both fail, keeps search 1", async () => {
    const { calls } = stubFetch({ judge: [{ status: 400 }, { error: new TypeError("fetch failed") }] });
    const { env, query } = makeEnv({ rounds: [[chunk("weak", 0.33)]] });
    const result = await retrieveAdaptive(followUp, env, readAdaptiveConfig({ ...DECISION_VARS, DECISION_API_KEY: "k" }));
    expect(calls.judge).toHaveLength(2);
    expect(result.verdict).toEqual({ kind: "error", reason: "network" });
    expect(result.judgeTrace).toMatchObject({ tier: "none", primaryError: "http_400", fallback: "failed" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("judge: no key, a single free attempt", async () => {
    const { calls } = stubFetch({ judge: [{ status: 500 }, judgeAnswer(0.9)] });
    const { env } = makeEnv({ rounds: [[chunk("weak", 0.33)]] });
    const result = await retrieveAdaptive(followUp, env, config);
    expect(calls.judge).toHaveLength(1);
    expect(result.judgeTrace?.fallback).toBe("skipped_no_key");
  });

  it("propagates a first-search failure (same MODEL_ERROR path as before)", async () => {
    stubFetch();
    const env = { ...makeEnv({ rounds: [[]] }).env, VECTORIZE: { query: vi.fn().mockRejectedValue(new Error("down")) } };
    await expect(retrieveAdaptive(followUp, env, config)).rejects.toThrow("down");
  });
});

describe("readAdaptiveConfig", () => {
  it("is ON by default with Jev free, anonymous, integration id opencode", () => {
    expect(readAdaptiveConfig({})).toEqual({
      decision: {
        endpoint: DEFAULT_DECISION_ENDPOINT,
        model: DEFAULT_DECISION_MODEL,
        fallbackModel: "jev-1.13",
        apiKey: null,
        integrationId: DEFAULT_DECISION_INTEGRATION_ID,
        timeoutMs: DEFAULT_DECISION_TIMEOUT_MS,
        minConfidence: DEFAULT_DECISION_MIN_CONFIDENCE,
      },
      maxRetrievalIterations: 2,
    });
    expect(DEFAULT_DECISION_ENDPOINT).toBe("https://opencode.ai/inference/systemone/v1/systemone");
    expect(DEFAULT_DECISION_MODEL).toBe("jev-1.13-free");
    expect(DEFAULT_DECISION_INTEGRATION_ID).toBe("opencode");
  });

  it("turns off with an empty DECISION_MODEL or DECISION_ENDPOINT", () => {
    expect(readAdaptiveConfig({ DECISION_MODEL: "" }).decision).toBeNull();
    expect(readAdaptiveConfig({ DECISION_MODEL: "  " }).decision).toBeNull();
    expect(readAdaptiveConfig({ DECISION_ENDPOINT: "" }).decision).toBeNull();
  });

  it("uses safe defaults when optional vars are malformed", () => {
    const cfg = readAdaptiveConfig({
      DECISION_API_KEY: "  ",
      DECISION_MODEL: " jev-1.13 ",
      DECISION_INTEGRATION_ID: " ",
      DECISION_TIMEOUT_MS: "-5",
      DECISION_MIN_CONFIDENCE: "1.5",
      MAX_RETRIEVAL_ITERATIONS: "0",
    });
    expect(cfg.decision).toMatchObject({
      model: "jev-1.13",
      apiKey: null,
      integrationId: "opencode",
      timeoutMs: DEFAULT_DECISION_TIMEOUT_MS,
      minConfidence: DEFAULT_DECISION_MIN_CONFIDENCE,
    });
    expect(cfg.maxRetrievalIterations).toBe(2);
  });
});
