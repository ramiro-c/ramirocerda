/**
 * Frozen copy of the LINEAR pipeline as it was on main before adaptive RAG
 * (commit 7fde74c, src/index.ts handleRag + src/rag.ts retrieveChunks):
 * embed the last message -> Vectorize topK -> similarity gate -> cap 4 ->
 * NO_INFO_REPLY when empty, otherwise one generation call.
 *
 * Retrieval is copied here on purpose so later changes to src/rag.ts cannot
 * silently change the baseline. Prompt assembly and the generation client are
 * shared with the worker (they did not change in the adaptive PR).
 */

import { generateReply, type GenerateResult } from "../src/generate";
import { detectLanguage, type Language } from "../src/language";
import { DEFAULT_SITE_ORIGIN, type PipelineEnv } from "../src/pipeline";
import { IDENTITY_PROMPT, NO_INFO_REPLY } from "../src/prompts";
import { buildRagPrompt, type RetrievedChunk } from "../src/rag";

const LINEAR_MAX_CHUNKS = 4;

async function linearRetrieve(question: string, env: PipelineEnv): Promise<RetrievedChunk[]> {
  const parsedThreshold = Number.parseFloat(env.SIMILARITY_THRESHOLD);
  const threshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 0.3;
  const result = (await env.AI.run(env.EMBEDDING_MODEL, { text: [question] })) as { data?: unknown };
  const data = Array.isArray(result.data) ? result.data : [];
  const first = data[0];
  const vector = Array.isArray(first)
    ? (first as number[])
    : ((first as { embedding?: number[] } | undefined)?.embedding ?? null);
  if (!vector || vector.length === 0) throw new Error("Embedding response missing vector data");
  const parsedTopK = Number.parseInt(env.TOP_K ?? "5", 10);
  const topK = Number.isFinite(parsedTopK) && parsedTopK > 0 ? parsedTopK : 5;
  const { matches } = await env.VECTORIZE.query(vector, { topK, returnMetadata: "all" });
  return (matches ?? [])
    .filter((m) => m.score >= threshold)
    .slice(0, LINEAR_MAX_CHUNKS)
    .map((m) => ({ id: m.id, score: m.score, metadata: m.metadata }));
}

export interface LinearOutcome {
  lang: Language;
  chunks: RetrievedChunk[];
  outcome: { kind: "no_info"; reply: string } | { kind: "generated"; result: GenerateResult };
}

export async function runLinearPipeline(opts: {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }> | undefined;
  env: PipelineEnv;
  sessionId: string;
}): Promise<LinearOutcome> {
  const { message, history, env, sessionId } = opts;
  const lang = detectLanguage(message);
  const chunks = await linearRetrieve(message, env);
  if (chunks.length === 0) {
    return { lang, chunks, outcome: { kind: "no_info", reply: NO_INFO_REPLY[lang] } };
  }
  const messages = buildRagPrompt({
    identityPrompt: IDENTITY_PROMPT,
    chunks,
    language: lang,
    history,
    message,
    siteOrigin: env.SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN,
  });
  const result = await generateReply({
    endpoint: env.OPENCODE_GO_ENDPOINT,
    apiKey: env.OPENCODE_GO_API_KEY,
    model: env.GENERATION_MODEL,
    messages,
    sessionId,
  });
  return { lang, chunks, outcome: { kind: "generated", result } };
}
