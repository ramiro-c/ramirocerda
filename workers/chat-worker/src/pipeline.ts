/**
 * Adaptive RAG pipeline. The control flow is fixed in code; a decision model
 * (Jev, TypeSafe System One, served by OpenCode) only fills in typed decisions
 * at two points, each one bounded request:
 *
 *   1. route     ONE request: route (choice) + hire_intent (noul) + needs_history
 *                (noul, only with history). Any failure, or the decision model off:
 *                route=search, hire_intent=false, query=raw message.
 *   2. smalltalk one short generation, no retrieval
 *      off_topic fixed localized reply, no retrieval, no generation
 *   3. search    retrieve with the query (raw message, or previous user turn +
 *                message when the model says it needs the history); ONE judge
 *                request (noul) decides sufficiency and, when insufficient,
 *                ONE more search with the alternate query (hard cap of 2
 *                searches); judge failure keeps search 1
 *   4. no chunks NO_INFO_REPLY (similarity gate unchanged, no generation)
 *   5. generate  once, with the ORIGINAL message + history
 *
 * With DECISION_MODEL="" this is exactly the linear pipeline that shipped
 * before: search the raw message, gate, generate.
 */

import { readAdaptiveConfig, type AdaptiveEnvVars } from "./config";
import { generateReply, type GenerateResult } from "./generate";
import { detectLanguage, type Language } from "./language";
import { IDENTITY_PROMPT, NO_INFO_REPLY, OFF_TOPIC_REPLY, SMALLTALK_INSTRUCTION } from "./prompts";
import { buildRagPrompt, HISTORY_TURNS, retrieveChunks, type ChatMessage, type RetrievedChunk } from "./rag";
import { retrieveAdaptive, type JudgeVerdict } from "./retrieval";
import { fallbackDecision, routeMessage, type HistoryTurn, type Route, type RouteDecision } from "./router";

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
  RAG_RERANK_MODEL?: string;
  RAG_RERANK_CANDIDATES?: string;
  GENERATION_MODEL: string;
  OPENCODE_GO_ENDPOINT: string;
  EMBEDDING_MODEL: string;
  SITE_ORIGIN?: string;
}

/** Fallback origin when SITE_ORIGIN is not configured. */
export const DEFAULT_SITE_ORIGIN = "https://ramirocerda.com.ar";

/** Numeric codes for the Analytics Engine doubles (append-only schema, see index.ts). */
export const ROUTE_CODE: Record<Route, number> = { search: 0, smalltalk: 1, off_topic: 2 };
/** 0 decision model answered validly, 1 fallback after an error, 2 decision model off. */
export function routerStatusCode(decision: RouteDecision): number {
  if (decision.via === "llm") return 0;
  return decision.via === "not_configured" ? 2 : 1;
}
/** 0 skipped, 1 sufficient, 2 insufficient, 3 judge error. */
export const VERDICT_CODE: Record<JudgeVerdict["kind"], number> = { skipped: 0, sufficient: 1, insufficient: 2, error: 3 };

export type PipelineReply =
  | { kind: "off_topic"; reply: string }
  | { kind: "no_info"; reply: string }
  | { kind: "generated"; result: GenerateResult };

export interface PipelineOutcome {
  lang: Language;
  decision: RouteDecision;
  /** Contract with the widget (AskResponse.offerContact): the router's hire_intent, false when unknown. */
  offerContact: boolean;
  outcome: PipelineReply;
  chunks: RetrievedChunk[];
  topScore: number;
  routerMs: number;
  /** Searches plus the judge call. */
  retrievalMs: number;
  judgeMs: number;
  generationMs: number;
  /** Vectorize searches actually run (0 for smalltalk/off_topic, otherwise 1 or 2). */
  retrievalIterations: number;
  /** True when the search query differs from the raw message (follow-up with context). */
  rewritten: boolean;
  searchQueries: string[];
  verdict: JudgeVerdict;
}

export type PipelineLogger = (event: string, data?: Record<string, unknown>) => void;

