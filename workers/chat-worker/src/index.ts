import { KNOWLEDGE_BASE } from "./knowledge-base";

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

const SYSTEM_PROMPT = `Sos Botardo, el asistente virtual de la web personal de Ramiro Cerdá. Tu trabajo es responder preguntas sobre el perfil profesional de Ramiro de forma clara y con buena onda.

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
5. Sé conciso: máximo 3-4 párrafos. Tono cercano y profesional, sin ser acartonado.

=== KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}
=== FIN KNOWLEDGE BASE ===

IDIOMA (obligatorio, leé esto al final):
Detectá el idioma del último mensaje del usuario y respondé SOLO en ese idioma.
- Si el mensaje está en inglés → toda tu respuesta en inglés (claro, profesional). Ramiro en tercera persona.
- Si el mensaje está en español → español rioplatense (voseo), tono cercano.
La knowledge base está en español; usala como fuente de hechos, pero NO copies su idioma si el usuario escribió en inglés. No mezcles idiomas.`;

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface Env {
  AI: {
    run: (
      model: string,
      input: { messages: Message[]; max_tokens?: number; temperature?: number },
    ) => Promise<{ response: string }>;
  };
}

function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ramirocerda.vercel.app";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function buildMessages(message: string, history?: AskRequest["history"]): Message[] {
  const messages: Message[] = [{ role: "system", content: SYSTEM_PROMPT }];

  if (history && history.length > 0) {
    const recentHistory = history.slice(-10);
    for (const entry of recentHistory) {
      messages.push({ role: entry.role, content: entry.content });
    }
  }

  messages.push({ role: "user", content: message });
  return messages;
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
      log("request.invalid", { reason: "method_not_allowed", method: request.method });
      return new Response(JSON.stringify({ error: "Method not allowed", code: "INVALID_REQUEST" }), {
        status: 405,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    // Validate origin
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      log("request.origin_blocked", { origin });
      return new Response(JSON.stringify({ error: "Origin not allowed", code: "INVALID_REQUEST" }), {
        status: 403,
        headers: {
          ...corsHeaders(origin),
          "Content-Type": "application/json",
        },
      });
    }

    try {
      const body = (await request.json()) as AskRequest;

      // Validate request body
      if (!body || typeof body.message !== "string" || body.message.trim().length === 0) {
        log("request.invalid", { reason: "missing_message" });
        return new Response(
          JSON.stringify({ error: "Message is required and must be a non-empty string", code: "INVALID_REQUEST" }),
          {
            status: 400,
            headers: {
              ...corsHeaders(origin),
              "Content-Type": "application/json",
            },
          },
        );
      }

      // Build messages with KB grounding and conversation history
      const messages = buildMessages(body.message.trim(), body.history);

      log("chat.start", {
        msg_preview: body.message.trim().slice(0, 80),
        history_turns: body.history?.length ?? 0,
      });

      // Call Workers AI with chat messages format
      const t0 = Date.now();
        const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages,
        max_tokens: 512,
        temperature: 0.3,
      });

      log("chat.ai_done", { latency_ms: Date.now() - t0, reply_length: result.response.length });

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

      // Generic model error
      log("error.model", { error_message: errorMessage });
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
  },
};
