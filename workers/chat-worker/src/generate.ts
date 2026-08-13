/**
 * OpenCode Go generation client (design D8/D9).
 *
 * Calls the OpenAI-compatible endpoint with the DeepSeek V4 Flash model and
 * the API key stored as a Worker secret (never in the repo). Explicit
 * mapping: HTTP 429 -> RATE_LIMITED; 401/403/5xx/network/timeout -> MODEL_ERROR.
 */

import type { ChatMessage } from "./rag";

export type GenerateResult =
  | { status: 200; content: string }
  | { status: 429; code: "RATE_LIMITED" }
  | { status: 500; code: "MODEL_ERROR" };

export interface GenerateOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export async function generateReply(options: GenerateOptions): Promise<GenerateResult> {
  const {
    endpoint,
    apiKey,
    model,
    messages,
    maxTokens = 512,
    temperature = 0.3,
    timeoutMs = 30_000,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      return { status: 429, code: "RATE_LIMITED" };
    }
    if (!response.ok) {
      return { status: 500, code: "MODEL_ERROR" };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return { status: 500, code: "MODEL_ERROR" };
    }
    return { status: 200, content };
  } catch {
    // Network failure, timeout (AbortError), or malformed response.
    return { status: 500, code: "MODEL_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}
