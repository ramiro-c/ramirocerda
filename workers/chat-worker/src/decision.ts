/**
 * Client for the decision model: Jev (TypeSafe System One) served by OpenCode.
 *
 * Wire format (TypeSafe OpenAPI `POST /v1/systemone`, mirrored by OpenCode at
 * https://opencode.ai/inference/systemone/v1/systemone):
 *
 *   request   { "model": "jev-1.13-free", "state": <string|object>,
 *               "questions": { "<name>": { "type": "choice", "instructions": "...", "criteria": { "<option>": "<when>" } },
 *                              "<name>": { "type": "noul",   "instructions": "...",
 *                                          "criteria": { "true": "<what a yes means>", "false": "<what a no means>" } } } }
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

export type DecisionFailure =
  "timeout" | "network" | `http_${number}` | "invalid_json" | "invalid_shape" | "free_skipped";

export interface ChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  /** Optional in the API; describing what yes and no mean anchors the probability. */
  criteria?: { true: string; false: string };
}

export type DecisionQuestion = ChoiceQuestion | NoulQuestion;

export type DecisionAnswer = { type: "choice"; choice: string; confidence: number } | { type: "noul"; noul: number };

export interface DecisionUsage {
  /** null when the API did not report a count (its schema allows null). */
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Which model answered: the free primary, the paid fallback, or none (all attempts failed / not run). */
export type ModelTier = "free" | "paid" | "none";

/**
 * What happened with the paid retry. `free_skipped` means the anonymous tier was not
 * attempted at all: a recent 429 or 401/403 was remembered (isolate breaker) or the
 * operator turned it off with DECISION_FREE_DISABLED.
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
  | { ok: false; reason: DecisionFailure; retryAfterMs?: number | null };

export const DECISION_USER_AGENT = "botardo-decision/1.0";

/**
 * 401/403 means our credentials or endpoint are wrong. That cannot fix itself inside a
 * live isolate, so the anonymous tier stays out of play for the rest of a short window
 * instead of paying a wasted round trip on every single request.
 */
export const FREE_TIER_AUTH_COOLDOWN_MS = 3_600_000;
/** Upper bound for any remembered window, including one the server asks for. */
export const MAX_FREE_TIER_COOLDOWN_MS = 3_600_000;

/** Read a Retry-After header: a delay in seconds or an HTTP-date. null when unreadable. */
export function parseRetryAfterMs(value: string | null, now: number): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  // Only a real date is parsed from here: Date.parse("-5") would read as a year.
  if (!/[a-z]/i.test(trimmed)) return null;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * How long a failed anonymous attempt keeps that tier out of play. null means "do not
 * remember it". Only a spent quota (429) or broken credentials (401/403) are worth
 * remembering: a 5xx, a 422, a network error or a malformed body could equally be our
 * own bug, and the paid retry runs against the same provider, so opening the breaker
 * there would hide the real failure behind a silent skip and pay for a retry that
 * fails the same way.
 */
export function freeTierCooldownMs(
  reason: DecisionFailure,
  retryAfterMs: number | null,
  floorMs: number,
): number | null {
  if (reason === "http_429") {
    return Math.min(Math.max(retryAfterMs ?? 0, floorMs), MAX_FREE_TIER_COOLDOWN_MS);
  }
  if (reason === "http_401" || reason === "http_403") return FREE_TIER_AUTH_COOLDOWN_MS;
  return null;
}

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
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
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
    if (!response.ok) {
      return {
        ok: false,
        reason: `http_${response.status}`,
        retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after"), Date.now()),
      };
    }
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
 * remembers a recent failure worth remembering (see src/breaker.ts and
 * freeTierCooldownMs) or DECISION_FREE_DISABLED is set: paying twice for the same
 * known-bad tier is pure latency.
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
  // recent failure worth remembering (or the operator disabled the free tier).
  // Applies only to the free model.
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
    if (primaryIsFree) {
      const cooldownMs = freeTierCooldownMs(primary.reason, primary.retryAfterMs ?? null, config.freeCooldownMs);
      if (cooldownMs !== null) noteFreeTierExhausted(now, cooldownMs);
    }
  }

  if (!config.fallbackModel) {
    return {
      ok: false,
      reason: primaryError,
      trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_model" },
    };
  }
  const fallbackIsFree = isFreeModel(config.fallbackModel);
  const fallbackKey = fallbackIsFree ? null : config.apiKey;

  // Skip a free fallback when the breaker is tripped or the operator disabled it.
  if (fallbackKey === null && (config.freeDisabled || isFreeTierExhausted(now))) {
    return {
      ok: false,
      reason: primaryError,
      trace: { tier: "none", model: null, primaryError, fallback: "free_skipped" },
    };
  }
  if (!fallbackIsFree && !config.apiKey) {
    return {
      ok: false,
      reason: primaryError,
      trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_key" },
    };
  }
  const fallback = await attempt(config, config.fallbackModel, fallbackKey, state, questions);
  if (!fallback.ok && fallback.reason === "http_429" && fallbackIsFree)
    noteFreeTierExhausted(now, config.freeCooldownMs);
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
