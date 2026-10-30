/**
 * Client for the decision model: Jev (TypeSafe System One) served by OpenCode.
 *
 * Wire format (TypeSafe OpenAPI `POST /v1/systemone`, mirrored by OpenCode at
 * https://opencode.ai/inference/systemone/v1/systemone):
 *
 *   request   { "model": "jev-1.13-free", "state": <string|object>,
 *               "questions": { "<name>": { "type": "choice", "instructions": "...", "criteria": { "<option>": "<when>" } },
 *                              "<name>": { "type": "noul",   "instructions": "..." } } }
 *   response  { "model": "...", "answers": { "<name>": { "type": "choice", "choice": "<option>", "confidence": 0.9, "probabilities": {...} },
 *                                            "<name>": { "type": "noul", "noul": 0.98 } },
 *               "usage": { "input_tokens": 120, "output_tokens": 12, ... } }
 *
 * Two tiers: the primary model (DECISION_MODEL) and an optional retry model
 * (DECISION_FALLBACK_MODEL). The primary is called anonymously when its slug ends in
 * "-free" (jev-1.13-free) and with `Authorization: Bearer <OPENCODE_GO_API_KEY>` when
 * it is a paid slug (jev-1.13). If the primary fails for any reason (network, timeout,
 * any non-2xx including the 400 "Model is unavailable" an unknown or retired model gets,
 * or a body that does not validate), ONE retry goes to the fallback model with the same
 * credential rule (anonymous for free slugs, keyed for paid slugs). No fallback model or
 * no key (when the fallback is paid) skips the retry. Each attempt has its own
 * DECISION_TIMEOUT_MS. Jev does not generate text, so there is no max_tokens /
 * temperature / response_format.
 *
 * With DECISION_MODEL=jev-1.13 and DECISION_FALLBACK_MODEL=jev-1.13 (both paid) every
 * call goes to the paid tier, which is ~3x faster than the anonymous one; the free tier
 * is then only used as a cost fallback when the operator sets DECISION_FALLBACK_MODEL to
 * jev-1.13-free.
 *
 * It never throws: every failure comes back as `{ ok: false, reason }` so the
 * caller can apply its safe default. Each answer is validated against the
 * question that asked for it; anything unexpected is `invalid_shape`.
 */

import type { DecisionConfig } from "./config";
import { isFreeTierExhausted, noteFreeTierExhausted } from "./breaker";

export type DecisionFailure = "timeout" | "network" | `http_${number}` | "invalid_json" | "invalid_shape" | "free_skipped";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
}

export type DecisionQuestion = ChoiceQuestion | NoulQuestion;

export type DecisionAnswer =
  | { type: "choice"; choice: string; confidence: number }
  | { type: "noul"; noul: number };

export interface DecisionUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Which model answered: the free primary, the paid fallback, or none (all attempts failed / not run). */
export type ModelTier = "free" | "paid" | "none";

/**
 * What happened with the paid retry. `free_skipped` means the anonymous tier was not
 * attempted at all: it answered 429 recently (isolate breaker) or the operator turned it
 * off with DECISION_FREE_DISABLED.
 */
export type FallbackOutcome = "not_needed" | "used" | "failed" | "skipped_no_key" | "skipped_no_model" | "free_skipped";

export interface DecisionTrace {
  tier: ModelTier;
  /** Model that produced the answers; null when none did. */
  model: string | null;
  /** Why the free attempt failed; null when it succeeded. */
  primaryError: DecisionFailure | null;
  fallback: FallbackOutcome;
}

export type DecisionResult =
  | { ok: true; answers: Record<string, DecisionAnswer>; usage: DecisionUsage; trace: DecisionTrace }
  | { ok: false; reason: DecisionFailure; trace: DecisionTrace };

type AttemptResult =
  | { ok: true; answers: Record<string, DecisionAnswer>; usage: DecisionUsage }
  | { ok: false; reason: DecisionFailure };

export const DECISION_USER_AGENT = "botardo-decision/1.0";

const isProbability = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;

