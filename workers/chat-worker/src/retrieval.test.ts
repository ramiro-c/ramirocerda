import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_OPENROUTER_ENDPOINT,
  DEFAULT_OPENROUTER_MAX_TOKENS,
  DEFAULT_OPENROUTER_TIMEOUT_MS,
  MAX_RETRIEVAL_ITERATIONS_CEILING,
  readAdaptiveConfig,
} from "./config";
import { buildJudgeMessages, JUDGE_SCHEMA, mergeChunks, parseJudgeOutput, retrieveAdaptive } from "./retrieval";
import { OPENROUTER_VARS, stubFetch, type ScriptedAnswer } from "./test-utils";

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
    return Promise.resolve({ matches: matches.map((m) => ({ ...m, metadata: { text: m.id } })) });
  });
  const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2]] });
  const env = { AI: { run }, VECTORIZE: { query }, EMBEDDING_MODEL: "@cf/baai/bge-m3", TOP_K: "5", SIMILARITY_THRESHOLD: "0.30" };
  return { env, query, run };
}

const config = readAdaptiveConfig(OPENROUTER_VARS);
const insufficient = (q: string): ScriptedAnswer => ({ json: { sufficient: false, reformulated_query: q } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseJudgeOutput (strict validation)", () => {
  it("reads sufficient and insufficient verdicts", () => {
    expect(parseJudgeOutput({ sufficient: true, reformulated_query: "" })).toEqual({ kind: "sufficient" });
    expect(parseJudgeOutput({ sufficient: false, reformulated_query: " certificaciones  GCP " })).toEqual({
      kind: "insufficient",
      reformulatedQuery: "certificaciones GCP",
    });
  });

  it("keeps an insufficient verdict without a usable query (no re-search)", () => {
    expect(parseJudgeOutput({ sufficient: false, reformulated_query: "" })).toEqual({ kind: "insufficient", reformulatedQuery: null });
    expect(parseJudgeOutput({ sufficient: false, reformulated_query: "x".repeat(301) })).toEqual({
      kind: "insufficient",
      reformulatedQuery: null,
    });
  });

  it.each([[{ sufficient: "no", reformulated_query: "" }], [{ sufficient: false }], [{ reformulated_query: "x" }]])(
    "rejects %j",
    (value) => {
      expect(parseJudgeOutput(value as Record<string, unknown>)).toBeNull();
    },
  );
});

describe("buildJudgeMessages", () => {
  it("sends the question plus short snippets, or a no-snippets marker", () => {
    const [, user] = buildJudgeMessages("¿Qué stack usa?", [{ id: "a", score: 0.5, metadata: { section: "Stack", text: "y".repeat(1000) } }]);
    expect(user.content).toContain("¿Qué stack usa?");
    expect(user.content).toContain("[Stack]");
    expect(user.content).not.toContain("y".repeat(351));
    expect(buildJudgeMessages("q", [])[1].content).toContain("(no snippets)");
  });
});

describe("mergeChunks", () => {
  it("dedupes by id keeping the best score, sorted and capped at 4", () => {
    const merged = mergeChunks(
      [chunk("a", 0.4), chunk("b", 0.5), chunk("c", 0.31)],
      [chunk("a", 0.7), chunk("d", 0.45), chunk("e", 0.32)],
    );
    expect(merged.map((c) => [c.id, c.score])).toEqual([
      ["a", 0.7],
      ["b", 0.5],
      ["d", 0.45],
      ["e", 0.32],
    ]);
  });
});

