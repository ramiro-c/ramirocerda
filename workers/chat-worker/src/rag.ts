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

/**
 * Cross-encoder used when `RAG_RERANK_MODEL` is set: the dense rank stays the
 * round-1 vote and this model re-orders its candidates as round 2 (see
 * `rerankOrder`). Empty/absent keeps the single-stage dense path.
 */
export const DEFAULT_RAG_RERANK_MODEL = "@cf/baai/bge-reranker-base";

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
    run: (
      model: string,
      input: unknown,
    ) => Promise<{ data?: unknown; shape?: unknown; response?: unknown }>;
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
  /** Set to enable the two-stage retrieval: wide dense fetch + cross-encoder rerank. */
  RAG_RERANK_MODEL?: string;
  RAG_RERANK_CANDIDATES?: string;
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

export async function queryIndex(vector: number[], env: RagEnv, topKOverride?: number): Promise<VectorizeMatch[]> {
  const parsed = Number.parseInt(env.TOP_K ?? "5", 10);
  const fallback = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  const topK = topKOverride ?? fallback;
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
  const rerankModel = (env.RAG_RERANK_MODEL ?? "").trim() || null;
  if (!rerankModel) {
    const matches = await queryIndex(vector, env);
    return filterChunks(matches, threshold, MAX_CHUNKS);
  }
  // Two-stage retrieval: the dense rank stays the round-1 vote and the
  // cross-encoder is the round-2 judge. The dense threshold is not a per-chunk
  // filter here: "¿Qué estudió Ramiro?" scores kb-educacion at 0.285 (below the
  // 0.30 gate) yet the reranker ranks it first of 20, so a pre-gate would drop
  // the one chunk we added this knob for. The gate keeps only its no-info
  // meaning: when NO candidate is above the threshold the question is outside
  // the knowledge base and the bot still owes the visitor a "no-info" reply.
  const parsedCandidates = Number.parseInt(env.RAG_RERANK_CANDIDATES ?? "20", 10);
  const candidates = Number.isFinite(parsedCandidates) && parsedCandidates > 0 ? parsedCandidates : 20;
  const matches = await queryIndex(vector, env, candidates);
  if (Math.max(...matches.map((m) => m.score), 0) < threshold) return [];
  const ordered = await rerankOrder(question, matches, rerankModel, env);
  return ordered.slice(0, MAX_CHUNKS).map((match) => ({ id: match.id, score: match.score, metadata: match.metadata }));
}

/**
 * Reorder the dense candidates with the bge-reranker cross-encoder
 * (`@cf/baai/bge-reranker-base`, measured in the 2026-10-29 probe: identical
 * scores across two runs; the expected chunk jumped 15 -> 5 for
 * "¿Qué estudió Ramiro?" and 18 -> 2 for "What stack did he use for that one?").
 * Any failure — network error, invalid envelope, wrong ids — fails OPEN: the
 * dense order is kept, because a slower correct answer outranks no answer.
 */
async function rerankOrder(
  question: string,
  candidates: VectorizeMatch[],
  model: string,
  env: RagEnv,
): Promise<VectorizeMatch[]> {
  if (candidates.length <= 1) return candidates;
  try {
    const result = await env.AI.run(model, {
      query: question,
      contexts: candidates.map((candidate) => ({ text: candidate.metadata?.text ?? "" })),
      top_k: candidates.length,
    });
    const entries = Array.isArray((result as { response?: unknown }).response)
      ? ((result as { response: unknown[] }).response)
      : [];
    if (entries.length !== candidates.length) throw new Error("reranker response size mismatch");
    const scores = new Array<number | undefined>(candidates.length).fill(undefined);
    for (const entry of entries) {
      const { id, score } = entry as { id?: unknown; score?: unknown };
      if (
        typeof id !== "number" ||
        !Number.isInteger(id) ||
        (id as number) < 0 ||
        (id as number) >= candidates.length ||
        typeof score !== "number" ||
        !Number.isFinite(score)
      ) {
        throw new Error("reranker response entry mismatch");
      }
      scores[id as number] = score as number;
    }
    // The scores are model-specific logits, useful only for their ORDER; the
    // chunks keep their dense score on the wire.
    return candidates
      .map((candidate, index) => ({ candidate, rerank: scores[index] as number }))
      .sort((a, b) => b.rerank - a.rerank)
      .map(({ candidate }) => candidate);
  } catch (error) {
    // A silent fail-open hides a dead reranker behind dense order; the event
    // carries the failure reason only, never visitor text.
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        event: "chat.rerank_fallback",
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    return candidates;
  }
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
