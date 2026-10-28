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
 * Auth: `Authorization: Bearer <key>` only when a key is configured. Jev does
 * not generate text, so there is no max_tokens / temperature / response_format.
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

export type DecisionResult =
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

export async function askDecision(
  config: DecisionConfig,
  state: unknown,
  questions: Record<string, DecisionQuestion>,
): Promise<DecisionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DECISION_USER_AGENT,
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, state, questions }),
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
