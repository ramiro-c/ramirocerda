/**
 * Adaptive RAG through worker.fetch (handleRag): routing, judge, re-search cap,
 * the offerContact contract and the not-configured fallback.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetFreeTierBreaker } from "./breaker";
import { DEFAULT_DECISION_FREE_COOLDOWN_MS } from "./config";
import worker from "./index";
import { NO_INFO_REPLY, OFF_TOPIC_REPLY, SMALLTALK_INSTRUCTION } from "./prompts";
import {
  DECISION_OFF,
  DECISION_VARS,
  GENERATION_ENDPOINT,
  judgeAnswer,
  routerAnswer,
  stubFetch,
  type FetchScript,
} from "./test-utils";

interface Datapoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

type Match = { id: string; score: number; metadata?: Record<string, unknown> };

function makeEnv(opts: { rounds?: Match[][]; configured?: boolean; vars?: Record<string, string> } = {}) {
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
    ...(opts.configured === false ? DECISION_OFF : DECISION_VARS),
    ...(opts.vars ?? {}),
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

const strong: Match = { id: "kb-a", score: 0.62, metadata: { section: "Experiencia", text: "Ramiro trabaja en LDP." } };
const history = [
  { role: "user", content: "¿Dónde trabaja Ramiro?" },
  { role: "assistant", content: "En LDP." },
];

describe("adaptive RAG through handleRag", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("with DECISION_MODEL=\"\" behaves like the linear pipeline: no decision call, raw query, offerContact false", async () => {
    const { env, query, run, datapoints } = makeEnv({ rounds: [[strong]], configured: false });
    const { res, body, calls } = await ask(env, "¿Dónde trabaja?", {});
    expect(res.status).toBe(200);
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    expect(calls.router).toHaveLength(0);
    expect(calls.judge).toHaveLength(0);
    expect(query).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][1]).toEqual({ text: ["¿Dónde trabaja?"] });
    expect(datapoints[0]?.doubles?.[9]).toBe(2);
  });

  it("is on by default (no DECISION_* vars): one anonymous Jev request routes the message", async () => {
    const { env } = makeEnv();
    const { body, calls } = await ask(env, "hola!", { router: [routerAnswer("smalltalk")] });
    expect(body.reply).toBe("Respuesta");
    expect(calls.router).toHaveLength(1);
    expect(calls.router[0].model).toBe("jev-1.13-free");
    expect(calls.decisionHeaders[0].Authorization).toBeUndefined();
  });

  it("smalltalk: one short generation, no embedding, no Vectorize, no judge", async () => {
    const { env, query, run, datapoints } = makeEnv();
    const { body, calls } = await ask(env, "hola!", { router: [routerAnswer("smalltalk")], generation: "¡Hola! Soy Botardo." });
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
    const { body, calls } = await ask(env, "¿Cuál es la capital de Francia?", { router: [routerAnswer("off_topic")] });
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
    const { body } = await ask(
      env,
      "¿Está disponible para un proyecto freelance?",
      { router: [routerAnswer("search", { hire: 0.98, needsHistory: 0.1 })], judge: [judgeAnswer(0.9)] },
      history,
    );
    expect(body).toEqual({ reply: "Respuesta", offerContact: true });
    const routeLog = logSpy.mock.calls.map(([line]) => JSON.parse(String(line))).find((e) => e.event === "chat.route");
    expect(routeLog).toMatchObject({
      route: "search",
      via: "llm",
      model_tier: "free",
      model: "jev-1.13-free",
      fallback: "not_needed",
      integration: "opencode",
      hire_intent: true,
      hire_intent_p: 0.98,
      offer_contact: true,
      rewritten: false,
    });
    expect(datapoints[0]?.doubles?.[8]).toBe(1);
    expect(datapoints[0]?.doubles?.[9]).toBe(0);
    expect(datapoints[0]?.doubles?.[10]).toBe(1);
  });

  it("logs and records which model answered when the free call fails and the paid fallback answers", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const base = makeEnv({ rounds: [[strong]] });
    const env = { ...base.env, OPENCODE_GO_API_KEY: "go-key" };
    const { body, calls } = await ask(
      env,
      "¿Está disponible para un proyecto freelance?",
      { router: [{ status: 400 }, routerAnswer("search", { hire: 0.95, needsHistory: 0.1 })], judge: ["hang", judgeAnswer(0.9)] },
      history,
    );
    expect(body).toEqual({ reply: "Respuesta", offerContact: true });
    expect(calls.router.map((b) => b.model)).toEqual(["jev-1.13-free", "jev-1.13"]);
    expect(calls.judge.map((b) => b.model)).toEqual(["jev-1.13-free", "jev-1.13"]);
    const events = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events.find((e) => e.event === "chat.route")).toMatchObject({
      model_tier: "paid",
      model: "jev-1.13",
      primary_error: "http_400",
      fallback: "used",
    });
    expect(events.find((e) => e.event === "chat.rag_judge")).toMatchObject({
      model_tier: "paid",
      primary_error: "timeout",
      fallback: "used",
    });
    expect(base.datapoints[0]?.blobs?.[3]).toBe("paid");
    expect(JSON.stringify(events)).not.toContain("go-key");
  });

  it("logs model_tier none and keeps the safe default when both decision attempts fail", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const base = makeEnv({ rounds: [[strong]] });
    const env = { ...base.env, OPENCODE_GO_API_KEY: "go-key" };
    const { body, run } = { ...(await ask(env, "quiero contratarlo", { router: [{ status: 500 }, { status: 500 }] })), run: base.run };
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    expect(run.mock.calls[0][1]).toEqual({ text: ["quiero contratarlo"] });
    const routeLog = logSpy.mock.calls.map(([line]) => JSON.parse(String(line))).find((e) => e.event === "chat.route");
    expect(routeLog).toMatchObject({ route: "search", via: "http_500", model_tier: "none", model: null, fallback: "failed" });
    expect(base.datapoints[0]?.blobs?.[3]).toBe("none");
  });

  it("logs the generation HTTP status so an expired key is not mistaken for a rate limit", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv({ rounds: [[strong]] });
    const script = { router: [routerAnswer("search")], judge: [judgeAnswer(0.9)] };

    const ok = await ask(env, "¿Qué proyectos hizo Ramiro?", script);
    expect(ok.res.status).toBe(200);

    const expired = await ask(env, "¿Qué proyectos hizo Ramiro?", { ...script, generationStatus: 401 });
    expect(expired.res.status).toBe(500);
    expect(expired.body).toMatchObject({ code: "MODEL_ERROR" });

    const events = logSpy.mock.calls
      .map(([line]) => JSON.parse(String(line)))
      .filter((e) => e.event === "chat.ai_done")
      .map(({ ts, event, latency_ms, ...rest }) => rest);
    // reply_length is 0 for every failure, so the upstream status is the only
    // signal that tells an expired key (401) from a rate limit or an outage.
    expect(events).toEqual([
      { status: 200, reply_length: "Respuesta".length, truncated: false },
      { status: 500, reply_length: 0, truncated: false, upstream_status: 401 },
    ]);
  });

  it("paid retry reuses the generation key OPENCODE_GO_API_KEY as Bearer; the free call never carries it; never logged", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { env } = makeEnv({ rounds: [[strong]] }); // OPENCODE_GO_API_KEY: "secret-key", no extra secret
    const { body, calls, fetchMock } = await ask(env, "¿Dónde trabaja?", { router: [{ status: 503 }, routerAnswer("search")] });
    expect(body.reply).toBe("Respuesta");
    expect(calls.router.map((b) => b.model)).toEqual(["jev-1.13-free", "jev-1.13"]);
    expect(calls.decisionHeaders[0].Authorization).toBeUndefined();
    expect(calls.decisionHeaders[1].Authorization).toBe("Bearer secret-key");
    const genCall = fetchMock.mock.calls.find(([url]) => url === GENERATION_ENDPOINT);
    const genHeaders = new Headers(genCall?.[1]?.headers as HeadersInit);
    expect(genHeaders.get("Authorization")).toBe("Bearer secret-key");
    const output = JSON.stringify([logSpy.mock.calls, errSpy.mock.calls, warnSpy.mock.calls]);
    expect(output).not.toContain("secret-key");
  });

  it("skips the paid retry when OPENCODE_GO_API_KEY is unset (fallback skipped_no_key)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { env } = makeEnv({ rounds: [[strong]] });
    const { OPENCODE_GO_API_KEY: _omit, ...noKey } = env;
    const { calls } = await ask(noKey, "¿Dónde trabaja?", { router: [{ status: 500 }, routerAnswer("search")] });
    expect(calls.router).toHaveLength(1);
    expect(calls.decisionHeaders.every((h) => h.Authorization === undefined)).toBe(true);
    const routeLog = logSpy.mock.calls.map(([line]) => JSON.parse(String(line))).find((e) => e.event === "chat.route");
    expect(routeLog).toMatchObject({ via: "http_500", model_tier: "none", primary_error: "http_500", fallback: "skipped_no_key" });
  });

  it("a rejected key shows as fallback failed with the free and paid errors in chat.route", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv({ rounds: [[strong]] });
    const { body } = await ask(env, "quiero contratarlo", { router: [{ status: 400 }, { status: 401 }] });
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    const routeLog = logSpy.mock.calls.map(([line]) => JSON.parse(String(line))).find((e) => e.event === "chat.route");
    expect(routeLog).toMatchObject({ via: "http_401", model_tier: "none", primary_error: "http_400", fallback: "failed" });
  });

  it("propagates offerContact on canned replies too (off_topic and no_info)", async () => {
    const offTopic = await ask(makeEnv().env, "¿me ayudás con un script?", { router: [routerAnswer("off_topic", { hire: 0.7 })] });
    expect(offTopic.body).toEqual({ reply: OFF_TOPIC_REPLY.es, offerContact: true });
    vi.unstubAllGlobals();
    const noInfo = await ask(makeEnv({ rounds: [[]] }).env, "¿Cuál es su tarifa?", { router: [routerAnswer("search", { hire: 0.88 })] });
    expect(noInfo.body).toEqual({ reply: NO_INFO_REPLY.es, offerContact: true });
  });

  it("falls back to search with the raw message and offerContact false when the router fails", async () => {
    const { env, run, datapoints } = makeEnv({ rounds: [[strong]] });
    const { body, calls } = await ask(env, "¿Quiero contratarlo, cómo hago?", { router: [{ text: "definitely hiring!" }] });
    expect(body).toEqual({ reply: "Respuesta", offerContact: false });
    expect(run.mock.calls[0][1]).toEqual({ text: ["¿Quiero contratarlo, cómo hago?"] });
    expect(calls.judge).toHaveLength(0);
    expect(calls.generation).toHaveLength(1);
    expect(datapoints[0]?.doubles?.[9]).toBe(1);
  });

  it("searches with previous user turn + message for follow-ups but generates with the original message + history", async () => {
    const { env, run, datapoints } = makeEnv({ rounds: [[strong]] });
    const { calls } = await ask(
      env,
      "¿y antes?",
      { router: [routerAnswer("search", { needsHistory: 0.93 })], judge: [judgeAnswer(0.8)] },
      history,
    );
    expect(run.mock.calls[0][1]).toEqual({ text: ["¿Dónde trabaja Ramiro? ¿y antes?"] });
    expect(calls.judge[0].state.question).toBe("¿y antes?");
    const gen = calls.generation[0] as { messages: Array<{ role: string; content: string }> };
    expect(gen.messages.at(-1)).toEqual({ role: "user", content: "¿y antes?" });
    expect(gen.messages[1]).toEqual({ role: "user", content: "¿Dónde trabaja Ramiro?" });
    expect(datapoints[0]?.doubles?.[6]).toBe(1);
  });

  it("re-searches once with the alternate query when the judge says insufficient, then generates with merged chunks", async () => {
    const weak: Match = { id: "kb-weak", score: 0.33, metadata: { section: "Cursos", text: "algo" } };
    const good: Match = { id: "kb-certs", score: 0.66, metadata: { section: "Certificaciones", text: "GCP" } };
    const { env, query, run, datapoints } = makeEnv({ rounds: [[weak], [good, weak]] });
    const { body, calls } = await ask(
      env,
      "¿hizo cursos?",
      { router: [routerAnswer("search", { needsHistory: 0.2 })], judge: [judgeAnswer(0.1)] },
      history,
    );
    expect(body.reply).toBe("Respuesta");
    expect(query).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][1]).toEqual({ text: ["¿Dónde trabaja Ramiro? ¿hizo cursos?"] });
    expect(calls.judge).toHaveLength(1);
    const gen = calls.generation[0] as { messages: Array<{ content: string }> };
    expect(gen.messages[0].content).toContain("GCP");
    expect(datapoints[0]?.doubles?.[0]).toBe(2);
    expect(datapoints[0]?.doubles?.[1]).toBeCloseTo(0.66);
    expect(datapoints[0]?.doubles?.[5]).toBe(2);
    expect(datapoints[0]?.doubles?.[10]).toBe(2);
  });

  it("caps a message at 1 router request, 1 judge request and 2 searches", async () => {
    const { env, query } = makeEnv({ rounds: [[], [], []] });
    const { body, calls } = await ask(
      env,
      "algo muy raro",
      {
        router: [routerAnswer("search", { needsHistory: 0.9 }), routerAnswer("search")],
        judge: [judgeAnswer(0), judgeAnswer(0)],
      },
      history,
    );
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

  it("logs the queries that were actually searched in chat.rag_retrieved", async () => {
    const { env } = makeEnv({ rounds: [[strong], [strong]] });
    const lines: Array<Record<string, any>> = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(JSON.parse(line));
    });

    await ask(
      env,
      "¿Y sus estudios?",
      { router: [routerAnswer("search", { needsHistory: 0.9 })], judge: [judgeAnswer(0.05)] },
      history,
    );

    const retrieved = lines.find((l) => l.event === "chat.rag_retrieved");
    expect(retrieved?.iterations).toBe(2);
    // Both searches, in order: the history-merged query first, the raw message second.
    expect(retrieved?.queries).toHaveLength(2);
    expect(retrieved?.queries?.[1]).toBe("¿Y sus estudios?");
  });
});

/**
 * The free tier answers 429 once its usage limit is spent. Without memory of that,
 * every router and judge call pays a wasted anonymous round trip before the paid
 * retry. The breaker is isolate state, so each test starts from a closed breaker.
 */
