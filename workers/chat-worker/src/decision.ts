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
 * Two tiers: the primary model (jev-1.13-free) is called WITHOUT a key. If that
 * attempt fails for ANY reason (network, timeout, any non-2xx including the 400
 * "Model is unavailable" an unknown or retired model gets, or a body that does
 * not validate), ONE retry goes to the paid fallback model (jev-1.13) with
 * `Authorization: Bearer <DECISION_API_KEY>`. No key or no fallback model: no
 * retry. Each attempt has its own DECISION_TIMEOUT_MS. Jev does not generate
 * text, so there is no max_tokens / temperature / response_format.
 *
 * It never throws: every failure comes back as `{ ok: false, reason }` so the
 * caller can apply its safe default. Each answer is validated against the
 * question that asked for it; anything unexpected is `invalid_shape`.
 */

import type { DecisionConfig } from "./config";

export type DecisionFailure = "timeout" | "network" | `http_${number}` | "invalid_json" | "invalid_shape";

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

/** What happened with the paid retry. */
export type FallbackOutcome = "not_needed" | "used" | "failed" | "skipped_no_key" | "skipped_no_model";

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

/** Free attempt (anonymous), then at most ONE paid retry. Never throws. */
export async function askDecision(
  config: DecisionConfig,
  state: unknown,
  questions: Record<string, DecisionQuestion>,
): Promise<DecisionResult> {
  const free = await attempt(config, config.model, null, state, questions);
  if (free.ok) {
    return { ...free, trace: { tier: "free", model: config.model, primaryError: null, fallback: "not_needed" } };
  }
  const primaryError = free.reason;
  if (!config.fallbackModel) {
    return { ok: false, reason: primaryError, trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_model" } };
  }
  if (!config.apiKey) {
    return { ok: false, reason: primaryError, trace: { tier: "none", model: null, primaryError, fallback: "skipped_no_key" } };
  }
  const paid = await attempt(config, config.fallbackModel, config.apiKey, state, questions);
  if (paid.ok) {
    return { ...paid, trace: { tier: "paid", model: config.fallbackModel, primaryError, fallback: "used" } };
  }
  return { ok: false, reason: paid.reason, trace: { tier: "none", model: null, primaryError, fallback: "failed" } };
}
