/**
 * Workers AI generation fallback: used only when the primary fails (429/500)
 * and nothing was streamed to the visitor yet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
