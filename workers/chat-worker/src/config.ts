/**
 * Adaptive RAG config: the OpenRouter control-flow model (router + sufficiency
 * judge) and the re-search cap.
 *
 * OPENROUTER_MODEL has NO default on purpose: the model is Ramiro's choice. When
 * the model or the OPENROUTER_API_KEY secret is missing, `openRouter` is null and
 * the pipeline runs the pre-adaptive behaviour (search with the raw message,
 * similarity gate, generate), so the worker keeps answering.
 *
 * Every numeric knob has a safe code default; malformed values fall back to it.
 */

export const DEFAULT_OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const DEFAULT_OPENROUTER_TIMEOUT_MS = 2500;
export const DEFAULT_OPENROUTER_MAX_TOKENS = 256;
/** Hard ceiling: never more than 2 retrievals per message, whatever the env says. */
export const MAX_RETRIEVAL_ITERATIONS_CEILING = 2;

export type ResponseFormatMode = "json_schema" | "json_object" | "none";
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high";

export interface AdaptiveEnvVars {
  /** Worker secret (wrangler secret put OPENROUTER_API_KEY). */
  OPENROUTER_API_KEY?: string;
  /** OpenRouter model slug. Empty means adaptive routing is off. */
  OPENROUTER_MODEL?: string;
  OPENROUTER_ENDPOINT?: string;
  OPENROUTER_TIMEOUT_MS?: string;
  OPENROUTER_MAX_TOKENS?: string;
  /** json_schema (default) | json_object | none. */
  OPENROUTER_RESPONSE_FORMAT?: string;
  /** Optional reasoning effort for reasoning models; empty sends nothing. */
  OPENROUTER_REASONING_EFFORT?: string;
  MAX_RETRIEVAL_ITERATIONS?: string;
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs: number;
  maxTokens: number;
  responseFormat: ResponseFormatMode;
  reasoningEffort: ReasoningEffort | null;
}

export interface AdaptiveConfig {
  /** null when OPENROUTER_MODEL or OPENROUTER_API_KEY is missing: no router, no judge. */
  openRouter: OpenRouterConfig | null;
  maxRetrievalIterations: number;
}

function trimmed(raw: string | undefined): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const RESPONSE_FORMATS: readonly ResponseFormatMode[] = ["json_schema", "json_object", "none"];
const REASONING_EFFORTS: readonly ReasoningEffort[] = ["none", "minimal", "low", "medium", "high"];

export function readAdaptiveConfig(env: AdaptiveEnvVars): AdaptiveConfig {
  const apiKey = trimmed(env.OPENROUTER_API_KEY);
  const model = trimmed(env.OPENROUTER_MODEL);
  const format = trimmed(env.OPENROUTER_RESPONSE_FORMAT).toLowerCase() as ResponseFormatMode;
  const effort = trimmed(env.OPENROUTER_REASONING_EFFORT).toLowerCase() as ReasoningEffort;
  return {
    openRouter:
      apiKey && model
        ? {
            apiKey,
            model,
            endpoint: trimmed(env.OPENROUTER_ENDPOINT) || DEFAULT_OPENROUTER_ENDPOINT,
            timeoutMs: positiveInt(env.OPENROUTER_TIMEOUT_MS, DEFAULT_OPENROUTER_TIMEOUT_MS),
            maxTokens: positiveInt(env.OPENROUTER_MAX_TOKENS, DEFAULT_OPENROUTER_MAX_TOKENS),
            responseFormat: RESPONSE_FORMATS.includes(format) ? format : "json_schema",
            reasoningEffort: REASONING_EFFORTS.includes(effort) ? effort : null,
          }
        : null,
    maxRetrievalIterations: Math.min(
      positiveInt(env.MAX_RETRIEVAL_ITERATIONS, MAX_RETRIEVAL_ITERATIONS_CEILING),
      MAX_RETRIEVAL_ITERATIONS_CEILING,
    ),
  };
}
