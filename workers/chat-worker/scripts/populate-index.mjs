#!/usr/bin/env node
/**
 * populate-index.mjs — KB -> Vectorize index population and sync.
 *
 * Reads the profile knowledge base (scripts/knowledge-base.js), splits it into
 * deterministic heading-boundary chunks, embeds them with bge-m3 via Workers AI,
 * upserts them into the `botardo-kb` Vectorize index, prunes vectors that are no
 * longer part of the KB (manifest-based), and writes vectorize-manifest.json.
 *
 * Run from anywhere (repo root script: `pnpm chat:populate`):
 *
 *   CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> node workers/chat-worker/scripts/populate-index.mjs
 *   # preview without touching the index:
 *   CLOUDFLARE_ACCOUNT_ID=<id> node workers/chat-worker/scripts/populate-index.mjs --dry-run
 *
 * The chunker is a pure function (exported for unit tests). No shell-outs, no git.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { KNOWLEDGE_BASE } from "./knowledge-base.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(SCRIPT_DIR, "..", "vectorize-manifest.json");

// Optional convenience: auto-load a gitignored `.env` from the repo root when no
// CLOUDFLARE_API_TOKEN is already exported. Explicit env vars always win.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  for (const candidate of [
    path.resolve(SCRIPT_DIR, "..", "..", "..", ".env"),
    path.join(process.cwd(), ".env"),
  ]) {
    try {
      process.loadEnvFile(candidate);
      break;
    } catch {
      // missing/unreadable .env is fine — continue with exported env only
    }
  }
}

const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const EMBED_BATCH_SIZE = 16;
const INDEX_NAME = process.env.VECTORIZE_INDEX ?? "botardo-kb";
const SOURCE = "knowledge-base";

/** First 8 hex chars of the sha1 of a string. */
export function sha1Hex(text) {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48); // keep full id within Vectorize's 64-byte id limit
}

/**
 * Split markdown KB text into heading-boundary chunks.
 *
 * - Boundaries at H2/H3/H4 headings (the KB nests roles and projects under
 *   H3/H4 headings); no overlap; whole sections.
 * - A heading whose section has no body of its own (a pure container, e.g.
 *   "## Experiencia Profesional" with only H3 children) is folded as a context
 *   prefix line into the first child chunk so company/group context is kept.
 * - The document H1 title and any text before the first H2 are not chunks.
 * - Content lines are preserved verbatim (R1: content unchanged).
 * - Empty KB (or no headings) yields zero chunks.
 *
 * @param {string} kbText
 * @returns {Array<{ id: string, text: string, section: string, idx: number }>}
 */
