#!/usr/bin/env node
/**
 * populate-index.mjs — KB sources -> Vectorize index population and sync.
 *
 * Reads the sources declared in kb-sources.json (curated profile KB + markdown
 * notes under src/content/**), splits each source into deterministic
 * heading-boundary chunks, embeds them with bge-m3 via Workers AI, upserts
 * them into the `botardo-kb` Vectorize index, prunes vectors that are no
 * longer part of any source (manifest-based), and writes vectorize-manifest.json.
 *
 * Run from anywhere (repo root script: `pnpm chat:populate`):
 *
 *   node workers/chat-worker/scripts/populate-index.mjs
 *   # preview without touching the index:
 *   node workers/chat-worker/scripts/populate-index.mjs --dry-run
 *   # assert the committed manifest matches current sources (no network):
 *   node workers/chat-worker/scripts/populate-index.mjs --check
 *
 * The chunker and the manifest diff are pure functions (exported for unit
 * tests). No shell-outs, no git.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(SCRIPT_DIR, "..");
const ROOT_DIR = path.join(WORKER_DIR, "..", "..");
const SOURCES_PATH = path.join(WORKER_DIR, "kb-sources.json");
const MANIFEST_PATH = path.join(WORKER_DIR, "vectorize-manifest.json");

// Optional convenience: auto-load a gitignored `.env` from the repo root when no
// CLOUDFLARE_API_TOKEN is already exported. Explicit env vars always win.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  for (const candidate of [
    path.join(ROOT_DIR, ".env"),
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

/** Split markdown front matter (leading --- block) into a flat key/value map. */
export function stripFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { frontmatter: null, body: md };
  const frontmatter = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = (kv[2] ?? "").trim().replace(/^["'](.*)["']$/, "$1");
  }
  return { frontmatter, body: md.slice(m[0].length) };
}

/**
 * Split markdown KB text into heading-boundary chunks.
 *
 * - Boundaries at H2/H3/H4 headings (the KB nests roles and projects under
 *   H3/H4 headings); no overlap; whole sections.
 * - A heading whose section has no body of its own (a pure container, e.g.
 *   "## Experiencia Profesional" with only H3 children) is folded as a context
 *   prefix line into the first child chunk so company/group context is kept.
 * - The document H1 title and any text before the first H2 are not chunks
 *   (default). With `foldPreamble`, that preamble is folded as a context
 *   prefix into the first heading chunk instead of being dropped — used for
 *   note files so title + intro survive chunking.
 * - Content lines are preserved verbatim.
 * - Empty input (or no headings with foldPreamble=false) yields zero chunks.
 *
 * @param {string} kbText
 * @param {{ idPrefix?: string, foldPreamble?: boolean }} [opts]
 * @returns {Array<{ id: string, text: string, section: string, idx: number }>}
 */
export function chunkKB(kbText, opts = {}) {
  const idPrefix = opts.idPrefix ?? "kb";
  const foldPreamble = opts.foldPreamble ?? false;
  const headingRe = /^(#{2,4})\s+(.+?)\s*$/;
  const raw = [];
  const preambleLines = [];
  let current = null;

  for (const line of kbText.split("\n")) {
    const m = line.match(headingRe);
    if (m) {
      if (current) raw.push(current);
      current = { level: m[1].length, headingLine: line, heading: m[2].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else if (foldPreamble || preambleLines.length > 0) {
      preambleLines.push(line);
    }
    // With foldPreamble=false, lines before the first H2+ heading (H1 title,
    // blanks) are dropped once the first heading is found.
  }
  if (current) raw.push(current);

  const chunks = [];
  let pendingParents = preambleLines.filter((l) => l.trim() !== "");
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

  // Prose-only input with no headings at all: one whole-document chunk so the
  // content is never silently dropped.
  if (chunks.length === 0 && pendingParents.length > 0) {
    const text = pendingParents.join("\n").trimEnd();
    chunks.push({ heading: text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80), text });
  }

  return chunks.map((c, idx) => ({
    id: `${idPrefix}-${slugify(c.heading)}-${sha1Hex(c.text).slice(0, 8)}`,
    text: c.text,
    section: c.heading,
    idx,
  }));
}

/**
 * Chunk one markdown note: strip front matter, rebuild a title header, fold
 * the intro (title + prose before the first heading) into the first section
 * chunk, and prefix every chunk with the note title so retrieval keeps the
 * title keywords in every vector.
 *
 * @param {string} md
 * @returns {Array<{ id: string, text: string, section: string, idx: number }>}
 */
export function chunkNote(md) {
  const { frontmatter, body } = stripFrontmatter(md);
  const title = frontmatter?.title ?? "";
  const description = frontmatter?.description ?? "";
  const headerLines = [];
  if (title) headerLines.push(`# ${title}`);
  if (description) headerLines.push(description);
  const docText = `${[...headerLines, ""].join("\n")}${body.trimStart()}`;
  const chunks = chunkKB(docText, { idPrefix: "note", foldPreamble: true });
  if (!title) return chunks;

  const titleLine = `# ${title}`;
  return chunks.map((c) => {
    if (c.text.startsWith(titleLine)) return c;
    const text = `${titleLine}\n\n${c.text}`;
    return {
      ...c,
      id: `note-${slugify(c.section)}-${sha1Hex(text).slice(0, 8)}`,
      text,
    };
  });
}

/**
 * Minimal glob over the local filesystem (no dependencies). Supports literal
 * path segments, a `*` wildcard segment, and `**` as zero-or-more directories.
 * Hidden directories (dotfiles, node_modules) are never traversed.
 *
 * @param {string} rootDir
 * @param {string} pattern
 * @returns {Promise<string[]>}
 */
export async function globFiles(rootDir, pattern) {
  const parts = pattern.split("/").filter((p) => p !== "" && p !== ".");
  const results = [];
  const walk = async (base, rest) => {
    const [head, ...tail] = rest;
    if (head === undefined) {
      results.push(base);
      return;
    }
    if (head === "**") {
      await walk(base, tail);
      const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;
        await walk(path.join(base, entry.name), rest);
      }
      return;
    }
    const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const isMatch = head.includes("*")
        ? new RegExp(`^${head.replace(/\*/g, "[^.]*")}$`).test(entry.name)
        : entry.name === head;
      if (!isMatch) continue;
      const child = path.join(base, entry.name);
      if (tail.length === 0 && entry.isFile()) results.push(child);
      else if (tail.length > 0 && entry.isDirectory()) await walk(child, tail);
    }
  };
  await walk(rootDir, parts);
  return results.sort();
}

