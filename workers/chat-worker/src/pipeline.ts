/**
 * Adaptive RAG pipeline (control flow owned by code, not by an agent loop).
 *
 *   1. route      heuristics first, small LLM only when ambiguous, fail-open to about_ramiro
 *   2. smalltalk  canned identity reply (no retrieval, no LLM)
 *      off_topic  canned polite refusal (no retrieval, no generation)
 *   3. rewrite    with history only: standalone search query (small LLM, fallback raw message)
 *   4. retrieve   search, score-based sufficiency check, at most one reformulated re-search
 *   5. no chunks  NO_INFO_REPLY (no generation)
 *   6. generate   once, with the ORIGINAL message + history (the rewrite only drives search)
 *
 * Extra cost over the old linear pipeline, per message, is bounded: at most one
 * router call, one rewrite call, one reformulation call (all small, low
 * max_tokens, temperature 0, hard timeout) and one extra embedding + Vectorize
 * query. Smalltalk and off-topic messages are strictly cheaper than before.
 */

import { readAdaptiveConfig, type AdaptiveEnvVars } from "./config";
import { generateReply, type GenerateResult } from "./generate";
import { detectLanguage, type Language } from "./language";
import { IDENTITY_PROMPT, NO_INFO_REPLY, OFF_TOPIC_REPLY, SMALLTALK_REPLY } from "./prompts";
import { buildRagPrompt, type RetrievedChunk } from "./rag";
import { rewriteQuery } from "./query";
import { retrieveAdaptive } from "./retrieval";
import { routeMessage, type HistoryTurn, type Route, type RouteDecision } from "./router";

export interface PipelineEnv extends AdaptiveEnvVars {
  AI: { run: (model: string, input: unknown) => Promise<{ response?: unknown; data?: unknown; shape?: unknown }> };
  VECTORIZE: {
    query: (
      vector: number[],
      options: { topK: number; returnMetadata?: string },
    ) => Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> }>;
  };
  OPENCODE_GO_API_KEY: string;
  TOP_K: string;
  SIMILARITY_THRESHOLD: string;
  GENERATION_MODEL: string;
  OPENCODE_GO_ENDPOINT: string;
  EMBEDDING_MODEL: string;
  SITE_ORIGIN?: string;
}

/** Fallback origin when SITE_ORIGIN is not configured. */
export const DEFAULT_SITE_ORIGIN = "https://ramirocerda.com.ar";

/** Numeric route codes for the Analytics Engine `double5` column. */
export const ROUTE_CODE: Record<Route, number> = { about_ramiro: 0, smalltalk: 1, off_topic: 2 };

export type PipelineReply =
  | { kind: "smalltalk"; reply: string }
  | { kind: "off_topic"; reply: string }
  | { kind: "no_info"; reply: string }
  | { kind: "generated"; result: GenerateResult };

export interface PipelineOutcome {
  lang: Language;
  decision: RouteDecision;
  outcome: PipelineReply;
  chunks: RetrievedChunk[];
  topScore: number;
  /** Router + rewrite latency (before the first search). */
  preRetrievalMs: number;
  /** Whole adaptive retrieval, including the reformulation call when it happens. */
  retrievalMs: number;
  generationMs: number;
  /** Vectorize searches actually run (0 for smalltalk/off_topic, otherwise 1 or 2). */
  retrievalIterations: number;
  rewritten: boolean;
  searchQueries: string[];
}

export type PipelineLogger = (event: string, data?: Record<string, unknown>) => void;

export async function runAdaptivePipeline(opts: {
  message: string;
  history: HistoryTurn[] | undefined;
  env: PipelineEnv;
  sessionId: string;
  log?: PipelineLogger;
}): Promise<PipelineOutcome> {
  const { message, history, env, sessionId } = opts;
  const log: PipelineLogger = opts.log ?? (() => {});
  const config = readAdaptiveConfig(env);
  const lang = detectLanguage(message);

  const tPre = Date.now();
  const decision = await routeMessage(message, history, env, config);
  log("chat.route", { route: decision.route, via: decision.via, latency_ms: Date.now() - tPre });

  const base = {
    lang,
    decision,
    chunks: [] as RetrievedChunk[],
    topScore: 0,
    retrievalMs: 0,
    generationMs: 0,
    retrievalIterations: 0,
    rewritten: false,
    searchQueries: [] as string[],
  };

  if (decision.route === "smalltalk") {
    const replyLang = decision.smalltalkLang ?? lang;
    const reply = SMALLTALK_REPLY[decision.smalltalkKind ?? "greeting"][replyLang];
    return { ...base, lang: replyLang, preRetrievalMs: Date.now() - tPre, outcome: { kind: "smalltalk", reply } };
  }
  if (decision.route === "off_topic") {
    return { ...base, preRetrievalMs: Date.now() - tPre, outcome: { kind: "off_topic", reply: OFF_TOPIC_REPLY[lang] } };
  }

  const tRewrite = Date.now();
  const rewrite = await rewriteQuery(message, history, env, config);
  if (history && history.length > 0) {
    log("chat.query_rewrite", {
      rewritten: rewrite.rewritten,
      latency_ms: Date.now() - tRewrite,
      query_preview: rewrite.query.slice(0, 80),
    });
  }
  const preRetrievalMs = Date.now() - tPre;

  const tRet = Date.now();
  const retrieval = await retrieveAdaptive(rewrite.query, env, config);
  const retrievalMs = Date.now() - tRet;
  const chunks = retrieval.chunks;
  const topScore = chunks.reduce((max, c) => Math.max(max, c.score), 0);
  for (const it of retrieval.log) {
    log("chat.rag_iteration", {
      iteration: it.iteration,
      chunk_count: it.chunkCount,
      top_score: it.topScore,
      sufficient: it.sufficient,
    });
  }
  log("chat.rag_retrieved", { chunk_count: chunks.length, latency_ms: retrievalMs, iterations: retrieval.iterations });

  const retrieved = {
    ...base,
    chunks,
    topScore,
    preRetrievalMs,
    retrievalMs,
    retrievalIterations: retrieval.iterations,
    rewritten: rewrite.rewritten,
    searchQueries: retrieval.queries,
  };

  if (chunks.length === 0) {
    log("chat.rag_no_context", { lang });
    return { ...retrieved, outcome: { kind: "no_info", reply: NO_INFO_REPLY[lang] } };
  }

  const messages = buildRagPrompt({
    identityPrompt: IDENTITY_PROMPT,
    chunks,
    language: lang,
    history,
    message,
    // Absolute so the widget auto-links the note instead of showing a dead path.
    siteOrigin: env.SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN,
  });

  const tGen = Date.now();
  const result = await generateReply({
    endpoint: env.OPENCODE_GO_ENDPOINT,
    apiKey: env.OPENCODE_GO_API_KEY,
    model: env.GENERATION_MODEL,
    messages,
    sessionId,
  });
  const generationMs = Date.now() - tGen;
  log("chat.ai_done", {
    latency_ms: generationMs,
    reply_length: result.status === 200 ? result.content.length : 0,
    // True only when the upstream ran out of output budget even after the
    // doubled-budget retry: the visitor got an answer cut mid-sentence.
    truncated: result.status === 200 && result.truncated === true,
  });

  return { ...retrieved, generationMs, outcome: { kind: "generated", result } };
}
