/**
 * Adaptive RAG config: the decision model (router + sufficiency judge) and the
 * re-search cap.
 *
 * The decision model is Jev (TypeSafe's System One model) served by OpenCode at
 * DECISION_ENDPOINT. It is NOT a chat/OpenAI-compatible API: requests carry a
 * `state` plus typed `questions` (choice / noul) and answers come back typed
 * (see src/decision.ts).
 *
 * Two tiers per decision request: the primary DECISION_MODEL and an optional retry model
 * DECISION_FALLBACK_MODEL. The primary is called anonymously when its slug ends in "-free"
 * (jev-1.13-free) and with `Authorization: Bearer OPENCODE_GO_API_KEY` when it is a paid
 * slug (jev-1.13). If that attempt fails for any reason, ONE retry goes to the fallback
 * model with the same credential rule (anonymous for free slugs, keyed for paid slugs).
 * No fallback model or no key (when the fallback is paid) skips the retry.
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
 * Paid Jev slug on OpenCode System One. Source: OpenCode docs (console/models.mdx
 * model table: "Jev 1.13 | jev-1.13 | https://opencode.ai/inference/systemone/v1/systemone",
 * and "Use jev-1.13-free instead of jev-1.13 to use the limited-time free model").
 */
export const DEFAULT_DECISION_FALLBACK_MODEL = "jev-1.13";
/**
 * OpenCode's id for the credential integration the model belongs to (the
 * OpenCode client stores Console and Go credentials under "opencode"). It is
 * NOT part of the HTTP request: the endpoint only takes a Bearer key. Kept as
 * config for traceability (logged on chat.route).
 */
export const DEFAULT_DECISION_INTEGRATION_ID = "opencode";
/** Per ATTEMPT. Worst case per decision request is 2 attempts (free + paid). */
export const DEFAULT_DECISION_TIMEOUT_MS = 1000;
/** Below this choice confidence a non-search route is not trusted: search instead. */
export const DEFAULT_DECISION_MIN_CONFIDENCE = 0.5;
/** Probability threshold for the sufficiency judge: >= means sufficient, else re-search. */
export const DEFAULT_JUDGE_SUFFICIENT_THRESHOLD = 0.4;
/**
 * How long the anonymous free tier is skipped after it answers 429. The free model's
 * quota is a rolling usage limit, so the exact reset is unknown; 15 minutes keeps the
 * paid path as the only wasted work in the common case without silencing the free tier
 * for a whole day.
 */
export const DEFAULT_DECISION_FREE_COOLDOWN_MS = 15 * 60 * 1000;
/** Hard ceiling: never more than 2 retrievals per message, whatever the env says. */
export const MAX_RETRIEVAL_ITERATIONS_CEILING = 2;

export interface AdaptiveEnvVars {
  /** Botardo's OpenCode key (the generation secret). Sent ONLY on the paid fallback attempt. */
  OPENCODE_GO_API_KEY?: string;
  /** "0"/"false" turns the adaptive path off; anything else (or absent) keeps it on. */
  ADAPTIVE_RAG?: string;
  DECISION_ENDPOINT?: string;
  DECISION_MODEL?: string;
  DECISION_FALLBACK_MODEL?: string;
  DECISION_INTEGRATION_ID?: string;
  DECISION_TIMEOUT_MS?: string;
  DECISION_MIN_CONFIDENCE?: string;
  /** While > 0, skip the anonymous tier for this many ms after it answers 429. */
  DECISION_FREE_COOLDOWN_MS?: string;
  /** "1" or "true" skips the anonymous tier outright (the paid path must exist). */
  DECISION_FREE_DISABLED?: string;
  MAX_RETRIEVAL_ITERATIONS?: string;
  /** Sufficiency judge threshold (default 0.4). >= means sufficient. */
  JUDGE_SUFFICIENT_THRESHOLD?: string;
}

export interface DecisionConfig {
  endpoint: string;
  /** Primary model: anonymous for free slugs (ends in "-free"), keyed for paid slugs. */
  model: string;
  /** Retry model; null disables the retry. */
  fallbackModel: string | null;
  /** Bearer key for the fallback attempt (OPENCODE_GO_API_KEY); null disables the retry. */
  apiKey: string | null;
  integrationId: string;
  timeoutMs: number;
  minConfidence: number;
  /** Window, in ms, during which the anonymous tier is skipped after a 429. */
  freeCooldownMs: number;
  /** Operator kill switch: never call the anonymous tier (needs a paid path). */
  freeDisabled: boolean;
}

export interface AdaptiveConfig {
  /**
   * Feature flag for the whole adaptive path (router, sufficiency judge, query
   * rewrite, re-search). Off means the pre-adaptive behaviour: one search with the
   * raw message, similarity gate, generate. The code stays; only the route changes.
   */
  adaptiveEnabled: boolean;
  /** null when DECISION_MODEL or DECISION_ENDPOINT is set to "": no router, no judge. */
  decision: DecisionConfig | null;
  maxRetrievalIterations: number;
  /** Probability threshold for sufficient judge verdict (>= means sufficient). */
  judgeSufficientThreshold: number;
}

/** Only an explicit 0/false turns a flag off: an absent value keeps the default on. */
function isOffFlag(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off";
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

/** Accepts the same spellings a shell and wrangler both use; anything else is false. */
function flag(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export function readAdaptiveConfig(env: AdaptiveEnvVars): AdaptiveConfig {
  const endpoint = setting(env.DECISION_ENDPOINT, DEFAULT_DECISION_ENDPOINT);
  const model = setting(env.DECISION_MODEL, DEFAULT_DECISION_MODEL);
  const apiKey = env.OPENCODE_GO_API_KEY?.trim() || null;
  return {
    adaptiveEnabled: !isOffFlag(env.ADAPTIVE_RAG),
    decision:
      endpoint && model
        ? {
            endpoint,
            model,
            fallbackModel: setting(env.DECISION_FALLBACK_MODEL, DEFAULT_DECISION_FALLBACK_MODEL) || null,
            apiKey,
            integrationId: env.DECISION_INTEGRATION_ID?.trim() || DEFAULT_DECISION_INTEGRATION_ID,
            timeoutMs: positiveInt(env.DECISION_TIMEOUT_MS, DEFAULT_DECISION_TIMEOUT_MS),
            minConfidence: unitInterval(env.DECISION_MIN_CONFIDENCE, DEFAULT_DECISION_MIN_CONFIDENCE),
            freeCooldownMs: positiveInt(env.DECISION_FREE_COOLDOWN_MS, DEFAULT_DECISION_FREE_COOLDOWN_MS),
            freeDisabled: flag(env.DECISION_FREE_DISABLED),
          }
        : null,
    maxRetrievalIterations: Math.min(
      positiveInt(env.MAX_RETRIEVAL_ITERATIONS, MAX_RETRIEVAL_ITERATIONS_CEILING),
      MAX_RETRIEVAL_ITERATIONS_CEILING,
    ),
    judgeSufficientThreshold: unitInterval(env.JUDGE_SUFFICIENT_THRESHOLD, DEFAULT_JUDGE_SUFFICIENT_THRESHOLD),
  };
}
