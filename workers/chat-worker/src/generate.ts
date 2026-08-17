/**
 * OpenCode Go generation client (design D8/D9).
 *
 * Calls the OpenAI-compatible endpoint with the DeepSeek V4 Flash model and
 * the API key stored as a Worker secret (never in the repo). Explicit
 * mapping: HTTP 429 -> RATE_LIMITED; 401/403/4xx/5xx/network/timeout ->
 * MODEL_ERROR. Transient failures (5xx, network/timeout, empty completion)
 * are retried with exponential backoff (follow-up W1) because the upstream
 * intermittently fails in bursts; 429 is never retried.
 */

import type { ChatMessage } from "./rag";

export type GenerateResult =
  | { status: 200; content: string }
  | { status: 429; code: "RATE_LIMITED" }
  | { status: 500; code: "MODEL_ERROR" };

export interface GenerateOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Total attempts including the first (default 3). */
  maxAttempts?: number;
  /** Base backoff in ms, doubled after each retry (default 250). */
  backoffMs?: number;
}

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

type AttemptOutcome =
  | { kind: "done"; result: GenerateResult }
  | { kind: "retry" };

async function attemptOnce(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return { kind: "done", result: { status: 429, code: "RATE_LIMITED" } };
    }
    if (!response.ok) {
      return RETRYABLE_STATUS.has(response.status)
        ? { kind: "retry" }
        : { kind: "done", result: { status: 500, code: "MODEL_ERROR" } };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      // Empty completion is often transient upstream: retry before giving up.
      return { kind: "retry" };
    }
    return { kind: "done", result: { status: 200, content } };
  } catch {
    // Network failure or timeout (AbortError): retry.
    return { kind: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateReply(options: GenerateOptions): Promise<GenerateResult> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    maxTokens = 1024,
    temperature = 0.3,
    timeoutMs = 30_000,
    maxAttempts = 3,
    backoffMs = 250,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptOnce(endpoint, apiKey, model, messages, maxTokens, temperature, timeoutMs);
    if (outcome.kind === "done") {
      return outcome.result;
    }
    if (attempt < maxAttempts) {
      // Exponential backoff: 250ms, 500ms, ... per retry.
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  // All attempts exhausted with retryable outcomes.
  return { status: 500, code: "MODEL_ERROR" };
}