export function chunkKB(kbText) {
  const headingRe = /^(#{2,4})\s+(.+?)\s*$/;
  const raw = [];
  let current = null;

  for (const line of kbText.split("\n")) {
    const m = line.match(headingRe);
    if (m) {
      if (current) raw.push(current);
      current = { level: m[1].length, headingLine: line, heading: m[2].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
    // Lines before the first H2+ heading (H1 title, blanks) are dropped.
  }
  if (current) raw.push(current);

  const chunks = [];
  let pendingParents = [];
  for (const c of raw) {
    // A heading whose section has no body (pure container, e.g. "## Experiencia
    // Profesional" holding only H3 children) becomes a context prefix line for
    // the first child chunk instead of an empty chunk of its own.
    const hasBody = c.body.some((line) => line.trim() !== "");
    if (!hasBody) {
      pendingParents.push(c.headingLine);
      continue;
    }
    const ownText = [c.headingLine, ...c.body].join("\n").trimEnd();
    const lines = [...pendingParents, ownText];
    pendingParents = [];
    const text = lines.join("\n").trimEnd();
    chunks.push({ heading: c.heading, text });
  }

  return chunks.map((c, idx) => ({
    id: `kb-${slugify(c.heading)}-${sha1Hex(c.text).slice(0, 8)}`,
    text: c.text,
    section: c.heading,
    idx,
  }));
}

function cloudflareFetch(pathname, { accountId, apiToken, body }) {
  return fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function embedTexts(texts, { accountId, apiToken }) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const res = await cloudflareFetch(`/ai/run/${EMBEDDING_MODEL}`, { accountId, apiToken, body: { text: batch } });
    if (!res.ok) throw new Error(`Embedding request failed (${res.status}): ${await res.text()}`);
    const json = await res.json();
    if (!json.success) throw new Error(`Embedding error: ${JSON.stringify(json.errors ?? json)}`);
    const data = json.result?.data ?? [];
    for (const entry of data) {
      const values = Array.isArray(entry) ? entry : entry?.embedding;
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error("Embedding response missing vector data");
      }
      vectors.push(values);
    }
  }
  return vectors;
}

async function upsertVectors(vectors, { accountId, apiToken }) {
  const res = await cloudflareFetch(`/vectorize/v2/indexes/${INDEX_NAME}/upsert`, {
    accountId,
    apiToken,
    body: { vectors },
  });
  if (!res.ok) throw new Error(`Upsert failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (!json.success) throw new Error(`Upsert error: ${JSON.stringify(json.errors ?? json)}`);
  return json.result;
}

async function deleteByIds(ids, { accountId, apiToken }) {
  if (ids.length === 0) return { count: 0 };
  const res = await cloudflareFetch(`/vectorize/v2/indexes/${INDEX_NAME}/delete_by_ids`, {
    accountId,
    apiToken,
    body: { ids },
  });
  if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  if (!json.success) throw new Error(`Delete error: ${JSON.stringify(json.errors ?? json)}`);
  return json.result;
}

async function readManifestIds() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(raw);
    return Array.isArray(manifest.ids) ? manifest.ids : [];
  } catch (err) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run") };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId) {
    console.error("CLOUDFLARE_ACCOUNT_ID is required (set it in the environment).");
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !apiToken) {
    console.error(
      "CLOUDFLARE_API_TOKEN is required unless running with --dry-run (preview only, no network).",
    );
    process.exitCode = 1;
    return;
  }

  const chunks = chunkKB(KNOWLEDGE_BASE);
  if (chunks.length === 0) {
    console.log(`Knowledge base is empty — no chunks to index (index '${INDEX_NAME}' left unchanged).`);
    return;
  }

  console.log(`Chunking KB -> ${chunks.length} chunks (index '${INDEX_NAME}')`);
  if (dryRun) {
    for (const c of chunks) {
      console.log(`  ${c.id}  [${c.section}]  ${c.text.length} chars`);
    }
    console.log("Dry run complete — nothing was written or sent.");
    return;
  }

  // Embed every chunk text (content-addressed ids make this idempotent).
  const values = await embedTexts(
    chunks.map((c) => c.text),
    { accountId, apiToken },
  );

  const vectors = chunks.map((c, i) => ({
    id: c.id,
    values: values[i],
    metadata: { section: c.section, source: SOURCE, idx: c.idx, text: c.text },
  }));

  const previousIds = await readManifestIds();
  const currentIds = new Set(vectors.map((v) => v.id));
  const staleIds = previousIds.filter((id) => !currentIds.has(id));

  const upsertResult = await upsertVectors(vectors, { accountId, apiToken });
  const deleteResult = await deleteByIds(staleIds, { accountId, apiToken });

  // Persist the committed chunk-ID manifest used for future prune.
  await writeFile(
    MANIFEST_PATH,
    `${JSON.stringify(
      {
        index: INDEX_NAME,
        embeddingModel: EMBEDDING_MODEL,
        generatedAt: new Date().toISOString(),
        ids: [...currentIds].sort(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `Upserted ${upsertResult?.count ?? vectors.length} vectors, pruned ${deleteResult?.count ?? staleIds.length} stale. Manifest written: ${MANIFEST_PATH}`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`populate-index failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}
