/**
 * In-memory Vectorize stand-in for the eval runner (--local-index, real mode
 * only). It loads the same chunk list `populate-index.mjs` indexes, embeds it
 * with Workers AI (the same model and batch size populate uses), and answers
 * `query` with plain cosine scoring — mimicking a Vectorize index created with
 * `--metric=cosine`. This lets retrieval changes be measured against the local
 * chunks BEFORE they are upserted to the live index.
 *
 * Vectors are cached in a JSON file keyed by chunk id; ids are content-addressed
 * (sha1 of the text), so a cached id never needs re-embedding. The default
 * cache lives in evals/results/, which is gitignored.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PipelineEnv } from "../src/pipeline";
// @ts-expect-error plain ESM script without types
import { EMBED_BATCH_SIZE, EMBEDDING_MODEL, loadKBChunks, vectorMetadata } from "../scripts/populate-index.mjs";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_FILE = path.join(EVAL_DIR, "results", ".embed-cache.json");

/** Chunk shape as produced by loadKBChunks (untyped .mjs, mirrored here). */
interface KBChunk {
  id: string;
  text: string;
  section: string;
  idx: number;
  source: string;
  url?: string;
  urlAlt?: string;
}

/** Cosine similarity; 0 when either vector is all zeros. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface LocalIndex {
  query: (
    vector: number[],
    options: { topK: number; returnMetadata?: string },
  ) => Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> }>;
}

/**
 * Score every entry by cosine, sort by score descending (ties broken by id
 * ascending, for determinism) and return the first topK — the query side of a
 * Vectorize index with `--metric=cosine`.
 */
export function localVectorize(
  entries: Array<{ id: string; values: number[]; metadata: Record<string, unknown> }>,
): LocalIndex {
  return {
    query: async (vector, options) => {
      const scored = entries
        .map((e) => ({ id: e.id, score: cosine(vector, e.values), metadata: e.metadata }))
        .toSorted((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, options.topK);
      const none = (options.returnMetadata ?? "all") === "none";
      const matches = scored.map(({ id, score, metadata }) => (none ? { id, score } : { id, score, metadata }));
      return { matches };
    },
  };
}

/** JSON file mapping content-addressed chunk id to its embedding vector. */
type EmbeddingCache = Record<string, number[]>;

function readCache(cacheFile: string): EmbeddingCache {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return {};
    throw err;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: EmbeddingCache = {};
  for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number")) out[id] = v;
  }
  return out;
}

export interface BuiltLocalIndex extends LocalIndex {
  chunkCount: number;
  /** How many chunks were newly embedded this build (0 on a warm cache). */
  embedded: number;
}

/**
 * Build the local index over the chunks populate-index.mjs would index
 * (`loadKBChunks(rootDir)`, so a built dist/ is needed when a site source is
 * configured). Embeds only the ids missing from the cache file and writes the
 * cache back when it grew.
 */
export async function buildLocalIndex(opts: {
  rootDir: string;
  ai: PipelineEnv["AI"];
  /** Defaults to evals/results/.embed-cache.json (gitignored). */
  cacheFile?: string;
}): Promise<BuiltLocalIndex> {
  const cacheFile = opts.cacheFile ?? DEFAULT_CACHE_FILE;
  const chunks = (await loadKBChunks(opts.rootDir)) as KBChunk[];
  const cache = readCache(cacheFile);

  const missing = chunks.filter((c) => !(c.id in cache));
  const newly: EmbeddingCache = {};
  for (let i = 0; i < missing.length; i += EMBED_BATCH_SIZE) {
    const batch = missing.slice(i, i + EMBED_BATCH_SIZE);
    const res = await opts.ai.run(EMBEDDING_MODEL, { text: batch.map((c) => c.text) });
    // Same response shape embedTexts reads in populate-index.mjs.
    const data = (Array.isArray(res.data) ? res.data : []) as Array<number[] | { embedding?: number[] }>;
    if (data.length !== batch.length) {
      throw new Error(`Embedding response incomplete (${data.length} of ${batch.length})`);
    }
    batch.forEach((c, j) => {
      const entry = data[j];
      const values = Array.isArray(entry) ? entry : entry?.embedding;
      if (!Array.isArray(values) || values.length === 0) throw new Error("Embedding response missing vector data");
      newly[c.id] = values;
    });
  }
  const embedded = Object.keys(newly).length;

  if (embedded > 0) {
    mkdirSync(path.dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify({ ...cache, ...newly }));
  }

  const byId: EmbeddingCache = { ...cache, ...newly };
  const entries = chunks.map((c) => ({ id: c.id, values: byId[c.id], metadata: vectorMetadata(c) }));
  return { ...localVectorize(entries), chunkCount: chunks.length, embedded };
}
