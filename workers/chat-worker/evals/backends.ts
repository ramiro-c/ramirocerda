/**
 * Backends for the eval runner.
 *
 * - real:    Workers AI + Vectorize through the Cloudflare REST API (READ-ONLY:
 *            /ai/run and /vectorize/v2/indexes/<index>/query only, never upsert or
 *            delete), the real OpenRouter endpoint for the router and the
 *            sufficiency judge, and the real OpenCode Go endpoint for generation.
 * - offline: deterministic stubs. Vectorize returns no matches, generation is a
 *            stub, and OpenRouter is a MOCK that echoes the case's expected labels
 *            (an oracle) and always asks for one re-search. Offline numbers are
 *            plumbing and call counts under that mock, never router quality.
 *
 * Both are wrapped by `instrument`, which counts calls and tokens per query.
 */

import { DEFAULT_OPENROUTER_ENDPOINT } from "../src/config";
import type { PipelineEnv } from "../src/pipeline";
import { JUDGE_SYSTEM_PROMPT } from "../src/retrieval";
import { ROUTER_SYSTEM_PROMPT } from "../src/router";

export interface Counters {
  embeddingCalls: number;
  vectorizeQueries: number;
  routerCalls: number;
  judgeCalls: number;
  /** OpenRouter tokens (router + judge). */
  orTokensIn: number;
  orTokensOut: number;
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
    orTokensIn: 0,
    orTokensOut: 0,
    generationCalls: 0,
    genTokensIn: 0,
    genTokensOut: 0,
  };
}

type Vars = Omit<PipelineEnv, "AI" | "VECTORIZE">;
type Bindings = Pick<PipelineEnv, "AI" | "VECTORIZE">;

/** What the offline OpenRouter mock answers for the current case. */
export interface MockRouterAnswer {
  route: "search" | "smalltalk" | "off_topic";
  hire_intent: boolean;
  query: string;
}

function usageOf(value: unknown): { in: number; out: number } {
  const usage = (value as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { in: n(usage?.prompt_tokens), out: n(usage?.completion_tokens) };
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

function completion(content: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] }), {
    status: 200,
  });
}

/**
 * Wraps bindings + global fetch so every call made while `fn` runs is counted.
 * OpenRouter calls are split into router / judge by their system prompt;
 * generation calls are detected by URL (the OpenCode Go endpoint). The eval's
 * faithfulness judge uses the raw fetch, so it is never counted as pipeline cost.
 */
export async function instrument<T>(
  vars: Vars,
  bindings: Bindings,
  offline: { mockRouter: MockRouterAnswer } | null,
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
  const openRouterEndpoint = vars.OPENROUTER_ENDPOINT?.trim() || DEFAULT_OPENROUTER_ENDPOINT;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === openRouterEndpoint) {
      const system = JSON.parse(String(init?.body ?? "{}"))?.messages?.[0]?.content;
      const isRouter = system === ROUTER_SYSTEM_PROMPT;
      if (isRouter) counters.routerCalls += 1;
      else if (system === JUDGE_SYSTEM_PROMPT) counters.judgeCalls += 1;
      if (offline) {
        return isRouter
          ? completion(offline.mockRouter)
          : completion({ sufficient: false, reformulated_query: "offline mock reformulation" });
      }
      const res = await originalFetch(input, init);
      const u = usageOf(await res.clone().json().catch(() => null));
      counters.orTokensIn += u.in;
      counters.orTokensOut += u.out;
      return res;
    }
    if (url === vars.OPENCODE_GO_ENDPOINT) {
      counters.generationCalls += 1;
      if (offline) return completion("(offline stub)");
      const res = await originalFetch(input, init);
      const u = usageOf(await res.clone().json().catch(() => null));
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
