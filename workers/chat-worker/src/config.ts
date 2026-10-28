/**
 * Adaptive RAG config: the decision model (router + sufficiency judge) and the
 * re-search cap.
 *
 * The decision model is Jev (TypeSafe's System One model) served by OpenCode at
 * DECISION_ENDPOINT. It is NOT a chat/OpenAI-compatible API: requests carry a
 * `state` plus typed `questions` (choice / noul) and answers come back typed
 * (see src/decision.ts). jev-1.13-free answers without an API key; set the
 * optional DECISION_API_KEY secret (an OpenCode Console key) for paid models.
 *
 * Setting DECISION_MODEL or DECISION_ENDPOINT to "" turns the decision model
 * off: the pipeline then runs the pre-adaptive behaviour (search with the raw
 * message, similarity gate, generate), so the worker keeps answering.
 *
 * Every knob has a safe code default; malformed values fall back to it.
 */

export const DEFAULT_DECISION_ENDPOINT = "https://opencode.ai/inference/systemone/v1/systemone";
export const DEFAULT_DECISION_MODEL = "jev-1.13-free";
/**
 * OpenCode's id for the credential integration the model belongs to (the
 * OpenCode client stores Console and Go credentials under "opencode"). It is
 * NOT part of the HTTP request: the endpoint only takes a Bearer key. Kept as
 * config for traceability (logged on chat.route).
 */
export const DEFAULT_DECISION_INTEGRATION_ID = "opencode";
export const DEFAULT_DECISION_TIMEOUT_MS = 2000;
/** Below this choice confidence a non-search route is not trusted: search instead. */
export const DEFAULT_DECISION_MIN_CONFIDENCE = 0.5;
/** Hard ceiling: never more than 2 retrievals per message, whatever the env says. */
export const MAX_RETRIEVAL_ITERATIONS_CEILING = 2;

export interface AdaptiveEnvVars {
  /** Optional Worker secret (OpenCode Console key). Empty: anonymous call (free model). */
  DECISION_API_KEY?: string;
  DECISION_ENDPOINT?: string;
  DECISION_MODEL?: string;
  DECISION_INTEGRATION_ID?: string;
  DECISION_TIMEOUT_MS?: string;
  DECISION_MIN_CONFIDENCE?: string;
  MAX_RETRIEVAL_ITERATIONS?: string;
}

export interface DecisionConfig {
  endpoint: string;
  model: string;
  /** null: no Authorization header (jev-1.13-free accepts anonymous calls). */
  apiKey: string | null;
  integrationId: string;
  timeoutMs: number;
  minConfidence: number;
}

export interface AdaptiveConfig {
  /** null when DECISION_MODEL or DECISION_ENDPOINT is set to "": no router, no judge. */
  decision: DecisionConfig | null;
  maxRetrievalIterations: number;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function unitInterval(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

/** undefined means "use the default"; an explicit "" (after trim) means "off". */
function setting(raw: string | undefined, fallback: string): string {
  return raw === undefined ? fallback : raw.trim();
}

export function readAdaptiveConfig(env: AdaptiveEnvVars): AdaptiveConfig {
  const endpoint = setting(env.DECISION_ENDPOINT, DEFAULT_DECISION_ENDPOINT);
  const model = setting(env.DECISION_MODEL, DEFAULT_DECISION_MODEL);
  const apiKey = env.DECISION_API_KEY?.trim() || null;
  return {
    decision:
      endpoint && model
        ? {
            endpoint,
            model,
            apiKey,
            integrationId: env.DECISION_INTEGRATION_ID?.trim() || DEFAULT_DECISION_INTEGRATION_ID,
            timeoutMs: positiveInt(env.DECISION_TIMEOUT_MS, DEFAULT_DECISION_TIMEOUT_MS),
            minConfidence: unitInterval(env.DECISION_MIN_CONFIDENCE, DEFAULT_DECISION_MIN_CONFIDENCE),
          }
        : null,
    maxRetrievalIterations: Math.min(
      positiveInt(env.MAX_RETRIEVAL_ITERATIONS, MAX_RETRIEVAL_ITERATIONS_CEILING),
      MAX_RETRIEVAL_ITERATIONS_CEILING,
    ),
  };
}
