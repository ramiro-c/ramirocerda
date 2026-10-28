/**
 * Adaptive RAG through worker.fetch (handleRag): routing, judge, re-search cap,
 * the offerContact contract and the not-configured fallback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import worker, { NO_INFO_REPLY, OFF_TOPIC_REPLY, SMALLTALK_INSTRUCTION } from "./index";
import { GENERATION_ENDPOINT, OPENROUTER_VARS, stubFetch, type FetchScript } from "./test-utils";

interface Datapoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

type Match = { id: string; score: number; metadata?: Record<string, unknown> };

function makeEnv(opts: { rounds?: Match[][]; configured?: boolean } = {}) {
  const datapoints: Datapoint[] = [];
  const rounds = opts.rounds ?? [[]];
  let round = 0;
  const query = vi.fn().mockImplementation(() => {
    const matches = rounds[Math.min(round, rounds.length - 1)];
    round += 1;
    return Promise.resolve({ matches });
  });
  const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });
  const env = {
    AI: { run },
    VECTORIZE: { query },
    ANALYTICS: { writeDataPoint: (p: Datapoint) => datapoints.push(p) },
    OPENCODE_GO_API_KEY: "secret-key",
    RAG_ENABLED: "true",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    GENERATION_MODEL: "deepseek-v4-flash",
    OPENCODE_GO_ENDPOINT: GENERATION_ENDPOINT,
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    CHAT_RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
    ...(opts.configured === false ? {} : OPENROUTER_VARS),
  };
  return { env, datapoints, query, run };
}

function makeRequest(message: string, history: Array<{ role: string; content: string }> = []): Request {
  return new Request("https://worker.example/ask", {
    method: "POST",
    headers: { Origin: "https://ramirocerda.com.ar", "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, sessionId: "conv-adaptive" }),
  });
}

async function ask(env: unknown, message: string, script: FetchScript, history: Array<{ role: string; content: string }> = []) {
  const stub = stubFetch(script);
  const res = await worker.fetch(makeRequest(message, history), env as never);
  return { res, body: (await res.json()) as Record<string, unknown>, ...stub };
}

const route = (r: string, hire = false, query = "") => ({ json: { route: r, hire_intent: hire, query } });
const strong: Match = { id: "kb-a", score: 0.62, metadata: { section: "Experiencia", text: "Ramiro trabaja en LDP." } };

describe("adaptive RAG through handleRag", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("without OPENROUTER_MODEL/KEY behaves like the linear pipeline: no OpenRouter call, raw query, offerContact false", async () => {
    const { env, query, run } = makeEnv({ rounds: [[strong]], configured: false });
    const { res, body, calls } = await ask(env, "¿Dónde trabaja?", {});
    expect(res.status).toBe(200);
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    expect(calls.router).toHaveLength(0);
    expect(calls.judge).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual({ text: ["¿Dónde trabaja?"] });
  });

  it("smalltalk: one short generation, no embedding, no Vectorize, no judge", async () => {
    const { env, query, run, datapoints } = makeEnv();
    const { body, calls } = await ask(env, "hola!", { router: [route("smalltalk")], generation: "¡Hola! Soy Botardo." });
    expect(body).toEqual({ reply: "¡Hola! Soy Botardo.", offerContact: false });
    expect(query).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(calls.judge).toHaveLength(0);
    expect(calls.generation).toHaveLength(1);
    const gen = calls.generation[0] as { messages: Array<{ role: string; content: string }> };
    expect(gen.messages[0].content).toContain(SMALLTALK_INSTRUCTION);
    expect(gen.messages.at(-1)).toEqual({ role: "user", content: "hola!" });
    expect(datapoints[0]?.doubles?.slice(4, 11)).toEqual([1, 0, 0, expect.any(Number), 0, 0, 0]);
  });

  it("off_topic: fixed localized reply, no retrieval, no generation", async () => {
    const { env, query, run, datapoints } = makeEnv();
    const { body, calls } = await ask(env, "¿Cuál es la capital de Francia?", { router: [route("off_topic")] });
    expect(body).toEqual({ reply: OFF_TOPIC_REPLY.es, offerContact: false });
    expect(query).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(calls.generation).toHaveLength(0);
    expect(datapoints[0]?.doubles?.[4]).toBe(2);
    expect(datapoints[0]?.doubles?.[5]).toBe(0);
  });

  it("exposes hire_intent as offerContact on the reply, in the logs and in analytics", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { env, datapoints } = makeEnv({ rounds: [[strong]] });
    const { body } = await ask(env, "¿Está disponible para un proyecto freelance?", {
      router: [route("search", true, "disponibilidad de Ramiro para freelance")],
      judge: [{ json: { sufficient: true, reformulated_query: "" } }],
    });
    expect(body).toEqual({ reply: "Respuesta", offerContact: true });
    const routeLog = logSpy.mock.calls.map(([line]) => JSON.parse(String(line))).find((e) => e.event === "chat.route");
    expect(routeLog).toMatchObject({ route: "search", via: "llm", hire_intent: true, offer_contact: true, rewritten: true });
    expect(datapoints[0]?.doubles?.[8]).toBe(1);
    expect(datapoints[0]?.doubles?.[9]).toBe(0);
    expect(datapoints[0]?.doubles?.[10]).toBe(1);
  });

  it("propagates offerContact on canned replies too (off_topic and no_info)", async () => {
    const offTopic = await ask(makeEnv().env, "¿me ayudás con un script?", { router: [route("off_topic", true)] });
    expect(offTopic.body.offerContact).toBe(true);
    vi.unstubAllGlobals();
    const noInfo = await ask(makeEnv({ rounds: [[]] }).env, "¿Cuál es su tarifa?", {
      router: [route("search", true, "tarifa de Ramiro")],
      judge: [{ json: { sufficient: false, reformulated_query: "precio por hora Ramiro" } }],
    });
    expect(noInfo.body).toEqual({ reply: NO_INFO_REPLY.es, offerContact: true });
  });

  it("falls back to search with the raw message and offerContact false when the router fails", async () => {
    const { env, run, datapoints } = makeEnv({ rounds: [[strong]] });
    const { body, calls } = await ask(env, "¿Quiero contratarlo, cómo hago?", {
      router: [{ content: "definitely hiring!" }],
      judge: [{ json: { sufficient: true, reformulated_query: "" } }],
    });
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    expect(run.mock.calls[0][1]).toEqual({ text: ["¿Quiero contratarlo, cómo hago?"] });
    expect(calls.generation).toHaveLength(1);
    expect(datapoints[0]?.doubles?.[9]).toBe(1);
  });

  it("searches with the router's standalone query but generates with the original message + history", async () => {
    const { env, run, datapoints } = makeEnv({ rounds: [[strong]] });
    const history = [
      { role: "user", content: "¿Dónde trabaja Ramiro?" },
      { role: "assistant", content: "En LDP." },
    ];
    const { calls } = await ask(
      env,
      "¿y antes?",
      { router: [route("search", false, "trabajos anteriores de Ramiro antes de LDP")], judge: [{ json: { sufficient: true, reformulated_query: "" } }] },
      history,
    );
    expect(run.mock.calls[0][1]).toEqual({ text: ["trabajos anteriores de Ramiro antes de LDP"] });
    const gen = calls.generation[0] as { messages: Array<{ role: string; content: string }> };
    expect(gen.messages.at(-1)).toEqual({ role: "user", content: "¿y antes?" });
    expect(gen.messages[1]).toEqual({ role: "user", content: "¿Dónde trabaja Ramiro?" });
    expect(datapoints[0]?.doubles?.[6]).toBe(1);
  });

  it("re-searches once when the judge says insufficient, then generates with merged chunks", async () => {
    const weak: Match = { id: "kb-weak", score: 0.33, metadata: { section: "Cursos", text: "algo" } };
    const good: Match = { id: "kb-certs", score: 0.66, metadata: { section: "Certificaciones", text: "GCP" } };
    const { env, query, datapoints } = makeEnv({ rounds: [[weak], [good, weak]] });
    const { body, calls } = await ask(env, "¿hizo cursos?", {
      router: [route("search", false, "cursos de Ramiro")],
      judge: [{ json: { sufficient: false, reformulated_query: "certificaciones de Ramiro" } }],
    });
    expect(body.reply).toBe("Respuesta");
    expect(query).toHaveBeenCalledTimes(2);
    expect(calls.judge).toHaveLength(1);
    const gen = calls.generation[0] as { messages: Array<{ content: string }> };
    expect(gen.messages[0].content).toContain("GCP");
    expect(datapoints[0]?.doubles?.[0]).toBe(2);
    expect(datapoints[0]?.doubles?.[1]).toBeCloseTo(0.66);
    expect(datapoints[0]?.doubles?.[5]).toBe(2);
    expect(datapoints[0]?.doubles?.[10]).toBe(2);
  });

  it("caps a message at 1 router call, 1 judge call and 2 searches", async () => {
    const { env, query } = makeEnv({ rounds: [[], [], []] });
    const { body, calls } = await ask(env, "algo muy raro", {
      router: [route("search", false, "algo muy raro"), route("search")],
      judge: [
        { json: { sufficient: false, reformulated_query: "otra cosa" } },
        { json: { sufficient: false, reformulated_query: "tercera" } },
      ],
    });
    expect(body).toEqual({ reply: NO_INFO_REPLY.es, offerContact: false });
    expect(calls.router).toHaveLength(1);
    expect(calls.judge).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(2);
    expect(calls.generation).toHaveLength(0);
  });

  it("keeps the 429 error body verbatim (no offerContact) when generation is rate limited", async () => {
    const { env } = makeEnv({ rounds: [[strong]], configured: false });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate", { status: 429 })));
    const res = await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      error: "Demasiadas consultas. Esperá un momento y volvé a intentar.",
      code: "RATE_LIMITED",
    });
  });
});
