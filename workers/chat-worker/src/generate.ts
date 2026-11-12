/**
 * OpenCode Go generation client (design D8/D9).
 *
 * Calls the OpenAI-compatible endpoint with the configured `GENERATION_MODEL`
 * (`gpt-6-luna` in `wrangler.jsonc`) and
 * the API key stored as a Worker secret (never in the repo). Sends a stable
 * per-conversation `x-opencode-session` header and a custom User-Agent, both
 * required by OpenCode Go (missing session -> HTTP 400 -> MODEL_ERROR).
 * Explicit mapping: HTTP 429 -> RATE_LIMITED; 401/403/4xx/5xx/network/timeout ->
 * MODEL_ERROR. Transient failures (5xx, network/timeout, empty completion)
 * are retried with exponential backoff (follow-up W1) because the upstream
 * intermittently fails in bursts; 429 is never retried. A completion cut by the
 * output budget (`finish_reason: "length"`) is retried once with a doubled
 * budget, and only then flagged as `truncated` when it still runs out.
 */

import type { ChatMessage } from "./rag";

export type GenerateResult =
  | { status: 200; content: string; truncated?: true }
  | { status: 429; code: "RATE_LIMITED" }
  /** `upstream` is the raw HTTP status from OpenCode Go when one was received. */
  | { status: 500; code: "MODEL_ERROR"; upstream?: number };

export interface GenerateOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Total attempts including the first (default DEFAULT_GENERATION_ATTEMPTS). */
  maxAttempts?: number;
  /** Base backoff in ms, doubled after each retry (default 250). */
  backoffMs?: number;
  /** Stable per-conversation session ID sent in x-opencode-session (required by OpenCode Go). */
  sessionId?: string;
  /** Client identification sent as User-Agent (required by OpenCode Go). */
  userAgent?: string;
}

/** Output budget. Unchanged on purpose: shorter replies are a product decision, not a latency fix. */
export const DEFAULT_MAX_TOKENS = 1024;
/**
 * Per attempt. Measured replies (up to ~1300 chars) finish in ~2-7 s end to end, so
 * 12 s covers a slow but healthy upstream. In streaming mode it bounds the wait for the
 * first token and every gap between tokens instead, so a long reply is never cut by it.
 */
export const DEFAULT_GENERATION_TIMEOUT_MS = 12_000;
/**
 * Total attempts. 2 x 12 s + 250 ms backoff ~= 24 s worst case (was 3 x 30 s ~= 91 s),
 * which leaves room for router + retrieval inside the widget's 30 s first-token budget.
 */
export const DEFAULT_GENERATION_ATTEMPTS = 2;

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

type AttemptOutcome = { kind: "done"; result: GenerateResult } | { kind: "retry"; upstream?: number };

async function attemptOnce(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number,
  timeoutMs: number,
  sessionId?: string,
  userAgent?: string,
): Promise<AttemptOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(sessionId ? { "x-opencode-session": sessionId } : {}),
        ...(userAgent ? { "User-Agent": userAgent } : {}),
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return { kind: "done", result: { status: 429, code: "RATE_LIMITED" } };
    }
    if (!response.ok) {
      return RETRYABLE_STATUS.has(response.status)
        ? { kind: "retry", upstream: response.status }
        : { kind: "done", result: { status: 500, code: "MODEL_ERROR", upstream: response.status } };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>;
    };
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      // Empty completion is often transient upstream: retry before giving up.
      return { kind: "retry" };
    }
    // `length` means the model ran out of output budget mid-sentence. Surface it
    // so generateReply can retry once with a bigger budget instead of handing the
    // visitor an answer cut in half.
    return choice?.finish_reason === "length"
      ? { kind: "done", result: { status: 200, content, truncated: true } }
      : { kind: "done", result: { status: 200, content } };
  } catch {
    // Network failure or timeout (AbortError): retry.
    return { kind: "retry" };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A truncated answer is retried once with a doubled budget, never unbounded. */
const MAX_BUDGET_BUMPS = 1;
/** Ceiling for the doubled budget: ~4x the default 1024. */
const MAX_OUTPUT_TOKENS = 4096;

export async function generateReply(options: GenerateOptions): Promise<GenerateResult> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = 0,
    timeoutMs = DEFAULT_GENERATION_TIMEOUT_MS,
    maxAttempts = DEFAULT_GENERATION_ATTEMPTS,
    backoffMs = 250,
    sessionId,
    userAgent = "botardo-web/1.0",
  } = options;

  let budget = maxTokens;
  let budgetBumps = 0;
  let lastUpstream: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await attemptOnce(
      endpoint,
      apiKey,
      model,
      messages,
      budget,
      temperature,
      timeoutMs,
      sessionId,
      userAgent,
    );
    if (outcome.kind === "done") {
      if (
        outcome.result.status === 200 &&
        outcome.result.truncated &&
        budgetBumps < MAX_BUDGET_BUMPS &&
        budget < MAX_OUTPUT_TOKENS
      ) {
        // The upstream cut the answer: retry once with a bigger budget. The
        // retry consumes an attempt slot, so the bump stays bounded even when
        // the larger budget is not enough either.
        budgetBumps += 1;
        budget = Math.min(budget * 2, MAX_OUTPUT_TOKENS);
        continue;
      }
      return outcome.result;
    }
    if (outcome.upstream !== undefined) lastUpstream = outcome.upstream;
    if (attempt < maxAttempts) {
      // Exponential backoff: 250ms, 500ms, ... per retry.
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }
  // All attempts exhausted with retryable outcomes.
  return { status: 500, code: "MODEL_ERROR", ...(lastUpstream === undefined ? {} : { upstream: lastUpstream }) };
}

