/**
 * handleRag integration paths for adaptive RAG, driven through worker.fetch.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { NO_INFO_REPLY, OFF_TOPIC_REPLY, SMALLTALK_REPLY } from "./index";

interface Datapoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

type Match = { id: string; score: number; metadata?: Record<string, unknown> };

function makeEnv(opts: {
  /** Vectorize results per search, in order (last one repeats). */
  rounds?: Match[][];
  /** Answer of the small Workers AI model (router / rewrite / reformulation), by call order. */
  smallLlm?: Array<string | Error>;
  extraVars?: Record<string, string>;
}) {
  const datapoints: Datapoint[] = [];
  const rounds = opts.rounds ?? [[]];
  let round = 0;
  const query = vi.fn().mockImplementation(() => {
    const matches = rounds[Math.min(round, rounds.length - 1)];
    round += 1;
    return Promise.resolve({ matches });
  });
  const small = [...(opts.smallLlm ?? [])];
  const run = vi.fn().mockImplementation((model: string) => {
    if (model === "@cf/baai/bge-m3") return Promise.resolve({ data: [[0.1, 0.2, 0.3]] });
    const next = small.shift();
    if (next === undefined) return Promise.resolve({});
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve({ response: next });
  });
  const env = {
    AI: { run },
    VECTORIZE: { query },
    ANALYTICS: { writeDataPoint: (p: Datapoint) => datapoints.push(p) },
    OPENCODE_GO_API_KEY: "secret-key",
    RAG_ENABLED: "true",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    GENERATION_MODEL: "deepseek-v4-flash",
    OPENCODE_GO_ENDPOINT: "https://opencode.example/v1/chat/completions",
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    CHAT_RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
    ...opts.extraVars,
  };
  const smallCalls = () => run.mock.calls.filter(([model]) => model !== "@cf/baai/bge-m3");
  return { env, datapoints, query, run, smallCalls };
}

