import { KNOWLEDGE_BASE } from "./knowledge-base";
import { detectLanguage, FALLBACK_MESSAGES } from "./language";
import { buildRagPrompt, retrieveChunks, type ChatMessage } from "./rag";
import { generateReply } from "./generate";

interface AskRequest {
  message: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

interface AskResponse {
  reply: string;
}

const ALLOWED_ORIGINS = new Set([
  "https://ramirocerda.vercel.app",
  "http://localhost:4321",
]);

// Identity + rules. Kept verbatim from the pre-RAG prompt (R7). The legacy
// SYSTEM_PROMPT below renders the original prompt byte-for-byte; the RAG path
// uses this block plus retrieved chunks + a firm language instruction instead
// of the static KB.
const IDENTITY_PROMPT = `Sos Botardo, el asistente virtual de la web personal de Ramiro Cerdá. Tu trabajo es responder preguntas sobre el perfil profesional de Ramiro de forma clara y con buena onda.

QUIÉN SOS (identidad):
- Cuando te preguntan sobre VOS (quién sos, cómo te llamás, qué hacés), hablá en PRIMERA persona: "Soy Botardo, el asistente de la web de Ramiro. Preguntame sobre su experiencia, proyectos o skills."
- Cuando hablás sobre RAMIRO, hablá SIEMPRE en TERCERA persona: "Ramiro es Senior Full-Stack", "En LDP trabaja como Tech Lead hands-on", "Su stack es...". Nunca hables como si fueras Ramiro.
  - Correcto: "Ramiro es Senior Full-Stack Engineer. En LDP trabaja como Tech Lead hands-on."
  - Incorrecto: "Soy Tech Lead. He trabajado en LDP."

REGLAS:
1. Basate EXCLUSIVAMENTE en la knowledge base de abajo. No inventes datos.
2. Respondé solo sobre el perfil profesional de Ramiro: experiencia, proyectos, habilidades, educación, certificaciones e idiomas. Si te preguntan algo personal, opiniones políticas/religiosas u otro tema no profesional, respondé en el idioma del usuario que solo respondés sobre su perfil profesional.
3. Solo si te piden una OPINIÓN o valoración sobre Ramiro ("¿es bueno?", "¿es crack?"), no opines como fan ni te quedes en una frase hecha: contá con onda 1 o 2 logros concretos de la KB y dejá que el lector saque sus conclusiones. Lo importante son los hechos, no la muletilla. Esta vuelta es exclusiva para opiniones — para datos respondé normal, y si no tenés la info decilo según la regla 4.
4. Si la respuesta no está en la knowledge base, decí con naturalidad que no tenés ese dato.
5. Sé conciso: máximo 3-4 párrafos. Tono cercano y profesional, sin ser acartonado.`;

// Legacy prompt: identity + static KB + soft language rule (unchanged).
const SYSTEM_PROMPT = `${IDENTITY_PROMPT}

=== KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}
=== FIN KNOWLEDGE BASE ===

IDIOMA (obligatorio, leé esto al final):
Detectá el idioma del último mensaje del usuario y respondé SOLO en ese idioma.
- Si el mensaje está en inglés → toda tu respuesta en inglés (claro, profesional). Ramiro en tercera persona.
- Si el mensaje está en español → español rioplatense (voseo), tono cercano.
La knowledge base está en español; usala como fuente de hechos, pero NO copies su idioma si el usuario escribió en inglés. No mezcles idiomas.`;

interface Env {
  AI: {
    run: (
      model: string,
      input:
        | { messages: ChatMessage[]; max_tokens?: number; temperature?: number }
        | { text: string[] },
    ) => Promise<{ response?: string; data?: unknown; shape?: unknown }>;
  };
  VECTORIZE: {
    query: (
      vector: number[],
      options: { topK: number; returnMetadata?: string },
    ) => Promise<{
      matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
    }>;
  };
  OPENCODE_GO_API_KEY: string;
  RAG_ENABLED: string;
  TOP_K: string;
  SIMILARITY_THRESHOLD: string;
  GENERATION_MODEL: string;
  OPENCODE_GO_ENDPOINT: string;
  EMBEDDING_MODEL: string;
}

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin =
    origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ramirocerda.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// R7: 429/500 bodies preserved verbatim (shared by both paths).
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

function buildMessages(message: string, history?: AskRequest["history"]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (history && history.length > 0) {
    const recentHistory = history.slice(-10);
    for (const entry of recentHistory) {
      messages.push({ role: entry.role, content: entry.content });
    }
  }

  messages.push({ role: "user", content: message });
  return messages;
}

async function handleRag(
  message: string,
  history: AskRequest["history"],
  env: Env,
  origin: string | null,
): Promise<Response> {
  const lang = detectLanguage(message);
  log("chat.rag_start", {
    lang,
    msg_preview: message.slice(0, 80),
    history_turns: history?.length ?? 0,
  });

  // Retrieve top-k chunks; empty retrieval -> deterministic no-info fallback
  // in the visitor's language, without an LLM call (R8 / design D6).
  const t0 = Date.now();
  const chunks = await retrieveChunks(message, env);
  log("chat.rag_retrieved", { chunk_count: chunks.length, latency_ms: Date.now() - t0 });

  if (chunks.length === 0) {
    log("chat.rag_fallback", { lang });
    return new Response(JSON.stringify({ reply: FALLBACK_MESSAGES[lang] }), {
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "Content-Type": "application/json",
      },
    });
  }

