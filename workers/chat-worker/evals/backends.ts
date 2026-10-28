/**
 * Backends for the eval runner.
 *
 * - real:    Workers AI + Vectorize through the Cloudflare REST API (READ-ONLY:
 *            /ai/run and /vectorize/v2/indexes/<index>/query only, never upsert or
 *            delete) and the real OpenCode Go endpoint for generation.
 * - offline: deterministic stubs. Vectorize always returns no matches and every
 *            small-LLM call fails, so the router runs on heuristics only (fail-open)
 *            and no generation happens. Only routing decisions and call counts mean
 *            anything in this mode.
 *
 * Both are wrapped by `instrument`, which counts calls and tokens per query.
 */

import type { PipelineEnv } from "../src/pipeline";

export interface Counters {
  embeddingCalls: number;
  smallLlmCalls: number;
  smallTokensIn: number;
  smallTokensOut: number;
  vectorizeQueries: number;
  generationCalls: number;
  genTokensIn: number;
  genTokensOut: number;
}

export function zeroCounters(): Counters {
  return {
    embeddingCalls: 0,
    smallLlmCalls: 0,
    smallTokensIn: 0,
    smallTokensOut: 0,
    vectorizeQueries: 0,
    generationCalls: 0,
    genTokensIn: 0,
    genTokensOut: 0,
  };
}

type Vars = Omit<PipelineEnv, "AI" | "VECTORIZE">;

function usageOf(value: unknown): { in: number; out: number } {
  const usage = (value as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } } | null)?.usage;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { in: n(usage?.prompt_tokens), out: n(usage?.completion_tokens) };
}

export function realBindings(opts: { accountId: string; apiToken: string; indexName: string }): Pick<PipelineEnv, "AI" | "VECTORIZE"> {
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

export function offlineBindings(embeddingModel: string): Pick<PipelineEnv, "AI" | "VECTORIZE"> {
  return {
    AI: {
      run: async (model) => {
        if (model === embeddingModel) return { data: [Array.from({ length: 8 }, (_, i) => i / 8)] };
        throw new Error("offline: small LLM unavailable");
      },
    },
    VECTORIZE: { query: async () => ({ matches: [] }) },
  };
}

/**
 * Wraps bindings + global fetch so every call made while `fn` runs is counted.
 * Generation calls are detected by URL (the OpenCode Go endpoint). The judge
 * uses `rawFetch` so it is never counted as pipeline cost.
 */
export async function instrument<T>(
  vars: Vars,
  bindings: Pick<PipelineEnv, "AI" | "VECTORIZE">,
  offlineGeneration: boolean,
  fn: (env: PipelineEnv) => Promise<T>,
): Promise<{ value: T; counters: Counters }> {
  const counters = zeroCounters();
  const env: PipelineEnv = {
    ...vars,
    AI: {
      run: async (model, input) => {
        const result = await bindings.AI.run(model, input).finally(() => {
          if (model === vars.EMBEDDING_MODEL) counters.embeddingCalls += 1;
          else counters.smallLlmCalls += 1;
        });
        if (model !== vars.EMBEDDING_MODEL) {
          const u = usageOf(result);
          counters.smallTokensIn += u.in;
          counters.smallTokensOut += u.out;
        }
        return result;
      },
    },
    VECTORIZE: {
      query: (vector, options) => {
        counters.vectorizeQueries += 1;
        return bindings.VECTORIZE.query(vector, options);
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url !== vars.OPENCODE_GO_ENDPOINT) return originalFetch(input, init);
    counters.generationCalls += 1;
    if (offlineGeneration) {
      return new Response(JSON.stringify({ choices: [{ message: { content: "(offline stub)" } }] }), { status: 200 });
    }
    const res = await originalFetch(input, init);
    const u = usageOf(await res.clone().json().catch(() => null));
    counters.genTokensIn += u.in;
    counters.genTokensOut += u.out;
    return res;
  }) as typeof fetch;
  try {
    const value = await fn(env);
    return { value, counters };
  } finally {
    globalThis.fetch = originalFetch;
  }
}
