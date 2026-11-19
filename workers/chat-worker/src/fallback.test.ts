/**
 * Workers AI generation fallback: used only when the primary fails (429/500)
 * and nothing was streamed to the visitor yet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetPrimaryGenerationBreaker } from "./breaker";
import { extractWorkersAIText } from "./generate";
import { DECISION_OFF, GENERATION_ENDPOINT } from "./test-utils";

const mocks = vi.hoisted(() => ({ generateReply: vi.fn(), generateReplyStream: vi.fn() }));
vi.mock("./generate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./generate")>()),
  generateReply: mocks.generateReply,
  generateReplyStream: mocks.generateReplyStream,
}));

import { runAdaptivePipeline, type PipelineEnv } from "./pipeline";

const FALLBACK_MODEL = "@cf/openai/gpt-oss-120b";
const strong = { id: "kb-a", score: 0.62, metadata: { section: "Experiencia", text: "Ramiro trabaja en LDP." } };

function makeEnv(
  fallback: ((model: string, input: unknown) => Promise<unknown>) | null,
  vars: Record<string, string> = {},
) {
  const fallbackRun = vi.fn(fallback ?? (async () => ({ response: "unused" })));
  const run = vi.fn(async (model: string, input: unknown) =>
    model === FALLBACK_MODEL ? fallbackRun(model, input) : { data: [[0.1, 0.2, 0.3]] },
  );
  const env = {
    AI: { run },
    VECTORIZE: { query: vi.fn().mockResolvedValue({ matches: [strong] }) },
    OPENCODE_GO_API_KEY: "secret-key",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    GENERATION_MODEL: "gpt-6-luna",
    GENERATION_FALLBACK_MODEL: FALLBACK_MODEL,
    OPENCODE_GO_ENDPOINT: GENERATION_ENDPOINT,
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    ...DECISION_OFF,
    ...vars,
  } as unknown as PipelineEnv;
  return { env, fallbackRun };
}

const fail500 = { status: 500, code: "MODEL_ERROR", upstream: 503 } as const;
const fail429 = { status: 429, code: "RATE_LIMITED" } as const;

async function ask(env: PipelineEnv, onDelta?: (t: string) => void) {
  const log = vi.fn<(event: string, data?: Record<string, unknown>) => void>();
  const { outcome } = await runAdaptivePipeline({
    message: "¿Dónde trabaja Ramiro?",
    history: [],
    env,
    sessionId: "s",
    log,
    onDelta,
  });
  const done = log.mock.calls.find(([event]) => event === "chat.ai_done")?.[1] as Record<string, unknown>;
  const failed = log.mock.calls.find(([event]) => event === "chat.ai_fallback_failed")?.[1];
  if (outcome.kind !== "generated") throw new Error(`unexpected outcome ${outcome.kind}`);
  return { result: outcome.result, done, failed };
}

describe("extractWorkersAIText", () => {
  it("reads { response }", () => expect(extractWorkersAIText({ response: " hola " })).toBe("hola"));
  it("reads choices[0].message.content", () =>
    expect(extractWorkersAIText({ choices: [{ message: { content: "chau" } }] })).toBe("chau"));
  it("returns '' for anything else", () => {
    expect(extractWorkersAIText(null)).toBe("");
    expect(extractWorkersAIText("x")).toBe("");
    expect(extractWorkersAIText({ response: null })).toBe("");
    expect(extractWorkersAIText({ choices: [] })).toBe("");
    expect(extractWorkersAIText({ choices: [{ message: {} }] })).toBe("");
  });
});

describe("generation fallback", () => {
  beforeEach(() => {
    mocks.generateReply.mockReset();
    mocks.generateReplyStream.mockReset();
    resetPrimaryGenerationBreaker();
  });

  it.each([
    ["500", fail500],
    ["429", fail429],
  ])("primary %s, fallback ok: replies with the fallback text", async (_n, failure) => {
    mocks.generateReply.mockResolvedValue(failure);
    const { env, fallbackRun } = makeEnv(async () => ({ response: "Trabaja en LDP." }));
    const { result, done } = await ask(env);
    expect(result).toEqual({ status: 200, content: "Trabaja en LDP." });
    expect(fallbackRun).toHaveBeenCalledTimes(1);
    expect(fallbackRun.mock.calls[0][1]).toMatchObject({ max_tokens: 1024 });
    expect(done).toMatchObject({
      fallback: true,
      fallback_model: FALLBACK_MODEL,
      primary_status: failure.status,
      status: 200,
    });
  });

  it("primary 200: the fallback is never called", async () => {
    mocks.generateReply.mockResolvedValue({ status: 200, content: "ok" });
    const { env, fallbackRun } = makeEnv(null);
    const { result, done } = await ask(env);
    expect(result).toEqual({ status: 200, content: "ok" });
    expect(fallbackRun).not.toHaveBeenCalled();
    expect(done).not.toHaveProperty("fallback");
  });

  it("primary fails and the fallback throws: returns the original failure", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env } = makeEnv(async () => {
      throw new Error("ai down");
    });
    const { result, done, failed } = await ask(env);
    expect(result).toEqual(fail500);
    expect(done).not.toHaveProperty("fallback");
    expect(failed).toMatchObject({ error: "ai down" });
  });

  it("primary fails and the fallback is empty: returns the original failure", async () => {
    mocks.generateReply.mockResolvedValue(fail429);
    const { env } = makeEnv(async () => ({ response: "  " }));
    expect((await ask(env)).result).toEqual(fail429);
  });

  it("streaming, nothing emitted: emits the fallback text once", async () => {
    mocks.generateReplyStream.mockResolvedValue(fail500);
    const { env } = makeEnv(async () => ({ choices: [{ message: { content: "Hola desde el fallback" } }] }));
    const onDelta = vi.fn();
    const { result } = await ask(env, onDelta);
    expect(result).toEqual({ status: 200, content: "Hola desde el fallback" });
    expect(onDelta).toHaveBeenCalledTimes(1);
    expect(onDelta).toHaveBeenCalledWith("Hola desde el fallback");
  });

  it("streaming, failure after a delta: no fallback", async () => {
    mocks.generateReplyStream.mockImplementation(async (o: { onDelta: (t: string) => void }) => {
      o.onDelta("Trab");
      return fail500;
    });
    const { env, fallbackRun } = makeEnv(async () => ({ response: "x" }));
    const onDelta = vi.fn();
    const { result } = await ask(env, onDelta);
    expect(result).toEqual(fail500);
    expect(fallbackRun).not.toHaveBeenCalled();
    expect(onDelta).toHaveBeenCalledTimes(1);
  });

  it("fallback var empty: no fallback AI.run call", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env, fallbackRun } = makeEnv(null, { GENERATION_FALLBACK_MODEL: "" });
    expect((await ask(env)).result).toEqual(fail500);
    expect(fallbackRun).not.toHaveBeenCalled();
  });

  it("fallback var unset: no fallback AI.run call", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env, fallbackRun } = makeEnv(null);
    delete env.GENERATION_FALLBACK_MODEL;
    expect((await ask(env)).result).toEqual(fail500);
    expect(fallbackRun).not.toHaveBeenCalled();
  });
});

describe("generation breaker", () => {
  beforeEach(() => {
    mocks.generateReply.mockReset();
    mocks.generateReplyStream.mockReset();
    resetPrimaryGenerationBreaker();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  async function askWithLog(env: PipelineEnv) {
    const log = vi.fn<(event: string, data?: Record<string, unknown>) => void>();
    await runAdaptivePipeline({ message: "¿Dónde trabaja Ramiro?", history: [], env, sessionId: "s", log });
    const find = (name: string) => log.mock.calls.find(([event]) => event === name)?.[1];
    return { done: find("chat.ai_done"), opened: find("chat.ai_breaker_open") };
  }

  it("after a primary 500/upstream 503, the next request skips the primary", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env, fallbackRun } = makeEnv(async () => ({ response: "Trabaja en LDP." }));
    const first = await askWithLog(env);
    expect(first.opened).toMatchObject({ primary_status: 500, upstream_status: 503, cooldown_ms: 300_000 });
    expect(first.done).not.toHaveProperty("primary_skipped");
    expect(mocks.generateReply).toHaveBeenCalledTimes(1);

    const second = await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(1);
    expect(fallbackRun).toHaveBeenCalledTimes(2);
    expect(second.done).toMatchObject({ status: 200, primary_skipped: true, fallback: true });
    expect(second.opened).toBeUndefined();
  });

  it("streaming: a skipped primary emits the fallback text once", async () => {
    mocks.generateReplyStream.mockResolvedValue(fail429);
    const { env } = makeEnv(async () => ({ response: "Hola" }));
    await ask(env, vi.fn());
    const onDelta = vi.fn();
    const { result } = await ask(env, onDelta);
    expect(mocks.generateReplyStream).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 200, content: "Hola" });
    expect(onDelta).toHaveBeenCalledTimes(1);
  });

  it("skipped primary and a failing fallback: MODEL_ERROR without calling the primary", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env } = makeEnv(async () => {
      throw new Error("ai down");
    });
    await ask(env);
    const { result } = await ask(env);
    expect(result).toEqual({ status: 500, code: "MODEL_ERROR" });
    expect(mocks.generateReply).toHaveBeenCalledTimes(1);
  });

  it("uses the Retry-After the primary surfaced", async () => {
    mocks.generateReply.mockResolvedValue({ ...fail429, retryAfterMs: 42_000 });
    const { env } = makeEnv(async () => ({ response: "x" }));
    expect((await askWithLog(env)).opened).toMatchObject({ primary_status: 429, cooldown_ms: 42_000 });
  });

  it.each([
    ["upstream 401", { status: 500, code: "MODEL_ERROR", upstream: 401 }],
    ["upstream 402", { status: 500, code: "MODEL_ERROR", upstream: 402 }],
    ["upstream 403", { status: 500, code: "MODEL_ERROR", upstream: 403 }],
    ["no upstream status", { status: 500, code: "MODEL_ERROR" }],
  ])("opens on %s", async (_n, failure) => {
    mocks.generateReply.mockResolvedValue(failure);
    const { env } = makeEnv(async () => ({ response: "x" }));
    expect((await askWithLog(env)).opened).toBeDefined();
  });

  it.each([400, 422])("does not open on upstream %s", async (upstream) => {
    mocks.generateReply.mockResolvedValue({ status: 500, code: "MODEL_ERROR", upstream });
    const { env } = makeEnv(async () => ({ response: "x" }));
    expect((await askWithLog(env)).opened).toBeUndefined();
    await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(2);
  });

  it("does not open when no fallback model is configured", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env } = makeEnv(null, { GENERATION_FALLBACK_MODEL: "" });
    expect((await askWithLog(env)).opened).toBeUndefined();
    await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(2);
  });

  it("a primary success leaves it closed", async () => {
    mocks.generateReply.mockResolvedValue({ status: 200, content: "ok" });
    const { env } = makeEnv(null);
    expect((await askWithLog(env)).opened).toBeUndefined();
    await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(2);
  });

  it("GENERATION_BREAKER_MS sets the cooldown, and the primary is retried once it passes", async () => {
    mocks.generateReply.mockResolvedValue(fail500);
    const { env } = makeEnv(async () => ({ response: "x" }), { GENERATION_BREAKER_MS: "10000" });
    expect((await askWithLog(env)).opened).toMatchObject({ cooldown_ms: 10_000 });
    await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_000_000 + 10_001);
    mocks.generateReply.mockResolvedValue({ status: 200, content: "primary is back" });
    const { done } = await askWithLog(env);
    expect(mocks.generateReply).toHaveBeenCalledTimes(2);
    expect(done).toMatchObject({ status: 200, reply_length: 15 });
    expect(done).not.toHaveProperty("primary_skipped");
  });
});
