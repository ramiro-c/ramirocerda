/**
 * Minimal OpenRouter client for the control-flow calls (router, sufficiency
 * judge). OpenAI-compatible chat completions, temperature 0, low max_tokens,
 * hard timeout, structured JSON output when the model supports it.
 *
 * It never throws: every failure comes back as `{ ok: false, reason }` so the
 * caller can apply its safe default. Parsing only accepts a JSON object (an
 * optional ```json fence is stripped); shape validation is the caller's job.
 */

import type { OpenRouterConfig } from "./config";
import type { ChatMessage } from "./rag";

export type OpenRouterFailure = "timeout" | "network" | `http_${number}` | "empty" | "invalid_json";

export type OpenRouterResult =
  | { ok: true; value: Record<string, unknown>; usage: { promptTokens: number; completionTokens: number } }
  | { ok: false; reason: OpenRouterFailure };

export interface JsonSchemaSpec {
  name: string;
  schema: Record<string, unknown>;
}

/** Strict JSON object parse; tolerates only surrounding whitespace and a markdown fence. */
export function parseJsonObject(content: string): Record<string, unknown> | null {
  const text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function buildBody(config: OpenRouterConfig, messages: ChatMessage[], spec: JsonSchemaSpec): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: 0,
    max_tokens: config.maxTokens,
  };
  if (config.responseFormat === "json_schema") {
    body.response_format = { type: "json_schema", json_schema: { name: spec.name, strict: true, schema: spec.schema } };
  } else if (config.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (config.responseFormat !== "none") {
    // Only route to provider endpoints that honour response_format.
    body.provider = { require_parameters: true };
  }
  if (config.reasoningEffort) {
    body.reasoning = { effort: config.reasoningEffort, exclude: true };
  }
  return body;
}

export async function callOpenRouterJson(
  config: OpenRouterConfig,
  messages: ChatMessage[],
  spec: JsonSchemaSpec,
  opts: { referer?: string } = {},
): Promise<OpenRouterResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
        ...(opts.referer ? { "HTTP-Referer": opts.referer } : {}),
        "X-Title": "Botardo",
      },
      body: JSON.stringify(buildBody(config, messages, spec)),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: `http_${response.status}` };
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    };
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) return { ok: false, reason: "empty" };
    const value = parseJsonObject(content);
    if (!value) return { ok: false, reason: "invalid_json" };
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
    return {
      ok: true,
      value,
      usage: { promptTokens: num(json.usage?.prompt_tokens), completionTokens: num(json.usage?.completion_tokens) },
    };
  } catch (err) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" };
    return { ok: false, reason: err instanceof SyntaxError ? "invalid_json" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