export interface StreamOptions extends GenerateOptions {
  /** Called with each content delta, in order. Once called, the attempt can no longer be retried. */
  onDelta: (text: string) => void;
}

type StreamAttempt =
  | { kind: "done"; result: GenerateResult }
  /** Retryable only when nothing reached the visitor yet. */
  | { kind: "retry"; upstream?: number; emitted: boolean };

/** Parse OpenAI-style SSE lines (`data: {...}` / `data: [DONE]`). Returns the trailing partial line. */
export function parseSseLines(buffer: string, onData: (data: string) => void): string {
  const lines = buffer.split(/\r?\n/);
  const rest = lines.pop() ?? "";
  for (const line of lines) {
    if (line.startsWith("data:")) onData(line.slice(5).trimStart());
  }
  return rest;
}

async function streamOnce(options: StreamOptions, maxTokens: number, timeoutMs: number): Promise<StreamAttempt> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    temperature = 0,
    sessionId,
    userAgent = "botardo-web/1.0",
    onDelta,
  } = options;
  const controller = new AbortController();
  // One watchdog re-armed on every chunk: bounds time-to-first-token and each idle gap.
  let timer = setTimeout(() => controller.abort(), timeoutMs);
  const rearm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), timeoutMs);
  };
  let emitted = false;
  let content = "";
  let finish: unknown = null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
        ...(sessionId ? { "x-opencode-session": sessionId } : {}),
        "User-Agent": userAgent,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
      signal: controller.signal,
    });
    if (response.status === 429) return { kind: "done", result: { status: 429, code: "RATE_LIMITED" } };
    if (!response.ok || !response.body) {
      return RETRYABLE_STATUS.has(response.status) || !response.body
        ? { kind: "retry", upstream: response.status, emitted }
        : { kind: "done", result: { status: 500, code: "MODEL_ERROR", upstream: response.status } };
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    const onData = (data: string) => {
      if (data === "[DONE]") return;
      let parsed: { choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }> };
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
      const choice = parsed?.choices?.[0];
      const delta = choice?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) {
        content += delta;
        emitted = true;
        onDelta(delta);
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rearm();
      buffer = parseSseLines(buffer + value, onData);
    }
    parseSseLines(buffer + "\n", onData);
    if (content.trim().length === 0) return { kind: "retry", emitted };
    // Streaming cannot take back tokens the visitor already read, so a `length` cut is
    // flagged instead of retried with a doubled budget (the non-streaming path still retries).
    return finish === "length"
      ? { kind: "done", result: { status: 200, content, truncated: true } }
      : { kind: "done", result: { status: 200, content } };
  } catch {
    return { kind: "retry", emitted };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streaming variant of generateReply (`stream: true`). Same status mapping and retry
 * policy, except that a failure after the first delta is final: the partial reply is
 * already on screen, so it comes back as MODEL_ERROR and the widget offers a retry.
 */
export async function generateReplyStream(options: StreamOptions): Promise<GenerateResult> {
  const {
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = DEFAULT_GENERATION_TIMEOUT_MS,
    maxAttempts = DEFAULT_GENERATION_ATTEMPTS,
    backoffMs = 250,
  } = options;
  let lastUpstream: number | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const outcome = await streamOnce(options, maxTokens, timeoutMs);
    if (outcome.kind === "done") return outcome.result;
    if (outcome.upstream !== undefined) lastUpstream = outcome.upstream;
    if (outcome.emitted) break;
    if (attempt < maxAttempts) await sleep(backoffMs * 2 ** (attempt - 1));
  }
  return { status: 500, code: "MODEL_ERROR", ...(lastUpstream === undefined ? {} : { upstream: lastUpstream }) };
}