describe("retrieveAdaptive", () => {
  it("stops after one search when the judge says sufficient", async () => {
    const { calls } = stubFetch({ judge: [{ json: { sufficient: true, reformulated_query: "" } }] });
    const { env, query } = makeEnv({ rounds: [[chunk("a", 0.6)]] });
    const result = await retrieveAdaptive("¿Dónde trabaja Ramiro?", env, config);
    expect(result).toMatchObject({ iterations: 1, verdict: { kind: "sufficient" } });
    expect(query).toHaveBeenCalledTimes(1);
    expect(calls.judge).toHaveLength(1);
    const body = calls.judge[0] as Record<string, any>;
    expect(body.temperature).toBe(0);
    expect(body.response_format.json_schema.name).toBe(JUDGE_SCHEMA.name);
  });

  it("re-searches with the judge's reformulated query and merges by id", async () => {
    stubFetch({ judge: [insufficient("certificaciones de Google Cloud de Ramiro")] });
    const { env, query } = makeEnv({ rounds: [[chunk("weak", 0.33)], [chunk("good", 0.62), chunk("weak", 0.4)]] });
    const result = await retrieveAdaptive("cursos", env, config);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(2);
    expect(result.queries).toEqual(["cursos", "certificaciones de Google Cloud de Ramiro"]);
    expect(result.chunks.map((c) => [c.id, c.score])).toEqual([
      ["good", 0.62],
      ["weak", 0.4],
    ]);
  });

  it("asks the judge even when the first search found nothing", async () => {
    const { calls } = stubFetch({ judge: [insufficient("otra búsqueda")] });
    const { env, query } = makeEnv({ rounds: [[], [chunk("x", 0.5)]] });
    const result = await retrieveAdaptive("algo", env, config);
    expect(calls.judge).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.chunks.map((c) => c.id)).toEqual(["x"]);
  });

  it("never runs more than 2 searches or more than 1 judge call, even if the env asks for more", async () => {
    const { calls } = stubFetch({ judge: [insufficient("b"), insufficient("c"), insufficient("d")] });
    const { env, query } = makeEnv({ rounds: [[], [], [], []] });
    const greedy = readAdaptiveConfig({ ...OPENROUTER_VARS, MAX_RETRIEVAL_ITERATIONS: "10" });
    expect(greedy.maxRetrievalIterations).toBe(MAX_RETRIEVAL_ITERATIONS_CEILING);
    const result = await retrieveAdaptive("a", env, greedy);
    expect(query).toHaveBeenCalledTimes(2);
    expect(calls.judge).toHaveLength(1);
    expect(result.iterations).toBe(2);
    expect(result.chunks).toEqual([]);
  });

  it("MAX_RETRIEVAL_ITERATIONS=1 disables the judge and the re-search", async () => {
    const { fetchMock } = stubFetch();
    const { env, query } = makeEnv({ rounds: [[]] });
    const result = await retrieveAdaptive("a", env, readAdaptiveConfig({ ...OPENROUTER_VARS, MAX_RETRIEVAL_ITERATIONS: "1" }));
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.verdict).toEqual({ kind: "skipped" });
  });

  it("skips the judge when OpenRouter is not configured (linear behaviour)", async () => {
    const { fetchMock } = stubFetch();
    const { env, query } = makeEnv({ rounds: [[chunk("a", 0.33)]] });
    const result = await retrieveAdaptive("a", env, readAdaptiveConfig({}));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ iterations: 1, verdict: { kind: "skipped" } });
  });

  it.each([
    [{ content: "not json" } as ScriptedAnswer, "invalid_json"],
    [{ json: { sufficient: "maybe" } } as ScriptedAnswer, "invalid_shape"],
    [{ status: 503 } as ScriptedAnswer, "http_503"],
    ["hang" as ScriptedAnswer, "timeout"],
  ])("accepts the first search when the judge fails (%j)", async (answer, reason) => {
    stubFetch({ judge: [answer] });
    const { env, query } = makeEnv({ rounds: [[chunk("weak", 0.33)]] });
    const result = await retrieveAdaptive("cursos", env, config);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.chunks.map((c) => c.id)).toEqual(["weak"]);
    expect(result.verdict).toEqual({ kind: "error", reason });
  });

  it("does not re-search with the same query or without one", async () => {
    stubFetch({ judge: [insufficient("Algo Raro"), insufficient("")] });
    const { env, query } = makeEnv({ rounds: [[]] });
    await retrieveAdaptive("algo raro", env, config);
    await retrieveAdaptive("algo raro", env, config);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("keeps the first results when the re-search fails", async () => {
    stubFetch({ judge: [insufficient("otra")] });
    const { env } = makeEnv({ rounds: [[chunk("weak", 0.33)]], vectorizeError: new Error("vectorize down") });
    const result = await retrieveAdaptive("cursos", env, config);
    expect(result.chunks.map((c) => c.id)).toEqual(["weak"]);
    expect(result.iterations).toBe(2);
  });

  it("propagates a first-search failure (same MODEL_ERROR path as before)", async () => {
    stubFetch();
    const env = { ...makeEnv({ rounds: [[]] }).env, VECTORIZE: { query: vi.fn().mockRejectedValue(new Error("down")) } };
    await expect(retrieveAdaptive("a", env, config)).rejects.toThrow("down");
  });
});

describe("readAdaptiveConfig", () => {
  it("is not configured unless BOTH the model and the key are set", () => {
    expect(readAdaptiveConfig({}).openRouter).toBeNull();
    expect(readAdaptiveConfig({ OPENROUTER_MODEL: "m" }).openRouter).toBeNull();
    expect(readAdaptiveConfig({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "" }).openRouter).toBeNull();
  });

  it("uses safe defaults when optional vars are missing or malformed", () => {
    const cfg = readAdaptiveConfig({
      OPENROUTER_API_KEY: " k ",
      OPENROUTER_MODEL: " vendor/model ",
      OPENROUTER_TIMEOUT_MS: "-5",
      OPENROUTER_MAX_TOKENS: "abc",
      OPENROUTER_RESPONSE_FORMAT: "yaml",
      OPENROUTER_REASONING_EFFORT: "turbo",
      MAX_RETRIEVAL_ITERATIONS: "0",
    });
    expect(cfg.openRouter).toEqual({
      apiKey: "k",
      model: "vendor/model",
      endpoint: DEFAULT_OPENROUTER_ENDPOINT,
      timeoutMs: DEFAULT_OPENROUTER_TIMEOUT_MS,
      maxTokens: DEFAULT_OPENROUTER_MAX_TOKENS,
      responseFormat: "json_schema",
      reasoningEffort: null,
    });
    expect(cfg.maxRetrievalIterations).toBe(2);
  });
});
