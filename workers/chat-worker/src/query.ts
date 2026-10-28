/**
 * Search-query shaping (adaptive RAG steps 2 and 3).
 *
 * - rewriteQuery: turns a history-dependent follow-up ("¿y antes de eso?") into a
 *   standalone search query. Skipped when there is no history; falls back to
 *   the raw message on any error, timeout or suspicious output.
 * - reformulateQuery: when retrieval came back insufficient, proposes ONE
 *   alternative wording for a second search. Returns null when it cannot, so
 *   the caller stops instead of re-running the same search.
 */

import type { AdaptiveConfig } from "./config";
import type { HistoryTurn } from "./router";
import { runSmallModel, type SmallLlmBinding } from "./small-llm";

const REWRITE_HISTORY_TURNS = 4;
const REWRITE_TURN_CHARS = 400;
const QUERY_MAX_TOKENS = 64;
const MIN_QUERY_CHARS = 3;
const MAX_QUERY_CHARS = 300;

export const REWRITE_SYSTEM_PROMPT = `You rewrite the visitor's latest message into ONE standalone search query for a knowledge base about Ramiro Cerdá (software engineer): his experience, projects, skills, education and the notes he wrote. Resolve pronouns and references ("he", "that", "y antes?", "eso") using the conversation. Keep the visitor's language. Do not answer the question. Output only the query, nothing else.`;

export const REFORMULATE_SYSTEM_PROMPT = `A search in a knowledge base about Ramiro Cerdá (software engineer) found no good matches for the query below. Write ONE alternative search query in Spanish (the knowledge base language) with different wording: synonyms, the broader topic, or the concrete section it would live in (experiencia, proyectos, stack técnico, educación, certificaciones, notas). Output only the query, nothing else.`;

/** First non-empty line, without quotes or a "Query:" style prefix; null if unusable. */
export function sanitizeQuery(raw: string | null): string | null {
  if (!raw) return null;
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  const cleaned = line
    .replace(/^(standalone\s+)?(search\s+)?(query|consulta|b[uú]squeda)\s*:\s*/i, "")
    .replace(/^["'`«“]+|["'`»”]+$/g, "")
    .trim();
  if (cleaned.length < MIN_QUERY_CHARS || cleaned.length > MAX_QUERY_CHARS) return null;
  return cleaned;
}

export interface RewriteResult {
  query: string;
  rewritten: boolean;
}

export async function rewriteQuery(
  message: string,
  history: HistoryTurn[] | undefined,
  env: SmallLlmBinding,
  config: Pick<AdaptiveConfig, "rewriteModel" | "rewriteTimeoutMs">,
): Promise<RewriteResult> {
  if (!history || history.length === 0) return { query: message, rewritten: false };

  const context = history
    .slice(-REWRITE_HISTORY_TURNS)
    .map((turn) => `${turn.role}: ${turn.content.slice(0, REWRITE_TURN_CHARS)}`)
    .join("\n");
  const raw = await runSmallModel(env, {
    model: config.rewriteModel,
    messages: [
      { role: "system", content: REWRITE_SYSTEM_PROMPT },
      { role: "user", content: `Conversation:\n${context}\n\nLatest message: ${message}` },
    ],
    maxTokens: QUERY_MAX_TOKENS,
    timeoutMs: config.rewriteTimeoutMs,
  });
  const query = sanitizeQuery(raw);
  return query ? { query, rewritten: query !== message } : { query: message, rewritten: false };
}

export async function reformulateQuery(
  query: string,
  env: SmallLlmBinding,
  config: Pick<AdaptiveConfig, "rewriteModel" | "rewriteTimeoutMs">,
): Promise<string | null> {
  const raw = await runSmallModel(env, {
    model: config.rewriteModel,
    messages: [
      { role: "system", content: REFORMULATE_SYSTEM_PROMPT },
      { role: "user", content: `Query: ${query}` },
    ],
    maxTokens: QUERY_MAX_TOKENS,
    timeoutMs: config.rewriteTimeoutMs,
  });
  return sanitizeQuery(raw);
}
