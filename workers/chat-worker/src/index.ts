import type { AdaptiveEnvVars } from "./config";
import { detectLanguage } from "./language";
import { ROUTE_CODE, routerStatusCode, runAdaptivePipeline, VERDICT_CODE, type PipelineOutcome } from "./pipeline";
import { validateAskBody } from "./validate";

interface AskRequest {
  message: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  /** Stable per-conversation ID forwarded to OpenCode Go via x-opencode-session. */
  sessionId?: string;
}

/**
 * 200 body. CONTRACT with the widget (PR #21): `offerContact` is ALWAYS present;
 * true only when the router detected hiring intent, false when unknown (router
 * not configured or failed). Error bodies (429/500) keep their verbatim shape.
 */
export interface AskResponse {
  reply: string;
  offerContact: boolean;
}

const ALLOWED_ORIGINS = new Set([
  "https://ramirocerda.vercel.app",
  "https://ramirocerda.com.ar",
  "https://www.ramirocerda.com.ar",
  "http://localhost:4321",
]);

// Entry module rule: workerd treats every named VALUE export of this module as
// an entrypoint and refuses to boot `wrangler dev` on a string/object export
// ("Incorrect type for map entry ... not of type 'function or ExportedHandler'").
// Only the default handler and type-only exports live here; prompts are
// imported from ./prompts directly (tests included).

interface Env extends AdaptiveEnvVars {
  AI: {
    run: (model: string, input: unknown) => Promise<{ response?: unknown; data?: unknown; shape?: unknown }>;
  };
  VECTORIZE: {
    query: (
      vector: number[],
      options: { topK: number; returnMetadata?: string },
    ) => Promise<{
      matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
    }>;
  };
  ANALYTICS?: {
    writeDataPoint: (event: {
      blobs?: string[];
      doubles?: number[];
      indexes?: string[];
    }) => void;
  };
  OPENCODE_GO_API_KEY: string;
  TOP_K: string;
  SIMILARITY_THRESHOLD: string;
  GENERATION_MODEL: string;
  OPENCODE_GO_ENDPOINT: string;
  EMBEDDING_MODEL: string;
  /** Public origin used to render note links as absolute URLs, e.g. "https://ramirocerda.com.ar". */
  SITE_ORIGIN?: string;
  CHAT_RATE_LIMITER: {
    limit: (opts: { key: string }) => Promise<{ success: boolean }>;
  };
}

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

// Analytics Engine data point schema (shared with scripts/chat-stats.mjs):
//   blobs:   [0] detected language ("es"|"en") | [1] "ok"|"rate_limited"|"model_error" | [2] first 80 chars of the question
//            | [3] router model tier: "free" | "paid" | "none" (appended by the paid fallback; "" on older rows)
//   doubles: [0] chunk_count | [1] top similarity score | [2] retrieval latency ms | [3] generation latency ms
//            (appended by adaptive RAG, never reorder) [4] route code (0 search, 1 smalltalk, 2 off_topic)
//            | [5] retrieval iterations (0..2) | [6] search query used the conversation (0/1) | [7] router latency ms
//            | [8] offerContact (0/1) | [9] router status (0 decision model answered, 1 fallback, 2 off)
//            | [10] judge verdict (0 skipped, 1 sufficient, 2 insufficient, 3 error) | [11] judge latency ms
//   indexes: [0] conversation sessionId (one conversation = one AE index slot)
function writeUsage(
  env: Env,
  point: {
    sessionId: string;
    lang: string;
    status: "ok" | "rate_limited" | "model_error";
    preview: string;
    chunkCount: number;
    topScore: number;
    retrievalMs: number;
    generationMs: number;
    /** Absent on the rate-limit gate datapoint: adaptive doubles are written as 0. */
    run?: PipelineOutcome;
  },
): void {
  env.ANALYTICS?.writeDataPoint({
    indexes: [point.sessionId],
    // [3] appended: which decision model answered the router (free | paid | none).
    blobs: [point.lang, point.status, point.preview, point.run?.decision.trace?.tier ?? "none"],
    doubles: [
      point.chunkCount,
      point.topScore,
      point.retrievalMs,
      point.generationMs,
      point.run ? ROUTE_CODE[point.run.decision.route] : 0,
      point.run?.retrievalIterations ?? 0,
      point.run?.rewritten ? 1 : 0,
      point.run?.routerMs ?? 0,
      point.run?.offerContact ? 1 : 0,
      point.run ? routerStatusCode(point.run.decision) : 0,
      point.run ? VERDICT_CODE[point.run.verdict.kind] : 0,
      point.run?.judgeMs ?? 0,
    ],
  });
}

