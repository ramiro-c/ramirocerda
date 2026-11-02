/**
 * Streaming /ask (Accept: text/event-stream), streamed generation and the
 * parallel router + first search.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_GENERATION_ATTEMPTS,
  DEFAULT_GENERATION_TIMEOUT_MS,
  DEFAULT_MAX_TOKENS,
  generateReplyStream,
  parseSseLines,
} from "./generate";
import worker from "./index";
import { OFF_TOPIC_REPLY } from "./prompts";
import {
  DECISION_VARS,
  GENERATION_ENDPOINT,
  readEvents,
  routerAnswer,
  sseResponse,
  stubFetch,
  type FetchScript,
} from "./test-utils";

type Match = { id: string; score: number; metadata?: Record<string, unknown> };
const strong: Match = { id: "kb-a", score: 0.62, metadata: { section: "Experiencia", text: "Ramiro trabaja en LDP." } };

function makeEnv(matches: Match[] = [strong], vars: Record<string, string> = {}) {
  const query = vi.fn().mockResolvedValue({ matches });
  const run = vi.fn().mockResolvedValue({ data: [[0.1, 0.2, 0.3]] });
  const env = {
    AI: { run },
    VECTORIZE: { query },
    ANALYTICS: { writeDataPoint: () => {} },
    OPENCODE_GO_API_KEY: "secret-key",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    GENERATION_MODEL: "deepseek-v4-flash",
    OPENCODE_GO_ENDPOINT: GENERATION_ENDPOINT,
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    CHAT_RATE_LIMITER: { limit: () => Promise.resolve({ success: true }) },
    ...DECISION_VARS,
    ...vars,
  };
  return { env, query, run };
}

function request(message: string, stream: boolean): Request {
  return new Request("https://worker.example/ask", {
    method: "POST",
    headers: {
      Origin: "https://ramirocerda.com.ar",
      "Content-Type": "application/json",
      ...(stream ? { Accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify({ message, sessionId: "conv-stream" }),
  });
}

async function askStream(env: unknown, message: string, script: FetchScript) {
  const stub = stubFetch(script);
  const res = await worker.fetch(request(message, true), env as never);
  return { res, events: await readEvents(res), ...stub };
}

describe("/ask over SSE", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends meta (offerContact) first, then deltas, then done with the full reply", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv();
    const { res, events, calls } = await askStream(env, "¿Lo puedo contratar?", {
      router: [routerAnswer("search", { hire: 0.9 })],
      generation: "Sí, escribile.",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ramirocerda.com.ar");
    expect(events[0]).toEqual({ event: "meta", data: { offerContact: true } });
    const deltas = events.filter((e) => e.event === "delta").map((e) => e.data.text);
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe("Sí, escribile.");
    expect(events.at(-1)).toEqual({ event: "done", data: { reply: "Sí, escribile.", offerContact: true } });
    expect((calls.generation[0] as { stream?: boolean; max_tokens?: number }).stream).toBe(true);
    expect((calls.generation[0] as { max_tokens?: number }).max_tokens).toBe(1024);
  });

  it("fixed replies (off_topic) arrive as one delta + done", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv();
    const { events, calls } = await askStream(env, "contame un chiste", { router: [routerAnswer("off_topic")] });
    expect(events.map((e) => e.event)).toEqual(["meta", "delta", "done"]);
    expect(events[2].data).toEqual({ reply: OFF_TOPIC_REPLY.es, offerContact: false });
    expect(calls.generation).toHaveLength(0);
  });

  it("maps a generation 429 to an error event (status stays 200 once streaming)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv();
    const { res, events } = await askStream(env, "¿Dónde trabaja?", {
      router: [routerAnswer("search")],
      generationStatus: 429,
    });
    expect(res.status).toBe(200);
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "RATE_LIMITED" } });
  });

  it("maps a failed first search to a MODEL_ERROR event", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env, query } = makeEnv();
    query.mockRejectedValue(new Error("vectorize down"));
    const { events } = await askStream(env, "¿Dónde trabaja?", { router: [routerAnswer("search")] });
    expect(events.at(-1)).toMatchObject({ event: "error", data: { code: "MODEL_ERROR" } });
  });

  it("keeps the JSON contract for clients that do not ask for SSE", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env } = makeEnv();
    const stub = stubFetch({ router: [routerAnswer("search")], generation: "Hola" });
    const res = await worker.fetch(request("¿Dónde trabaja?", false), env as never);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ reply: "Hola", offerContact: false });
    expect((stub.calls.generation[0] as { stream?: boolean }).stream).toBeUndefined();
  });
});

describe("router and first search run in parallel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("starts embedding the raw message before the router answers", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { env, run } = makeEnv();
    let releaseRouter!: () => void;
    let embeddedBeforeRouter = false;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url === GENERATION_ENDPOINT) {
        return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
      }
      const body = JSON.parse(String(init?.body));
      return new Promise<Response>((resolve) => {
        releaseRouter = () =>
          resolve(
            new Response(
              JSON.stringify({ model: body.model, answers: (routerAnswer("search") as { answers: unknown }).answers }),
            ),
          );
        setTimeout(() => {
          embeddedBeforeRouter = run.mock.calls.length > 0;
          releaseRouter();
        }, 5);
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await worker.fetch(request("¿Dónde trabaja?", false), env as never);
    expect(await res.json()).toEqual({ reply: "ok", offerContact: false });
    expect(embeddedBeforeRouter).toBe(true);
    expect(run).toHaveBeenCalledTimes(1); // the prefetched search is reused, not repeated
  });
});

describe("generateReplyStream", () => {
  afterEach(() => vi.unstubAllGlobals());
  const messages = [{ role: "user" as const, content: "hola" }];

  it("keeps the output budget at 1024 and a sane timeout budget (~24 s worst case)", () => {
    expect(DEFAULT_MAX_TOKENS).toBe(1024);
    expect(DEFAULT_GENERATION_TIMEOUT_MS * DEFAULT_GENERATION_ATTEMPTS).toBeLessThanOrEqual(25_000);
  });

  it("parses SSE lines split across chunks", () => {
    const seen: string[] = [];
    const rest = parseSseLines('data: {"a":1}\ndata: {"b"', (d) => seen.push(d));
    expect(seen).toEqual(['{"a":1}']);
    parseSseLines(rest + ":2}\n", (d) => seen.push(d));
    expect(seen).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("retries a 5xx before the first token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("x", { status: 503 }))
      .mockResolvedValueOnce(sseResponse(["Ho", "la"]));
    vi.stubGlobal("fetch", fetchMock);
    const deltas: string[] = [];
    const result = await generateReplyStream({
      endpoint: "e",
      apiKey: "k",
      model: "m",
      messages,
      backoffMs: 1,
      onDelta: (d) => deltas.push(d),
    });
    expect(result).toEqual({ status: 200, content: "Hola" });
    expect(deltas).toEqual(["Ho", "la"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flags a length cut as truncated without re-generating text the visitor already saw", async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(["Una respuesta cor"], "length"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateReplyStream({ endpoint: "e", apiKey: "k", model: "m", messages, onDelta: () => {} });
    expect(result).toEqual({ status: 200, content: "Una respuesta cor", truncated: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry once a delta was emitted, and times out an idle stream", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Ho" } }] })}\n\n`),
              );
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateReplyStream({
      endpoint: "e",
      apiKey: "k",
      model: "m",
      messages,
      timeoutMs: 20,
      onDelta: () => {},
    });
    expect(result).toEqual({ status: 500, code: "MODEL_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