  const messages = buildRagPrompt({
    identityPrompt: IDENTITY_PROMPT,
    chunks,
    language: lang,
    history,
    message,
  });

  const tGen = Date.now();
  const gen = await generateReply({
    endpoint: env.OPENCODE_GO_ENDPOINT,
    apiKey: env.OPENCODE_GO_API_KEY,
    model: env.GENERATION_MODEL,
    messages,
  });
  log("chat.ai_done", {
    latency_ms: Date.now() - tGen,
    reply_length: gen.status === 200 ? gen.content.length : 0,
  });

  if (gen.status === 429) return rateLimitedResponse(origin);
  if (gen.status === 500) return modelErrorResponse(origin);

  const response: AskResponse = { reply: gen.content.trim() };
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
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
      return new Response(
        JSON.stringify({ error: "Method not allowed", code: "INVALID_REQUEST" }),
        {
          status: 405,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Validate origin
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      log("request.origin_blocked", { origin });
      return new Response(
        JSON.stringify({ error: "Origin not allowed", code: "INVALID_REQUEST" }),
        {
          status: 403,
          headers: {
            ...corsHeaders(origin),
            "Content-Type": "application/json",
          },
        },
      );
    }

    try {
      const body = (await request.json()) as AskRequest;

      // Validate request body
      if (!body || typeof body.message !== "string" || body.message.trim().length === 0) {
        log("request.invalid", { reason: "missing_message" });
        return new Response(
          JSON.stringify({
            error: "Message is required and must be a non-empty string",
            code: "INVALID_REQUEST",
          }),
          {
            status: 400,
            headers: {
              ...corsHeaders(origin),
              "Content-Type": "application/json",
            },
          },
        );
      }

      const message = body.message.trim();

      // RAG path (gated): detectLanguage -> retrieve chunks -> generate via
      // OpenCode Go. Legacy path below stays untouched (rollback path).
      if (env.RAG_ENABLED === "true") {
        return await handleRag(message, body.history, env, origin);
      }

      // Legacy: static KB grounding + Workers AI llama generation.
      const messages = buildMessages(message, body.history);

      log("chat.start", {
        msg_preview: message.slice(0, 80),
        history_turns: body.history?.length ?? 0,
      });

      const t0 = Date.now();
      const result = (await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages,
        max_tokens: 512,
        temperature: 0.3,
      })) as { response: string };

      log("chat.ai_done", {
        latency_ms: Date.now() - t0,
        reply_length: result.response.length,
      });

      const response: AskResponse = {
        reply: result.response.trim(),
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
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
