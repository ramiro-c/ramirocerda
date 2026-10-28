/**
 * Adaptive RAG knobs (router, query rewrite, sufficiency gate, re-search cap).
 *
 * Every knob is a wrangler.jsonc var with a safe code default, so a missing or
 * malformed value never breaks the request path. Parsing is defensive: invalid
 * numbers fall back to the default and the iteration cap is clamped to 1..2.
 */

/** Small, cheap Workers AI instruct model used for routing and query rewriting. */
export const DEFAULT_SMALL_MODEL = "@cf/meta/llama-3.2-3b-instruct";
export const DEFAULT_ROUTER_TIMEOUT_MS = 1500;
export const DEFAULT_REWRITE_TIMEOUT_MS = 1500;
/** Hard ceiling: never more than 2 retrievals per message, whatever the env says. */
export const MAX_RETRIEVAL_ITERATIONS_CEILING = 2;
export const DEFAULT_SUFFICIENCY_MIN_TOP_SCORE = 0.45;
export const DEFAULT_SUFFICIENCY_MIN_CHUNKS = 2;

export interface AdaptiveEnvVars {
  ROUTER_MODEL?: string;
  ROUTER_LLM_ENABLED?: string;
  ROUTER_TIMEOUT_MS?: string;
  REWRITE_MODEL?: string;
  REWRITE_TIMEOUT_MS?: string;
  MAX_RETRIEVAL_ITERATIONS?: string;
  SUFFICIENCY_MIN_TOP_SCORE?: string;
  SUFFICIENCY_MIN_CHUNKS?: string;
}

export interface AdaptiveConfig {
  routerModel: string;
  routerLlmEnabled: boolean;
  routerTimeoutMs: number;
  rewriteModel: string;
  rewriteTimeoutMs: number;
  maxRetrievalIterations: number;
  sufficiencyMinTopScore: number;
  sufficiencyMinChunks: number;
}

function nonEmpty(raw: string | undefined, fallback: string): string {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : fallback;
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function unitFloat(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function readAdaptiveConfig(env: AdaptiveEnvVars): AdaptiveConfig {
  const routerModel = nonEmpty(env.ROUTER_MODEL, DEFAULT_SMALL_MODEL);
  return {
    routerModel,
    // Anything but an explicit "false" keeps the LLM fallback on.
    routerLlmEnabled: (env.ROUTER_LLM_ENABLED ?? "true").trim().toLowerCase() !== "false",
    routerTimeoutMs: positiveInt(env.ROUTER_TIMEOUT_MS, DEFAULT_ROUTER_TIMEOUT_MS),
    rewriteModel: nonEmpty(env.REWRITE_MODEL, routerModel),
    rewriteTimeoutMs: positiveInt(env.REWRITE_TIMEOUT_MS, DEFAULT_REWRITE_TIMEOUT_MS),
    maxRetrievalIterations: Math.min(
      positiveInt(env.MAX_RETRIEVAL_ITERATIONS, MAX_RETRIEVAL_ITERATIONS_CEILING),
      MAX_RETRIEVAL_ITERATIONS_CEILING,
    ),
    sufficiencyMinTopScore: unitFloat(env.SUFFICIENCY_MIN_TOP_SCORE, DEFAULT_SUFFICIENCY_MIN_TOP_SCORE),
    sufficiencyMinChunks: positiveInt(env.SUFFICIENCY_MIN_CHUNKS, DEFAULT_SUFFICIENCY_MIN_CHUNKS),
  };
}
