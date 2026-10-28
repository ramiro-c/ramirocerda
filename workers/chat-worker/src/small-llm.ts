/**
 * Tiny Workers AI completion helper for the control-flow calls (router, query
 * rewrite, re-search reformulation). Low max_tokens, temperature 0 and a hard
 * timeout; it never throws: any error, timeout or empty output returns null so
 * every caller can fall back to its deterministic default.
 */

import type { ChatMessage } from "./rag";

export interface SmallLlmBinding {
  AI: {
    run: (model: string, input: unknown) => Promise<unknown>;
  };
}

export interface SmallLlmOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  timeoutMs: number;
}

export async function runSmallModel(env: SmallLlmBinding, opts: SmallLlmOptions): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), opts.timeoutMs);
  });
  try {
    const call = env.AI.run(opts.model, {
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: 0,
    })
      .then((result) => {
        const response = (result as { response?: unknown } | null)?.response;
        return typeof response === "string" && response.trim().length > 0 ? response.trim() : null;
      })
      .catch(() => null);
    return await Promise.race([call, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
