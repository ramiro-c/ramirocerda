import { describe, expect, it, vi } from "vitest";

import { MAX_RETRIEVAL_ITERATIONS_CEILING, readAdaptiveConfig } from "./config";
import { isSufficient, mergeChunks, retrieveAdaptive } from "./retrieval";

const rule = { sufficiencyMinTopScore: 0.45, sufficiencyMinChunks: 2 };

function chunk(id: string, score: number) {
  return { id, score, metadata: { text: id } };
}

/** Fake env: embeddings for EMBEDDING_MODEL, small-LLM answers for anything else, scripted Vectorize. */
function makeEnv(opts: {
  rounds: Array<Array<{ id: string; score: number }>>;
  reformulation?: string | Error;
  vectorizeError?: Error;
}) {
  let round = 0;
  const query = vi.fn().mockImplementation(() => {
    if (opts.vectorizeError && round > 0) return Promise.reject(opts.vectorizeError);
    const matches = opts.rounds[Math.min(round, opts.rounds.length - 1)] ?? [];
    round += 1;
    return Promise.resolve({ matches: matches.map((m) => ({ ...m, metadata: { text: m.id } })) });
  });
  const run = vi.fn().mockImplementation((model: string) => {
    if (model === "@cf/baai/bge-m3") return Promise.resolve({ data: [[0.1, 0.2]] });
    if (opts.reformulation instanceof Error) return Promise.reject(opts.reformulation);
    return Promise.resolve({ response: opts.reformulation ?? "consulta alternativa sobre Ramiro" });
  });
  const env = {
    AI: { run },
    VECTORIZE: { query },
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
  };
  return { env, query, run };
}

describe("isSufficient", () => {
  it("is false with no chunks", () => {
    expect(isSufficient([], rule)).toBe(false);
  });

  it("is true with one strong chunk", () => {
    expect(isSufficient([chunk("a", 0.6)], rule)).toBe(true);
  });

  it("is true with several chunks above the gate even if none is strong", () => {
    expect(isSufficient([chunk("a", 0.35), chunk("b", 0.33)], rule)).toBe(true);
  });

  it("is false with a single weak chunk", () => {
    expect(isSufficient([chunk("a", 0.34)], rule)).toBe(false);
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
  const config = readAdaptiveConfig({});

  it("stops after one search when the chunks are sufficient", async () => {
    const { env, query, run } = makeEnv({ rounds: [[chunk("a", 0.6)]] });
    const result = await retrieveAdaptive("¿Dónde trabaja Ramiro?", env, config);
    expect(result.iterations).toBe(1);
    expect(query).toHaveBeenCalledTimes(1);
    // Only the embedding call: no reformulation.
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("re-searches with a reformulated query and merges the results", async () => {
    const { env, query } = makeEnv({
      rounds: [[chunk("weak", 0.33)], [chunk("good", 0.62), chunk("weak", 0.4)]],
      reformulation: "certificaciones de Google Cloud de Ramiro",
    });
    const result = await retrieveAdaptive("cursos", env, config);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(2);
    expect(result.queries).toEqual(["cursos", "certificaciones de Google Cloud de Ramiro"]);
    expect(result.chunks.map((c) => [c.id, c.score])).toEqual([
      ["good", 0.62],
      ["weak", 0.4],
    ]);
  });

  it("never runs more than 2 searches, even if the env asks for more", async () => {
    const { env, query } = makeEnv({ rounds: [[], [], [], []] });
    const greedy = readAdaptiveConfig({ MAX_RETRIEVAL_ITERATIONS: "10" });
    expect(greedy.maxRetrievalIterations).toBe(MAX_RETRIEVAL_ITERATIONS_CEILING);
    const result = await retrieveAdaptive("algo raro", env, greedy);
    expect(query).toHaveBeenCalledTimes(2);
    expect(result.iterations).toBe(2);
    expect(result.chunks).toEqual([]);
  });

  it("does a single search when MAX_RETRIEVAL_ITERATIONS=1", async () => {
    const { env, query, run } = makeEnv({ rounds: [[]] });
    await retrieveAdaptive("algo raro", env, readAdaptiveConfig({ MAX_RETRIEVAL_ITERATIONS: "1" }));
    expect(query).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not re-search when the reformulation fails", async () => {
    const { env, query } = makeEnv({ rounds: [[]], reformulation: new Error("down") });
    const result = await retrieveAdaptive("algo raro", env, config);
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
  });

  it("does not re-search with the same query", async () => {
    const { env, query } = makeEnv({ rounds: [[]], reformulation: "Algo raro" });
    await retrieveAdaptive("algo raro", env, config);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("keeps the first results when the re-search fails", async () => {
    const { env } = makeEnv({ rounds: [[chunk("weak", 0.33)]], vectorizeError: new Error("vectorize down") });
    const result = await retrieveAdaptive("cursos", env, config);
    expect(result.chunks.map((c) => c.id)).toEqual(["weak"]);
  });
});

describe("readAdaptiveConfig", () => {
  it("uses safe defaults when vars are missing or malformed", () => {
    const cfg = readAdaptiveConfig({ SUFFICIENCY_MIN_TOP_SCORE: "nope", ROUTER_TIMEOUT_MS: "-5", ROUTER_MODEL: " " });
    expect(cfg.sufficiencyMinTopScore).toBe(0.45);
    expect(cfg.routerTimeoutMs).toBe(1500);
    expect(cfg.routerModel).toBe("@cf/meta/llama-3.2-3b-instruct");
    expect(cfg.rewriteModel).toBe(cfg.routerModel);
    expect(cfg.routerLlmEnabled).toBe(true);
    expect(readAdaptiveConfig({ ROUTER_LLM_ENABLED: "false" }).routerLlmEnabled).toBe(false);
  });
});