function smalltalkMessages(history: HistoryTurn[] | undefined, message: string): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: `${IDENTITY_PROMPT}\n\n${SMALLTALK_INSTRUCTION}` }];
  for (const entry of (history ?? []).slice(-HISTORY_TURNS)) messages.push({ role: entry.role, content: entry.content });
  messages.push({ role: "user", content: message });
  return messages;
}

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
  const siteOrigin = env.SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN;

  const tRoute = Date.now();
  // The flag is the whole point of this switch: off means no decision model at all,
  // so a deployment can turn the adaptive path off without touching any other knob.
  const decision = config.adaptiveEnabled
    ? await routeMessage(message, history, config)
    : fallbackDecision(message, "disabled");
  const routerMs = Date.now() - tRoute;
  const offerContact = decision.hireIntent;
  // True when a rewritten (history-merged) query exists as the judge's fallback. The raw
  // message is always searched first, so this no longer means "the first search was rewritten".
  const rewritten = decision.route === "search" && decision.alternateQuery !== null;
  log("chat.route", {
    route: decision.route,
    via: decision.via,
    // Which model answered: free (jev-1.13-free), paid (fallback, Bearer key) or none.
    model_tier: decision.trace?.tier ?? "none",
    model: decision.trace?.model ?? null,
    ...(decision.trace?.primaryError ? { primary_error: decision.trace.primaryError } : {}),
    fallback: decision.trace?.fallback ?? "off",
    integration: config.decision?.integrationId ?? null,
    ...(decision.scores
      ? {
          route_confidence: decision.scores.routeConfidence,
          hire_intent_p: decision.scores.hireIntent,
          needs_history_p: decision.scores.needsHistory,
        }
      : {}),
    hire_intent: decision.hireIntent,
    offer_contact: offerContact,
    rewritten,
    latency_ms: routerMs,
    ...(rewritten && decision.alternateQuery ? { query_preview: decision.alternateQuery.slice(0, 80) } : {}),
  });

  const base = {
    lang,
    decision,
    offerContact,
    chunks: [] as RetrievedChunk[],
    topScore: 0,
    routerMs,
    retrievalMs: 0,
    judgeMs: 0,
    generationMs: 0,
    retrievalIterations: 0,
    rewritten,
    searchQueries: [] as string[],
    verdict: { kind: "skipped" } as JudgeVerdict,
  };

  const generate = async (messages: ChatMessage[]) => {
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
      // The HTTP status of the generation call: reply_length is 0 for every
      // non-200, so without this a 401 (expired key) looks like a 429 or a 500.
      status: result.status,
      ...(result.status === 500 && result.upstream !== undefined ? { upstream_status: result.upstream } : {}),
      reply_length: result.status === 200 ? result.content.length : 0,
      // True only when the upstream ran out of output budget even after the
      // doubled-budget retry: the visitor got an answer cut mid-sentence.
      truncated: result.status === 200 && result.truncated === true,
    });
    return { result, generationMs };
  };

  if (decision.route === "off_topic") {
    return { ...base, outcome: { kind: "off_topic", reply: OFF_TOPIC_REPLY[lang] } };
  }
  if (decision.route === "smalltalk") {
    const { result, generationMs } = await generate(smalltalkMessages(history, message));
    return { ...base, generationMs, outcome: { kind: "generated", result } };
  }

  const tRet = Date.now();
  // With the flag off there is no judge to ask and no rewrite to try: one search with
  // the raw message, exactly the pre-adaptive pipeline.
  const retrieval = config.adaptiveEnabled
    ? await retrieveAdaptive(
        { question: message, query: decision.query, alternateQuery: decision.alternateQuery },
        env,
        config,
      )
    : {
        chunks: await retrieveChunks(message, env),
        iterations: 1,
        verdict: { kind: "skipped" } as JudgeVerdict,
        judgeMs: 0,
        queries: [message],
        judgeTrace: undefined,
      };
  const retrievalMs = Date.now() - tRet;
  const chunks = retrieval.chunks;
  const topScore = chunks.reduce((max, c) => Math.max(max, c.score), 0);
  if (retrieval.verdict.kind !== "skipped") {
    log("chat.rag_judge", {
      verdict: retrieval.verdict.kind,
      ...(retrieval.verdict.kind === "error" ? { reason: retrieval.verdict.reason } : { p: retrieval.verdict.probability }),
      model_tier: retrieval.judgeTrace?.tier ?? "none",
      ...(retrieval.judgeTrace?.primaryError ? { primary_error: retrieval.judgeTrace.primaryError } : {}),
      fallback: retrieval.judgeTrace?.fallback ?? "off",
      latency_ms: retrieval.judgeMs,
    });
  }
  log("chat.rag_retrieved", {
    chunk_count: chunks.length,
    latency_ms: retrievalMs,
    iterations: retrieval.iterations,
    // The literal queries searched, in order: the rewritten/contextual one first, then the
    // alternate only when the judge asked for it. Without them a retrieval miss cannot be
    // told apart from a bad rewrite, and the eval artifact cannot either.
    queries: retrieval.queries,
  });

  const retrieved = {
    ...base,
    chunks,
    topScore,
    retrievalMs,
    judgeMs: retrieval.judgeMs,
    retrievalIterations: retrieval.iterations,
    searchQueries: retrieval.queries,
    verdict: retrieval.verdict,
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
    siteOrigin,
  });
  const { result, generationMs } = await generate(messages);
  return { ...retrieved, generationMs, outcome: { kind: "generated", result } };
}