/**
 * Load the chunk set for all sources declared in kb-sources.json, relative to
 * the repo root.
 *
 * @param {string} rootDir
 * @returns {Promise<Array<{ id: string, text: string, section: string, idx: number, source: string }>>}
 */
export async function loadKBChunks(rootDir) {
  const sourcesPath = path.join(rootDir, "workers", "chat-worker", "kb-sources.json");
  const config = JSON.parse(await readFile(sourcesPath, "utf8"));
  const sources = Array.isArray(config.sources) ? config.sources : [];

  const chunks = [];
  for (const source of sources) {
    if (source.type === "curated") {
      const moduleUrl = pathToFileURL(path.resolve(rootDir, source.file)).href;
      const mod = await import(moduleUrl);
      const kbText = mod.KNOWLEDGE_BASE;
      chunks.push(...chunkKB(kbText).map((c) => ({ ...c, source: source.id })));
      continue;
    }
    if (source.type === "markdown") {
      const files = await globFiles(rootDir, source.glob);
      for (const file of files) {
        const md = await readFile(file, "utf8");
        chunks.push(...chunkNote(md).map((c) => ({ ...c, source: source.id })));
      }
      continue;
    }
    throw new Error(`Unknown source type '${source.type}' for source '${source.id}'`);
  }
  return chunks;
}

/** Manifest sync diff: ids the manifest is missing and ids it should prune. */
export function diffIds(currentIds, manifestIds) {
  const manifestSet = new Set(manifestIds);
  const currentSet = new Set(currentIds);
  return {
    missing: currentIds.filter((id) => !manifestSet.has(id)),
    stale: manifestIds.filter((id) => !currentSet.has(id)),
  };
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
  return { dryRun: argv.includes("--dry-run"), check: argv.includes("--check") };
}

async function main() {
  const { dryRun, check } = parseArgs(process.argv.slice(2));
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!dryRun && !check && !accountId) {
    console.error("CLOUDFLARE_ACCOUNT_ID is required (set it in the environment).");
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !check && !apiToken) {
    console.error(
      "CLOUDFLARE_API_TOKEN is required unless running with --dry-run or --check (no network modes).",
    );
    process.exitCode = 1;
    return;
  }

  const chunks = await loadKBChunks(ROOT_DIR);
  if (chunks.length === 0) {
    console.log(`Knowledge base is empty — no chunks to index (index '${INDEX_NAME}' left unchanged).`);
    return;
  }

  const bySource = {};
  for (const c of chunks) bySource[c.source] = (bySource[c.source] ?? 0) + 1;
  const summary = Object.entries(bySource)
    .map(([source, count]) => `${source}: ${count}`)
    .join(", ");
  console.log(`Chunking KB -> ${chunks.length} chunks (${summary}) — index '${INDEX_NAME}'`);

  if (check) {
    const manifestIds = await readManifestIds();
    const { missing, stale } = diffIds(chunks.map((c) => c.id), manifestIds);
    if (missing.length === 0 && stale.length === 0) {
      console.log(`Manifest in sync: ${manifestIds.length} chunk ids match current sources.`);
      return;
    }
    console.error(`Manifest out of sync: ${missing.length} missing, ${stale.length} stale.`);
    for (const id of missing) console.error(`  + ${id}`);
    for (const id of stale) console.error(`  - ${id}`);
    console.error("Run `pnpm chat:populate` to re-populate and commit the updated manifest.");
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    for (const c of chunks) {
      console.log(`  [${c.source}] ${c.id}  [${c.section}]  ${c.text.length} chars`);
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
    metadata: { section: c.section, source: c.source, idx: c.idx, text: c.text },
  }));

  const previousIds = await readManifestIds();
  const currentIds = new Set(vectors.map((v) => v.id));
  const staleIds = previousIds.filter((id) => !currentIds.has(id));

  const upsertResult = await upsertVectors(vectors, { accountId, apiToken });
  const deleteResult = await deleteByIds(staleIds, { accountId, apiToken });

  // Persist the committed chunk-ID manifest used for future prune and --check,
  // but only when the id set actually changed: `generatedAt` otherwise changes
  // on every run and produces an empty bot commit per CI run.
  const sortedIds = [...currentIds].sort();
  const idsUnchanged =
    previousIds.length === sortedIds.length && sortedIds.every((id, i) => previousIds[i] === id);
  if (!idsUnchanged) {
    await writeFile(
      MANIFEST_PATH,
      `${JSON.stringify(
        {
          index: INDEX_NAME,
          embeddingModel: EMBEDDING_MODEL,
          generatedAt: new Date().toISOString(),
          sources: bySource,
          ids: sortedIds,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  console.log(
    `Upserted ${upsertResult?.count ?? vectors.length} vectors, pruned ${deleteResult?.count ?? staleIds.length} stale. Manifest ${idsUnchanged ? "unchanged" : `written: ${MANIFEST_PATH}`}.`,
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`populate-index failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}