function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

/** Only reflect allowed origins; never echo a default ACAO for blocked/missing origins. */
function corsHeaders(origin: string | null): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin as string;
  }
  return headers;
}

function jsonResponse(
  status: number,
  payload: Record<string, unknown>,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

// R7: 429/500 bodies preserved verbatim.
function rateLimitedResponse(origin: string | null): Response {
  log("error.rate_limited");
  return new Response(
    JSON.stringify({
      error: "Demasiadas consultas. Esperá un momento y volvé a intentar.",
      code: "RATE_LIMITED",
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    },
  );
}

function modelErrorResponse(origin: string | null): Response {
  log("error.model");
  return new Response(
    JSON.stringify({
      error: "Ocurrió un error al procesar tu consulta. Intentá de nuevo.",
      code: "MODEL_ERROR",
    }),
    {
      status: 500,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    },
  );
}

function okReply(reply: string, offerContact: boolean, origin: string | null): Response {
  const response: AskResponse = { reply, offerContact };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

async function handleRag(
  message: string,
  history: AskRequest["history"],
  env: Env,
  sessionId: string,
  origin: string | null,
): Promise<Response> {
  log("chat.rag_start", {
    lang: detectLanguage(message),
    msg_preview: message.slice(0, 80),
    history_turns: history?.length ?? 0,
  });

  const run = await runAdaptivePipeline({ message, history, env, sessionId, log });
  const { outcome } = run;
  const usage = (status: "ok" | "rate_limited" | "model_error") =>
    writeUsage(env, {
      sessionId,
      lang: run.lang,
      status,
      preview: message.slice(0, 80),
      chunkCount: run.chunks.length,
      topScore: run.topScore,
      retrievalMs: run.retrievalMs,
      generationMs: run.generationMs,
      run,
    });

  if (outcome.kind !== "generated") {
    usage("ok");
    return okReply(outcome.reply, run.offerContact, origin);
  }

  const gen = outcome.result;
  if (gen.status === 429) {
    usage("rate_limited");
    return rateLimitedResponse(origin);
  }
  if (gen.status === 500) {
    usage("model_error");
    return modelErrorResponse(origin);
  }

  usage("ok");
  return okReply(gen.content.trim(), run.offerContact, origin);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin)) {
        log("request.origin_blocked", { origin, phase: "preflight" });
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    // Only accept POST
    if (request.method !== "POST") {
      log("request.invalid", {
        reason: "method_not_allowed",
        method: request.method,
      });
      return jsonResponse(405, { error: "Method not allowed", code: "INVALID_REQUEST" }, origin);
    }

    // Only accept the documented endpoint. Anything else is a 404.
    const pathname = new URL(request.url).pathname;
    if (pathname !== "/ask") {
      log("request.invalid", { reason: "path_not_found", path: pathname });
      return jsonResponse(404, { error: "Not found", code: "NOT_FOUND" }, origin);
    }
    if (!isAllowedOrigin(origin)) {
      log("request.origin_blocked", { origin });
      return jsonResponse(403, { error: "Origin not allowed", code: "INVALID_REQUEST" }, origin);
    }

    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const rate = await env.CHAT_RATE_LIMITER.limit({ key: clientIp });
    if (!rate.success) {
      writeUsage(env, {
        sessionId: "rate-limit",
        lang: "es",
        status: "rate_limited",
        preview: "",
        chunkCount: 0,
        topScore: 0,
        retrievalMs: 0,
        generationMs: 0,
      });
      return rateLimitedResponse(origin);
    }

    try {
      const body = await request.json();
      const parsed = validateAskBody(body);
      if (!parsed.ok) {
        log("request.invalid", { reason: parsed.error.code });
        return jsonResponse(400, parsed.error, origin);
      }

      const { message, history, sessionId } = parsed.value;

      // Adaptive RAG pipeline (LLM router, retrieval with an LLM sufficiency
      // judge and at most one re-search, generation via OpenCode Go; see
      // src/pipeline.ts). sessionId: prefer the frontend's stable per-conversation
      // ID; fall back to a fresh UUID so the Go session header is always present.
      return await handleRag(
        message,
        history,
        env,
        sessionId ?? crypto.randomUUID(),
        origin,
      );
    } catch (err) {
      // Check for rate limit errors
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes("rate") || errorMessage.includes("429")) {
        log("error.rate_limited", { error_message: errorMessage });
        return rateLimitedResponse(origin);
      }

      // Generic model error
      log("error.model", { error_message: errorMessage });
      return modelErrorResponse(origin);
    }
  },
};