/** Strictly validate one answer against the question that produced it. */
export function parseAnswer(question: DecisionQuestion, raw: unknown): DecisionAnswer | null {
  if (raw === null || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (a.type !== question.type) return null;
  if (question.type === "noul") return isProbability(a.noul) ? { type: "noul", noul: a.noul } : null;
  if (typeof a.choice !== "string" || !Object.prototype.hasOwnProperty.call(question.criteria, a.choice)) return null;
  if (!isProbability(a.confidence)) return null;
  return { type: "choice", choice: a.choice, confidence: a.confidence };
}

/** Validate the whole body: every asked question must come back with a valid answer. */
export function parseDecisionResponse(
  questions: Record<string, DecisionQuestion>,
  body: unknown,
): { answers: Record<string, DecisionAnswer>; usage: DecisionUsage } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { answers, usage } = body as { answers?: unknown; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
  if (answers === null || typeof answers !== "object") return null;
  const parsed: Record<string, DecisionAnswer> = {};
  for (const [name, question] of Object.entries(questions)) {
    const answer = parseAnswer(question, (answers as Record<string, unknown>)[name]);
    if (!answer) return null;
    parsed[name] = answer;
  }
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { answers: parsed, usage: { inputTokens: n(usage?.input_tokens), outputTokens: n(usage?.output_tokens) } };
}

async function attempt(
  config: DecisionConfig,
  model: string,
  apiKey: string | null,
  state: unknown,
  questions: Record<string, DecisionQuestion>,
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DECISION_USER_AGENT,
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "invalid_json" };
    }
    const parsed = parseDecisionResponse(questions, body);
    return parsed ? { ok: true, ...parsed } : { ok: false, reason: "invalid_shape" };
  } catch (err) {
    return { ok: false, reason: (err as { name?: string })?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** Slugs OpenCode marks as the anonymous (free) tier end in "-free". */
const isFreeModel = (model: string | null): boolean =>
  model !== null && (model === "jev-1.13-free" || model.endsWith("-free"));

/**
 * Free attempt (anonymous), then at most ONE paid retry. Never throws.
 *
 * The anonymous tier is skipped when a paid path exists and either the isolate breaker
 * remembers a recent 429 (see src/breaker.ts) or DECISION_FREE_DISABLED is set: paying
 * twice for the same known-bad quota is pure latency.
 *
 * Tiering is now flexible: the primary model may be free (called anonymously) or paid
 * (called with the key). With DECISION_MODEL=jev-1.13 and DECISION_FALLBACK_MODEL=jev-1.13
 * every call goes to the paid tier, which is ~3x faster than the anonymous one.
 */
export async function askDecision(
  config: DecisionConfig,
  state: unknown,
  questions: Record<string, DecisionQuestion>,
): Promise<DecisionResult> {
  const now = Date.now();
  const paidConfigured = Boolean(config.fallbackModel) && Boolean(config.apiKey);

  const primaryIsFree = isFreeModel(config.model);
  // Skip the anonymous primary when the paid path exists and the isolate remembers a
  // recent 429 (or the operator disabled the free tier). Applies only to the free model.
  const skipPrimary = primaryIsFree && paidConfigured && (config.freeDisabled || isFreeTierExhausted(now));

  let primaryError: DecisionFailure;
  let primarySkipped = skipPrimary;

  if (skipPrimary) {
    primaryError = "free_skipped";
  } else {
    const primaryKey = primaryIsFree ? null : config.apiKey;
    const primary = await attempt(config, config.model, primaryKey, state, questions);
    if (primary.ok) {
      return {
        ...primary,
        trace: {
          tier: primaryIsFree ? "free" : "paid",
          model: config.model,
          primaryError: null,
          fallback: "not_needed",
        },
      };
    }
    primaryError = primary.reason;
    if (primary.reason === "http_429" && primaryIsFree) noteFreeTierExhausted(now, config.freeCooldownMs);
  }

  if (!config.fallbackModel) {
    return { ok: false, reason: primaryError, trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_model" } };
  }
  const fallbackIsFree = isFreeModel(config.fallbackModel);
  const fallbackKey = fallbackIsFree ? null : config.apiKey;

  // Skip a free fallback when the breaker is tripped or the operator disabled it.
  if (fallbackKey === null && (config.freeDisabled || isFreeTierExhausted(now))) {
    return { ok: false, reason: primaryError, trace: { tier: "none", model: null, primaryError, fallback: "free_skipped" } };
  }
  if (!fallbackIsFree && !config.apiKey) {
    return { ok: false, reason: primaryError, trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_key" } };
  }
  const fallback = await attempt(config, config.fallbackModel, fallbackKey, state, questions);
  if (!fallback.ok && fallback.reason === "http_429" && fallbackIsFree) noteFreeTierExhausted(now, config.freeCooldownMs);
  if (fallback.ok) {
    return {
      ...fallback,
      trace: {
        tier: fallbackKey !== null ? "paid" : "free",
        model: config.fallbackModel,
        primaryError,
        fallback: primarySkipped ? "free_skipped" : "used",
      },
    };
  }
  return { ok: false, reason: fallback.reason, trace: { tier: "none", model: null, primaryError, fallback: "failed" } };
}
