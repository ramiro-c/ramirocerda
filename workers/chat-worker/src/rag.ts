/**
 * RAG retrieval + prompt assembly for the Botardo chat worker.
 *
 * Pipeline (design D1-D3): embed the question with the configured embedding
 * model -> query Vectorize (topK) -> keep matches above the similarity gate,
 * capped at MAX_CHUNKS -> build the system prompt from identity + retrieved
 * chunks + a firm language instruction, then the last 10 turns of history.
 */

import type { Language } from "./language";

// 6 measured, not guessed: 9 of 28 eval cases missed their expected chunk and,
// with the ranking unchanged, widening the window recovers three of them
// (kb-es-factory-note at rank 5, hi-es-contacto-proyecto at rank 6, and room
// for the max-4 merge of two searches). A top-8 would recover nothing more, so
// the extra chunks would be pure prompt weight. The cost is ~300-500 tokens of
// generation context per search (chunk median is ~540 chars).
export const MAX_CHUNKS = 6;
export const HISTORY_TURNS = 10;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RetrievedChunk {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface RagBindings {
  AI: {
    run: (model: string, input: unknown) => Promise<{ data?: unknown; shape?: unknown }>;
  };
  VECTORIZE: {
    query: (
      vector: number[],
      options: { topK: number; returnMetadata?: string },
    ) => Promise<{ matches: VectorizeMatch[] }>;
  };
  EMBEDDING_MODEL: string;
  TOP_K: string;
  SIMILARITY_THRESHOLD: string;
}

type RagEnv = RagBindings;

function defaultThreshold(raw: string): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0.3;
}

/** Extract the first embedding from a Workers AI embedding result. */
export function extractEmbedding(result: { data?: unknown; shape?: unknown }): number[] {
  const data = Array.isArray(result.data) ? result.data : [];
  const first = data[0];
  if (Array.isArray(first) && first.length > 0) return first as number[];
  if (first && typeof first === "object" && Array.isArray((first as { embedding?: unknown }).embedding)) {
    return (first as { embedding: number[] }).embedding;
  }
  throw new Error("Embedding response missing vector data");
}

export async function embedQuestion(question: string, env: RagEnv): Promise<number[]> {
  const result = await env.AI.run(env.EMBEDDING_MODEL, { text: [question] });
  return extractEmbedding(result);
}

export async function queryIndex(vector: number[], env: RagEnv): Promise<VectorizeMatch[]> {
  const parsed = Number.parseInt(env.TOP_K ?? "5", 10);
  const topK = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  const result = await env.VECTORIZE.query(vector, { topK, returnMetadata: "all" });
  return result.matches ?? [];
}

/**
 * Keep only matches at or above the similarity gate, capped at MAX_CHUNKS
 * (design D3: query topK=5, gate by threshold, inject max 4).
 */
export function filterChunks(matches: VectorizeMatch[], threshold: number, cap: number = MAX_CHUNKS): RetrievedChunk[] {
  return matches
    .filter((match) => match.score >= threshold)
    .slice(0, cap)
    .map((match) => ({ id: match.id, score: match.score, metadata: match.metadata }));
}

export async function retrieveChunks(question: string, env: RagEnv): Promise<RetrievedChunk[]> {
  const threshold = defaultThreshold(env.SIMILARITY_THRESHOLD);
  const vector = await embedQuestion(question, env);
  const matches = await queryIndex(vector, env);
  return filterChunks(matches, threshold, MAX_CHUNKS);
}

const LANG_INSTRUCTIONS: Record<Language, string> = {
  es: "IDIOMA OBLIGATORIO (regla firme, no opcional): respondé SOLO en español rioplatense, con voseo y tono cercano. No mezcles idiomas.",
  en: "MANDATORY LANGUAGE RULE (firm, not optional): reply ONLY in English, clear and professional. Refer to Ramiro in third person. Do not mix languages.",
};

/**
 * Assemble the messages array for generation:
 * system = identity prompt + retrieved chunks (the only factual context) +
 * firm language instruction; then the last HISTORY_TURNS turns of history;
 * then the visitor's message (design R2/R3/R4/R6).
 */
/**
 * Renders one retrieved chunk as a labeled block. Note chunks carry their
 * published route, so Botardo can send the visitor to the full note instead of
 * lecturing the knowledge base; curated KB chunks render exactly as before.
 * With a `siteOrigin` the route is rendered as an absolute URL, which is what
 * the widget auto-links; without one it stays a path.
 */
function chunkHeader(chunk: RetrievedChunk, index: number, siteOrigin?: string): string {
  const parts = [`[Chunk ${index + 1} — sección: ${chunk.metadata?.section ?? "knowledge-base"}`];
  const url = typeof chunk.metadata?.url === "string" ? chunk.metadata.url : undefined;
  const urlAlt = typeof chunk.metadata?.urlAlt === "string" ? chunk.metadata.urlAlt : undefined;
  const absolute = (route: string) => (siteOrigin ? `${siteOrigin}${route}` : route);
  if (url) parts.push(`nota: ${absolute(url)}`);
  if (urlAlt) parts.push(`nota (en): ${absolute(urlAlt)}`);
  return `${parts.join(" — ")}]`;
}

export function buildRagPrompt(opts: {
  identityPrompt: string;
  chunks: RetrievedChunk[];
  language: Language;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  message: string;
  siteOrigin?: string;
}): ChatMessage[] {
  const { identityPrompt, chunks, language, history = [], message, siteOrigin } = opts;

  const contextText =
    chunks.length === 0
      ? "(sin contexto recuperado)"
      : chunks
          .map((chunk, i) => `${chunkHeader(chunk, i, siteOrigin)}\n${chunk.metadata?.text ?? ""}`)
          .join("\n\n");

  const systemContent = [
    identityPrompt,
    "",
    "=== CONTEXTO RECUPERADO (única fuente de hechos sobre Ramiro) ===",
    contextText,
    "=== FIN CONTEXTO ===",
    "",
    "REGLAS FIRMES DE CONTEXTO: basate EXCLUSIVAMENTE en el CONTEXTO RECUPERADO. No inventes datos ni uses conocimiento externo sobre Ramiro. Si la respuesta no está en el contexto, decilo con naturalidad.",
    LANG_INSTRUCTIONS[language],
  ].join("\n");

  const messages: ChatMessage[] = [{ role: "system", content: systemContent }];
  for (const entry of history.slice(-HISTORY_TURNS)) {
    messages.push({ role: entry.role, content: entry.content });
  }
  messages.push({ role: "user", content: message });
  return messages;
}
