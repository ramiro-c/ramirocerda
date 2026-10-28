/**
 * Adaptive retrieval loop (adaptive RAG step 3).
 *
 * Search, judge sufficiency with a score rule, and when the chunks are not
 * enough reformulate the query and search once more. Chunks are merged by id
 * keeping the best score. The loop is bounded by MAX_RETRIEVAL_ITERATIONS,
 * which is itself clamped to 2: a message never triggers more than 2 searches.
 */

import type { AdaptiveConfig } from "./config";
import { reformulateQuery } from "./query";
import { MAX_CHUNKS, retrieveChunks, type RetrievedChunk } from "./rag";
import type { SmallLlmBinding } from "./small-llm";

type RetrievalEnv = Parameters<typeof retrieveChunks>[1] & SmallLlmBinding;

export interface SufficiencyRule {
  sufficiencyMinTopScore: number;
  sufficiencyMinChunks: number;
}

/**
 * Enough context when at least one chunk passed the similarity gate AND either
 * the best one is strong (top score >= min top score) or several passed
 * (count >= min chunks). One weak chunk alone triggers a re-search.
 */
export function isSufficient(chunks: RetrievedChunk[], rule: SufficiencyRule): boolean {
  if (chunks.length === 0) return false;
  const top = chunks.reduce((max, c) => Math.max(max, c.score), 0);
  return top >= rule.sufficiencyMinTopScore || chunks.length >= rule.sufficiencyMinChunks;
}

/** Dedupe by id keeping the best score, sorted by score desc, capped. */
export function mergeChunks(a: RetrievedChunk[], b: RetrievedChunk[], cap: number = MAX_CHUNKS): RetrievedChunk[] {
  const byId = new Map<string, RetrievedChunk>();
  for (const chunk of [...a, ...b]) {
    const prev = byId.get(chunk.id);
    if (!prev || chunk.score > prev.score) byId.set(chunk.id, chunk);
  }
  return [...byId.values()].sort((x, y) => y.score - x.score).slice(0, cap);
}

export interface IterationLog {
  iteration: number;
  query: string;
  chunkCount: number;
  topScore: number;
  sufficient: boolean;
}

export interface AdaptiveRetrieval {
  chunks: RetrievedChunk[];
  iterations: number;
  queries: string[];
  log: IterationLog[];
}

function topOf(chunks: RetrievedChunk[]): number {
  return chunks.reduce((max, c) => Math.max(max, c.score), 0);
}

export async function retrieveAdaptive(
  initialQuery: string,
  env: RetrievalEnv,
  config: Pick<AdaptiveConfig, "maxRetrievalIterations" | "rewriteModel" | "rewriteTimeoutMs"> & SufficiencyRule,
): Promise<AdaptiveRetrieval> {
  const cap = Math.max(1, Math.min(config.maxRetrievalIterations, 2));
  const queries: string[] = [];
  const log: IterationLog[] = [];
  let merged: RetrievedChunk[] = [];
  let query = initialQuery;

  for (let iteration = 1; iteration <= cap; iteration++) {
    queries.push(query);
    let found: RetrievedChunk[];
    if (iteration === 1) {
      // First search errors propagate (same as the linear pipeline: MODEL_ERROR).
      found = await retrieveChunks(query, env);
    } else {
      try {
        found = await retrieveChunks(query, env);
      } catch {
        // A failed re-search keeps whatever the first search found.
        break;
      }
    }
    merged = mergeChunks(merged, found);
    const sufficient = isSufficient(merged, config);
    log.push({ iteration, query, chunkCount: merged.length, topScore: topOf(merged), sufficient });
    if (sufficient || iteration >= cap) break;

    const next = await reformulateQuery(query, env, config);
    if (!next || queries.some((q) => q.trim().toLowerCase() === next.trim().toLowerCase())) break;
    query = next;
  }

  return { chunks: merged, iterations: queries.length, queries, log };
}
