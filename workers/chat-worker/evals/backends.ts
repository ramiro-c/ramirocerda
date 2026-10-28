/**
 * Backends for the eval runner.
 *
 * - real:     Workers AI + Vectorize through the Cloudflare REST API (READ-ONLY:
 *             /ai/run and /vectorize/v2/indexes/<index>/query only, never upsert or
 *             delete), the real decision endpoint (Jev via OpenCode System One) for
 *             the router and the sufficiency judge, and the real OpenCode Go
 *             endpoint for generation.
 * - decision: the REAL decision endpoint (anonymous jev-1.13-free, paid fallback
 *             off) with offline Vectorize / generation stubs. Measures
 *             the router for real (route, hire_intent, fallbacks, latency, tokens)
 *             without any Cloudflare or OpenCode Go credential.
 * - offline:  deterministic stubs. Vectorize returns no matches, generation is a
 *             stub, and the decision model is a MOCK that echoes the case's
 *             expected labels (an oracle) and always calls the snippets
 *             insufficient. Offline numbers are plumbing and call counts under
 *             that mock, never router quality.
 *
 * All are wrapped by `instrument`, which counts calls and tokens per query.
 */

import { DEFAULT_DECISION_ENDPOINT } from "../src/config";
import type { PipelineEnv } from "../src/pipeline";

export interface Counters {
  embeddingCalls: number;
  vectorizeQueries: number;
  routerCalls: number;
  judgeCalls: number;
  /** Decision model tokens (router + judge), from System One `usage`. */
  decisionTokensIn: number;
  decisionTokensOut: number;
  generationCalls: number;
  genTokensIn: number;
  genTokensOut: number;
}

export function zeroCounters(): Counters {
  return {
    embeddingCalls: 0,
    vectorizeQueries: 0,
    routerCalls: 0,
    judgeCalls: 0,
    decisionTokensIn: 0,
    decisionTokensOut: 0,
    generationCalls: 0,
    genTokensIn: 0,
    genTokensOut: 0,
  };
}

type Vars = Omit<PipelineEnv, "AI" | "VECTORIZE">;
type Bindings = Pick<PipelineEnv, "AI" | "VECTORIZE">;

/** What the offline decision mock answers for the current case (System One answer values). */
export interface MockRouterAnswer {
  route: "search" | "smalltalk" | "off_topic";
  /** noul probabilities */
  hireIntent: number;
  needsHistory: number;
}

const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** OpenAI-style usage (generation). */
function chatUsageOf(value: unknown): { in: number; out: number } {
  const usage = (value as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  return { in: n(usage?.prompt_tokens), out: n(usage?.completion_tokens) };
}

/** System One usage (decision model). */
function decisionUsageOf(value: unknown): { in: number; out: number } {
  const usage = (value as { usage?: { input_tokens?: unknown; output_tokens?: unknown } } | null)?.usage;
  return { in: n(usage?.input_tokens), out: n(usage?.output_tokens) };
}

export function realBindings(opts: { accountId: string; apiToken: string; indexName: string }): Bindings {
  const call = async (pathname: string, body: unknown) => {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${opts.accountId}${pathname}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${opts.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean; result?: unknown; errors?: unknown } | null;
    if (!res.ok || !json?.success) {
      throw new Error(`Cloudflare ${pathname} failed (${res.status}): ${JSON.stringify(json?.errors ?? json)}`);
    }
    return json.result;
  };
  return {
    AI: {
      run: (model, input) => call(`/ai/run/${model}`, input) as Promise<{ response?: unknown; data?: unknown }>,
    },
    VECTORIZE: {
      query: async (vector, options) =>
        (await call(`/vectorize/v2/indexes/${opts.indexName}/query`, {
          vector,
          topK: options.topK,
          returnMetadata: options.returnMetadata ?? "all",
        })) as { matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> },
    },
  };
}

export function offlineBindings(): Bindings {
  return {
    AI: { run: async () => ({ data: [Array.from({ length: 8 }, (_, i) => i / 8)] }) },
    VECTORIZE: { query: async () => ({ matches: [] }) },
  };
}

function completion(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}

/** Offline System One answers: the oracle for the router, "insufficient" for the judge. Only asked questions are answered. */
function mockDecision(questions: Record<string, unknown>, mock: MockRouterAnswer): Response {
  const all: Record<string, unknown> = {
    route: { type: "choice", choice: mock.route, confidence: 1, probabilities: { [mock.route]: 1 } },
    hire_intent: { type: "noul", noul: mock.hireIntent },
    needs_history: { type: "noul", noul: mock.needsHistory },
    sufficient: { type: "noul", noul: 0 },
  };
  const answers = Object.fromEntries(Object.keys(questions).map((k) => [k, all[k]]));
  return new Response(JSON.stringify({ model: "offline-mock", answers, usage: { input_tokens: 0, output_tokens: 0 } }), {
    status: 200,
  });
}

/**
 * Wraps bindings + global fetch so every call made while `fn` runs is counted.
 * Decision calls are split into router / judge by their question names;
 * generation calls are detected by URL (the OpenCode Go endpoint). The eval's
 * faithfulness judge uses the raw fetch, so it is never counted as pipeline cost.
 */
export async function instrument<T>(
  vars: Vars,
  bindings: Bindings,
  mode: { kind: "offline"; mockRouter: MockRouterAnswer } | { kind: "decision" } | { kind: "real" },
  fn: (env: PipelineEnv) => Promise<T>,
): Promise<{ value: T; counters: Counters }> {
  const counters = zeroCounters();
  const env: PipelineEnv = {
    ...vars,
    AI: {
      run: async (model, input) => {
        if (model === vars.EMBEDDING_MODEL) counters.embeddingCalls += 1;
        return bindings.AI.run(model, input);
      },
    },
    VECTORIZE: {
      query: (vector, options) => {
        counters.vectorizeQueries += 1;
        return bindings.VECTORIZE.query(vector, options);
      },
    },
  };
  const decisionEndpoint = vars.DECISION_ENDPOINT?.trim() || DEFAULT_DECISION_ENDPOINT;
  const stubGeneration = mode.kind !== "real";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === decisionEndpoint) {
      const questions = (JSON.parse(String(init?.body ?? "{}"))?.questions ?? {}) as Record<string, unknown>;
      if ("route" in questions) counters.routerCalls += 1;
      else if ("sufficient" in questions) counters.judgeCalls += 1;
      if (mode.kind === "offline") return mockDecision(questions, mode.mockRouter);
      const res = await originalFetch(input, init);
      const u = decisionUsageOf(await res.clone().json().catch(() => null));
      counters.decisionTokensIn += u.in;
      counters.decisionTokensOut += u.out;
      return res;
    }
    if (url === vars.OPENCODE_GO_ENDPOINT) {
      counters.generationCalls += 1;
      if (stubGeneration) return completion("(offline stub)");
      const res = await originalFetch(input, init);
      const u = chatUsageOf(await res.clone().json().catch(() => null));
      counters.genTokensIn += u.in;
      counters.genTokensOut += u.out;
      return res;
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const value = await fn(env);
    return { value, counters };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