describe("free-tier breaker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetFreeTierBreaker();
  });

  it("after a 429 on the anonymous attempt the next message goes straight to the paid model", async () => {
    const stub = stubFetch(
      { router: [{ status: 429 }, routerAnswer("search"), routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();
    const { env } = makeEnv({ rounds: [[strong], [strong]] });

    const first = await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(first.status).toBe(200);
    expect(stub.calls.router).toHaveLength(2);
    expect(stub.calls.router[1].model).toBe("jev-1.13");
    expect(stub.calls.decisionHeaders[1].Authorization).toBe("Bearer secret-key");

    const second = await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(second.status).toBe(200);
    // One call, already paid: the anonymous 429 is not paid again inside the window.
    expect(stub.calls.router).toHaveLength(3);
    expect(stub.calls.router[2].model).toBe("jev-1.13");
    expect(stub.calls.decisionHeaders[2].Authorization).toBe("Bearer secret-key");
  });

  it("does not open the breaker on a failure that is not a 429", async () => {
    const stub = stubFetch(
      { router: [{ status: 500 }, routerAnswer("search"), routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();
    const { env } = makeEnv({ rounds: [[strong], [strong]] });

    await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(stub.calls.router).toHaveLength(2);

    const second = await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(second.status).toBe(200);
    // Still anonymous: a 500 is a transient upstream error, not an exhaustion signal.
    expect(stub.calls.router).toHaveLength(3);
    expect(stub.calls.router[2].model).toBe("jev-1.13-free");
    expect(stub.calls.decisionHeaders[2].Authorization).toBeUndefined();
  });

  it("reopens the anonymous attempt once the cooldown elapses", async () => {
    const stub = stubFetch(
      { router: [{ status: 429 }, routerAnswer("search"), routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();
    let clock = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const { env } = makeEnv({ rounds: [[strong], [strong]] });

    await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(stub.calls.router).toHaveLength(2);

    clock += DEFAULT_DECISION_FREE_COOLDOWN_MS + 1;
    await worker.fetch(makeRequest("¿Dónde trabaja?"), env as never);
    expect(stub.calls.router).toHaveLength(3);
    expect(stub.calls.router[2].model).toBe("jev-1.13-free");
  });

  it("never skips the anonymous attempt when no paid key is configured", async () => {
    const stub = stubFetch({ router: [{ status: 429 }, routerAnswer("search")] }, { resetBreaker: false });
    resetFreeTierBreaker();
    const { env } = makeEnv({ rounds: [[strong], [strong]] });
    const { OPENCODE_GO_API_KEY: _omit, ...noKey } = env;

    const first = await worker.fetch(makeRequest("¿Dónde trabaja?"), noKey as never);
    expect(first.status).toBe(200);
    expect(stub.calls.router).toHaveLength(1);

    const second = await worker.fetch(makeRequest("¿Dónde trabaja?"), noKey as never);
    expect(second.status).toBe(200);
    // There is no paid path to fall back to, so the anonymous attempt is the only one.
    expect(stub.calls.router).toHaveLength(2);
    expect(stub.calls.router[1].model).toBe("jev-1.13-free");
    expect(stub.calls.decisionHeaders[1].Authorization).toBeUndefined();
  });
});

/**
 * The whole adaptive path (router, sufficiency judge, query rewrite, re-search) is
 * behind one flag: with it off the worker goes back to the pre-adaptive behaviour of
 * searching the raw message once and generating. The logic stays in the code, so the
 * only thing that changes is the route taken.
 */
describe("adaptive feature flag", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("skips the router and the judge entirely when ADAPTIVE_RAG is off", async () => {
    const { env } = makeEnv({ rounds: [[strong]], vars: { ADAPTIVE_RAG: "0" } });
    const lines: Array<Record<string, any>> = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(JSON.parse(line));
    });
    const stub = stubFetch({});

    const res = await worker.fetch(makeRequest("¿Y sus estudios?", history), env as never);

    expect(res.status).toBe(200);
    // No decision model call at all: neither the router nor the sufficiency judge.
    expect(stub.calls.router).toHaveLength(0);
    expect(stub.calls.judge).toHaveLength(0);
    // One search, with the raw message: no history merge, no re-search.
    expect(env.VECTORIZE.query).toHaveBeenCalledTimes(1);
    const retrieved = lines.find((l) => l.event === "chat.rag_retrieved");
    expect(retrieved?.queries).toEqual(["¿Y sus estudios?"]);
    expect(retrieved?.iterations).toBe(1);
    const route = lines.find((l) => l.event === "chat.route");
    expect(route?.via).toBe("disabled");
    expect(route?.offer_contact).toBe(false);
  });

  it("keeps the adaptive path when the flag is absent", async () => {
    const { env } = makeEnv({ rounds: [[strong]] });
    const stub = stubFetch({ router: [routerAnswer("search")], judge: [judgeAnswer(0.9)] });

    const res = await worker.fetch(makeRequest("¿Dónde trabaja Ramiro?"), env as never);

    expect(res.status).toBe(200);
    expect(stub.calls.router).toHaveLength(1);
  });
});