function makeRequest(message: string, history: Array<{ role: string; content: string }> = []): Request {
  return new Request("https://worker.example/ask", {
    method: "POST",
    headers: { Origin: "https://ramirocerda.com.ar", "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, sessionId: "conv-adaptive" }),
  });
}

function stubGeneration(content = "Respuesta") {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("adaptive RAG through handleRag", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers smalltalk with a canned reply: no Vectorize, no embedding, no LLM", async () => {
    const { env, query, run, datapoints } = makeEnv({});
    const fetchMock = stubGeneration();

    const res = await worker.fetch(makeRequest("¡Hola!"), env as never);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(SMALLTALK_REPLY.greeting.es);
    expect(query).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    // Existing columns untouched; appended: route=1 (smalltalk), 0 iterations, not rewritten.
    expect(datapoints[0]?.blobs).toEqual(["es", "ok", "¡Hola!"]);
    expect(datapoints[0]?.doubles?.slice(0, 2)).toEqual([0, 0]);
    expect(datapoints[0]?.doubles?.slice(4, 7)).toEqual([1, 0, 0]);
  });

  it("answers English smalltalk in English even though language detection defaults to es", async () => {
    const { env } = makeEnv({});
    stubGeneration();
    const res = await worker.fetch(makeRequest("thanks!"), env as never);
    expect((await res.json()).reply).toBe(SMALLTALK_REPLY.thanks.en);
  });

  it("refuses off-topic messages: no Vectorize, no generation, one small router call", async () => {
    const { env, query, smallCalls, datapoints } = makeEnv({ smallLlm: ["off_topic"] });
    const fetchMock = stubGeneration();

    const res = await worker.fetch(makeRequest("What is the capital of France?"), env as never);
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(OFF_TOPIC_REPLY.en);
    expect(query).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(smallCalls()).toHaveLength(1);
    expect(datapoints[0]?.doubles?.[4]).toBe(2);
    expect(datapoints[0]?.doubles?.[5]).toBe(0);
  });

  it("fails open to retrieval when the router LLM errors", async () => {
    const { env, query } = makeEnv({
      smallLlm: [new Error("router down")],
      rounds: [[{ id: "kb-a", score: 0.6, metadata: { text: "t" } }]],
    });
    const fetchMock = stubGeneration("Ok");
    const res = await worker.fetch(makeRequest("Tell me something interesting"), env as never);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-searches once when the first retrieval is insufficient, then generates with merged chunks", async () => {
    const { env, query, datapoints } = makeEnv({
      // Router is heuristic (mentions Ramiro), so the only small call is the reformulation.
      smallLlm: ["certificaciones de Ramiro en Google Cloud"],
      rounds: [
        [{ id: "kb-weak", score: 0.33, metadata: { section: "Stack", text: "texto débil" } }],
        [{ id: "kb-cert", score: 0.66, metadata: { section: "Certificaciones", text: "10 certificaciones" } }],
      ],
    });
    const fetchMock = stubGeneration("Hizo el path de AI Agents.");

    const res = await worker.fetch(makeRequest("¿Qué cursos hizo Ramiro?"), env as never);
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages[0].content).toContain("10 certificaciones");
    expect(body.messages[0].content).toContain("texto débil");
    // The visitor's original message is what the generation model answers.
    expect(body.messages.at(-1).content).toBe("¿Qué cursos hizo Ramiro?");
    expect(datapoints[0]?.doubles?.[0]).toBe(2);
    expect(datapoints[0]?.doubles?.[1]).toBeCloseTo(0.66);
    expect(datapoints[0]?.doubles?.[5]).toBe(2);
  });

  it("keeps NO_INFO_REPLY without generation when both searches find nothing", async () => {
    const { env, query } = makeEnv({ smallLlm: ["otra consulta sobre Ramiro"], rounds: [[], []] });
    const fetchMock = stubGeneration();
    const res = await worker.fetch(makeRequest("¿Cuál es el color favorito de Ramiro?"), env as never);
    expect((await res.json()).reply).toBe(NO_INFO_REPLY.es);
    expect(query).toHaveBeenCalledTimes(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rewrites follow-ups with history and searches with the standalone query", async () => {
    const { env, run, query, datapoints } = makeEnv({
      smallLlm: ["about_ramiro", "¿Dónde trabajó Ramiro antes de LDP?"],
      rounds: [[{ id: "kb-prev", score: 0.58, metadata: { text: "DevGAM" } }]],
    });
    const fetchMock = stubGeneration("En DevGAM.");
    const history = [
      { role: "user", content: "¿Dónde trabaja Ramiro?" },
      { role: "assistant", content: "En LDP como Tech Lead." },
    ];
    const res = await worker.fetch(makeRequest("¿y antes?", history), env as never);
    expect(res.status).toBe(200);
    const embedCall = run.mock.calls.find(([model]) => model === "@cf/baai/bge-m3");
    expect(embedCall?.[1]).toEqual({ text: ["¿Dónde trabajó Ramiro antes de LDP?"] });
    expect(query).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages.at(-1).content).toBe("¿y antes?");
    expect(datapoints[0]?.doubles?.[6]).toBe(1);
  });

  it("searches with the raw message when the rewrite fails", async () => {
    const { env, run } = makeEnv({
      smallLlm: ["about_ramiro", new Error("rewrite down")],
      rounds: [[{ id: "kb-prev", score: 0.58, metadata: { text: "DevGAM" } }]],
    });
    stubGeneration("Ok");
    const history = [
      { role: "user", content: "¿Dónde trabaja Ramiro?" },
      { role: "assistant", content: "En LDP." },
    ];
    await worker.fetch(makeRequest("¿y antes?", history), env as never);
    const embedCall = run.mock.calls.find(([model]) => model === "@cf/baai/bge-m3");
    expect(embedCall?.[1]).toEqual({ text: ["¿y antes?"] });
  });

  it("does not call the rewrite model without history", async () => {
    const { env, smallCalls } = makeEnv({ rounds: [[{ id: "kb-a", score: 0.6, metadata: { text: "t" } }]] });
    stubGeneration("Ok");
    await worker.fetch(makeRequest("¿Qué stack usa Ramiro?"), env as never);
    expect(smallCalls()).toHaveLength(0);
  });
});
