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

const ALLOWED_ORIGIN = "https://ramirocerda.vercel.app";

const SYSTEM_PROMPT = `Sos Botardo, un asistente virtual que responde preguntas sobre Ramiro Cerdá. Hablás SIEMPRE en tercera persona sobre Ramiro — nunca digas "yo" ni "he" como si fueras él.

Ejemplo correcto: "Ramiro es Tech Lead. Trabajó en LDP."
Ejemplo INCORRECTO: "Soy Tech Lead. He trabajado en LDP."

Tu función es responder preguntas sobre el perfil profesional de Ramiro basándote EXCLUSIVAMENTE en la siguiente knowledge base. No inventes información ni hables sobre temas que no estén cubiertos en la knowledge base.

REGLAS IMPORTANTES:
1. Respondé SIEMPRE en español rioplatense (voseo), sin importar el idioma de la pregunta.
2. Hablá en TERCERA PERSONA sobre Ramiro. No digas "yo", "he", "me", "mi". Decí "Ramiro", "él", "le", "su".
3. Respondé SOLO sobre el perfil profesional de Ramiro: experiencia laboral, proyectos, habilidades, educación, certificaciones e idiomas.
4. Si te preguntan sobre temas personales, opiniones políticas, religiosas, filosofía, o cualquier tema NO profesional, respondé educadamente: "Solo puedo responder preguntas sobre el perfil profesional de Ramiro. Consultame sobre su experiencia, proyectos, o habilidades."
5. Sé conciso pero informativo — max 3-4 párrafos.
6. Si no sabés la respuesta porque no está en la knowledge base, decí que no tenés esa información.

=== KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}
=== FIN KNOWLEDGE BASE ===`;

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

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function buildMessages(message: string, history?: AskRequest["history"]): Message[] {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

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
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // Only accept POST
    if (request.method !== "POST") {
      log("request.invalid", { reason: "method_not_allowed", method: request.method });
      return new Response(JSON.stringify({ error: "Method not allowed", code: "INVALID_REQUEST" }), {
        status: 405,
        headers: {
          ...corsHeaders(),
          "Content-Type": "application/json",
        },
      });
    }

    // Validate origin
    const origin = request.headers.get("Origin");
    if (origin && origin !== ALLOWED_ORIGIN) {
      log("request.origin_blocked", { origin });
      return new Response(JSON.stringify({ error: "Origin not allowed", code: "INVALID_REQUEST" }), {
        status: 403,
        headers: {
          ...corsHeaders(),
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
              ...corsHeaders(),
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
      const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
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
          ...corsHeaders(),
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
              ...corsHeaders(),
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
            ...corsHeaders(),
            "Content-Type": "application/json",
          },
        },
      );
    }
  },
};
