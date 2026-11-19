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

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { chunkKB, globFiles, sha1Hex, slugify } from "./chunking.mjs";
import { loadSiteChunks } from "./site-pages.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(SCRIPT_DIR, "..");
const ROOT_DIR = path.join(WORKER_DIR, "..", "..");
const MANIFEST_PATH = path.join(WORKER_DIR, "vectorize-manifest.json");

// Optional convenience: auto-load a gitignored `.env` from the repo root when no
// CLOUDFLARE_API_TOKEN is already exported. Explicit env vars always win.
if (!process.env.CLOUDFLARE_API_TOKEN) {
  for (const candidate of [path.join(ROOT_DIR, ".env"), path.join(process.cwd(), ".env")]) {
    try {
      process.loadEnvFile(candidate);
      break;
    } catch {
      // missing/unreadable .env is fine — continue with exported env only
    }
  }
}

export const EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const EMBED_BATCH_SIZE = 16;
const INDEX_NAME = process.env.VECTORIZE_INDEX ?? "botardo-kb";

/**
 * Peel the raw YAML frontmatter content (between the leading --- markers) out
 * of a markdown document. Works even when the closing marker sits at EOF
 * without a trailing newline.
 */
function rawFrontmatter(md) {
  const m = md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|\s*$)/);
  return m ? m[1] : "";
}

/**
 * Line-anchor-safe scalar field from a YAML block: matches the key at line
 * start (any indentation), so a key like `userSlug` never matches `slug`.
 * Quoted scalars are unquoted and whitespace-collapsed; plain scalars are kept
 * verbatim (trimmed).
 */
function fieldOf(block, key) {
  const re = new RegExp(`(?:^|\r?\n)[ \t]*${key}:[ \t]*("[^"\\r\\n]*"|'[^'\\r\\n]*'|[^\\r\\n]*)`, "m");
  const m = block.match(re);
  if (!m) return "";
  const value = m[1].trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1).replace(/\s+/g, " ").trim();
  }
  return value;
}

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1).trim();
  }
  return v;
}

/**
 * List from a YAML block under `key`, read after the lang-block extraction:
 * inline `[a, "b"]` arrays and block lists (`- item`) are both supported.
 */
function listOf(block, key) {
  const inline = fieldOf(block, key);
  if (inline.startsWith("[")) {
    return inline
      .slice(1, -1)
      .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
      .map((s) => unquote(s))
      .filter(Boolean);
  }
  const lines = block.split(/\r?\n/);
  const keyIdx = lines.findIndex((line) => new RegExp(`^[ \\t]*${key}:[ \\t]*(?:$|\\S)`).test(line));
  if (keyIdx === -1) return [];
  const items = [];
  for (let i = keyIdx + 1; i < lines.length; i++) {
    const m = lines[i].match(/^[ \t]+-[ \t]*(.+?)[ \t]*$/);
    if (m) {
      items.push(unquote(m[1]));
      continue;
    }
    // A blank line inside a block list is fine; anything else ends the list.
    if (lines[i].trim() === "") continue;
    break;
  }
  return items;
}

/**
 * Top-level `<lang>:` block (e.g. `es:` / `en:` at column 0) from raw
 * frontmatter content: everything from the key line to the next top-level
 * key or the closing `---`. Project files are pure frontmatter with nested
 * localized objects, so the body is empty and this is where the content is.
 */
function extractLangBlock(front, lang) {
  const lines = front.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `${lang}:`);
  if (start === -1) return "";
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === "") {
      out.push(line);
      continue;
    }
    if (/^(---|[A-Za-z_-]+:)/.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Site route of a project page. Projects publish at /work/<slug> (Spanish,
 * default locale) and /en/work/<slug> (English), same slugs in both.
 *
 * @param {string} slug
 * @param {"es" | "en"} lang
 * @returns {{ slug: string, lang: "es" | "en", url: string, urlAlt: string }}
 */
export function projectRoute(slug, lang) {
  const url = lang === "en" ? `/en/work/${slug}` : `/work/${slug}`;
  const urlAlt = lang === "en" ? `/work/${slug}` : `/en/work/${slug}`;
  return { slug, lang, url, urlAlt };
}

/**
 * Chunk one project file into one synthetic chunk per language. Project files
 * under src/content/projects are pure YAML frontmatter with nested `es` / `en`
 * objects (title, summary, problem, what, highlights, stack), so the chunk text
 * is rebuilt from the frontmatter block, never from (the empty) body. One
 * chunk per language keeps the whole project retrievable as a unit, and the
 * published route is both in the text and in the url/urlAlt metadata so the
 * bot can link it like it links notes.
 *
 * @param {string} md
 * @param {{ filePath?: string }} [opts]
 * @returns {Array<{ id: string, text: string, section: string, idx: number, slug: string, lang: "es" | "en", url: string, urlAlt: string }>}
 */
export function buildProjectChunks(md, opts = {}) {
  const front = rawFrontmatter(md);
  if (!front) return [];
  const filePath = opts.filePath ?? "";
  const slug = fieldOf(front, "slug") || path.basename(filePath, ".md");
  if (!slug) return [];
  const repo = fieldOf(front, "repo");
  const demo = fieldOf(front, "demo");
  const chunks = [];

  for (const lang of ["es", "en"]) {
    const block = extractLangBlock(front, lang);
    if (!block) continue;
    const title = fieldOf(block, "title");
    const summary = fieldOf(block, "summary");
    if (!title && !summary) continue;
    const problem = fieldOf(block, "problem");
    const what = fieldOf(block, "what");
    const highlights = listOf(block, "highlights");
    const stack = listOf(block, "stack");
    const labels =
      lang === "es"
        ? {
            problem: "Problema",
            what: "Qué hice",
            highlights: "Destacados",
            stack: "Stack",
            repo: "Repositorio",
            demo: "Demo",
            page: "Página",
          }
        : {
            problem: "Problem",
            what: "What I did",
            highlights: "Highlights",
            stack: "Stack",
            repo: "Repository",
            demo: "Demo",
            page: "Page",
          };

    const lines = [`# ${title || slug}`];
    if (summary) lines.push("", summary);
    if (problem) lines.push("", `**${labels.problem}:** ${problem}`);
    if (what) lines.push("", `**${labels.what}:** ${what}`);
    if (highlights.length) {
      lines.push("", `**${labels.highlights}:**`);
      for (const h of highlights) lines.push(`- ${h}`);
    }
    if (stack.length) lines.push("", `**${labels.stack}:** ${stack.join(", ")}`);
    if (repo) lines.push("", `**${labels.repo}:** ${repo}`);
    if (demo) lines.push("", `**${labels.demo}:** ${demo}`);
    const route = projectRoute(slug, lang);
    lines.push("", `**${labels.page}:** ${route.url}`);

    const text = lines.join("\n");
    chunks.push({
      id: `project-${lang}-${slug}-${sha1Hex(text).slice(0, 8)}`,
      text,
      section: title || slug,
      idx: chunks.length,
      ...route,
    });
  }
  return chunks;
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
 * A note is a draft when its front matter sets `draft: true`. The notes schema
 * types `draft` as a YAML boolean, so `true`/`True`/`TRUE` are its only valid
 * spellings. The site hides drafts, so they must never reach the public
 * Vectorize index either: index only what a visitor can actually read.
 *
 * @param {string} md
 * @returns {boolean}
 */
export function isDraftNote(md) {
  const { frontmatter } = stripFrontmatter(md);
  return (
    String(frontmatter?.draft ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

/**
 * Derive the published route of a note from its file path.
 *
 * Notes live under `src/content/notes/<es|en>/<slug>.md` and are published at
 * `/notes/<slug>` (Spanish) and `/en/notes/<slug>` (English). A note outside a
 * locale directory is treated as Spanish, which is the default locale.
 *
 * @param {string} filePath repo-relative or absolute path of the note file
 * @param {string} [slugOverride] frontmatter slug, which wins over the filename
 *   because that is what `src/content.config.ts` + the `[slug]` page publish
 * @returns {{ slug: string, locale: "es" | "en", url: string, urlAlt: string }}
 */
export function noteRoute(filePath, slugOverride) {
  const parts = String(filePath).split(/[\\/]/).filter(Boolean);
  const file = parts[parts.length - 1] ?? "";
  const slug = slugOverride || file.replace(/\.md$/i, "");
  const parent = parts[parts.length - 2];
  const locale = parent === "en" ? "en" : "es";
  const url = locale === "en" ? `/en/notes/${slug}` : `/notes/${slug}`;
  const urlAlt = locale === "en" ? `/notes/${slug}` : `/en/notes/${slug}`;
  return { slug, locale, url, urlAlt };
}

/**
 * Chunk one markdown note: strip front matter, rebuild a title header, fold
 * the intro (title + prose before the first heading) into the first section
 * chunk, and prefix every chunk with the note title so retrieval keeps the
 * title keywords in every vector. When the caller knows where the file lives,
 * every chunk also carries the published route so the bot can link the note.
 *
 * @param {string} md
 * @param {{ filePath?: string }} [opts]
 * @returns {Array<{ id: string, text: string, section: string, idx: number, slug?: string, locale?: string, url?: string, urlAlt?: string }>}
 */
export function chunkNote(md, opts = {}) {
  const { frontmatter, body } = stripFrontmatter(md);
  const title = frontmatter?.title ?? "";
  const description = frontmatter?.description ?? "";
  const headerLines = [];
  if (title) headerLines.push(`# ${title}`);
  if (description) headerLines.push(description);
  const docText = `${[...headerLines, ""].join("\n")}${body.trimStart()}`;
  const route = opts.filePath ? noteRoute(opts.filePath, frontmatter?.slug || undefined) : null;
  const withRoute = (chunk) => (route ? { ...chunk, ...route } : chunk);
  const chunks = chunkKB(docText, { idPrefix: "note", foldPreamble: true });
  if (!title) return chunks.map(withRoute);

  const titleLine = `# ${title}`;
  return chunks.map((c) => {
    if (c.text.startsWith(titleLine)) return withRoute(c);
    const text = `${titleLine}\n\n${c.text}`;
    return withRoute({
      ...c,
      id: `note-${slugify(c.section)}-${sha1Hex(text).slice(0, 8)}`,
      text,
    });
  });
}

/**
 * Load the chunk set for all sources declared in kb-sources.json, relative to
 * the repo root.
 *
 * @param {string} rootDir
 * @returns {Promise<Array<{ id: string, text: string, section: string, idx: number, source: string, url?: string, urlAlt?: string }>>}
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
        // Drafts are unpublished: never index content the site hides.
        if (isDraftNote(md)) continue;
        // The file path is known here, so every chunk also carries the route the
        // note is published at (the bot links it instead of lecturing the KB).
        chunks.push(...chunkNote(md, { filePath: file }).map((c) => ({ ...c, source: source.id })));
      }
      continue;
    }
    if (source.type === "projects") {
      const files = await globFiles(rootDir, source.glob);
      for (const file of files) {
        const md = await readFile(file, "utf8");
        // Project files are pure frontmatter; one synthetic populated chunk per
        // language, carrying the published /work/<slug> route.
        chunks.push(...buildProjectChunks(md, { filePath: file }).map((c) => ({ ...c, source: source.id })));
      }
      continue;
    }
    if (source.type === "site") {
      // Index what the site actually publishes: every indexable HTML page Astro
      // emitted to dist/. dist must exist (the CI/populate runbook builds it
      // first); without it there is nothing honest to index. The exclude list
      // keeps whole routes (e.g. /privacy) out of the KB.
      const pages = await loadSiteChunks(path.resolve(rootDir, source.dir), {
        exclude: source.exclude ?? [],
      });
      chunks.push(...pages.map((c) => ({ ...c, source: source.id })));
      continue;
    }
    throw new Error(`Unknown source type '${source.type}' for source '${source.id}'`);
  }
  // The site source indexes every published page, including the note and
  // project pages that the markdown/projects sources already claim. Drop those
  // duplicates so each route is owned by exactly one source, then enforce that
  // the curated KB never restates what those published chunks already say.
  const result = excludeClaimedRoutes(chunks);
  assertCuratedIsOffSite(result);
  return result;
}

/**
 * Drift-guard thresholds for assertCuratedIsOffSite: a curated line with fewer
 * than CURATED_MIN_WORDS words is never checked, copied prose is detected with
 * CURATED_SHINGLE-word shingles, and a line whose shingle overlap with the
 * published set reaches CURATED_MAX_OVERLAP counts as copied.
 */
export const CURATED_MIN_WORDS = 8;
export const CURATED_SHINGLE = 6;
export const CURATED_MAX_OVERLAP = 0.6;

/**
 * Normalized words for the shingle check: lowercase, NFD with combining marks
 * stripped (accents gone), and every non [a-z0-9] run collapsed to one space.
 */
function shingleWords(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** All CURATED_SHINGLE-word shingles (consecutive word runs) of a word list. */
function shinglesOf(words) {
  const out = [];
  for (let i = 0; i + CURATED_SHINGLE <= words.length; i++) {
    out.push(words.slice(i, i + CURATED_SHINGLE).join(" "));
  }
  return out;
}

/**
 * Drift guard: the curated KB ("kb-*" chunks) must not restate what the other
 * sources already publish. Runs only when the chunk list contains at least one
 * site-source chunk (`site-` prefix) — with no site source there is no
 * "published" baseline, so the check is a no-op (unit-test fixtures without a
 * site source stay unaffected). Collects ALL violations and throws a single
 * error listing them:
 *
 * - Rule 1 (heading collision): slugify(curated section) equals slugify of a
 *   published chunk's leaf heading — for site chunks the section after the
 *   last ` › `, for notes/projects the section as is.
 * - Rule 2 (copied prose): every CURATED_SHINGLE-word shingle of every
 *   published chunk's text goes into a set; a curated line with at least
 *   CURATED_MIN_WORDS (normalized) words whose shingles overlap that set by
 *   CURATED_MAX_OVERLAP or more is copied, not hand-written.
 *
 * @param {Array<{ id: string, text: string, section: string, source: string, url?: string }>} chunks
 * @returns {Array<...>} the same list, unchanged, when nothing drifts
 */
export function assertCuratedIsOffSite(chunks) {
  if (!chunks.some((c) => c.id.startsWith("site-"))) return chunks;

  const curated = chunks.filter((c) => c.id.startsWith("kb-"));
  const published = chunks.filter((c) => !c.id.startsWith("kb-"));
  const violations = [];

  // Rule 1 — heading collision.
  const leafOwner = new Map();
  for (const p of published) {
    const leaf = p.id.startsWith("site-") ? p.section.split(" › ").pop() : p.section;
    const slug = slugify(leaf ?? "");
    if (slug && !leafOwner.has(slug)) leafOwner.set(slug, p);
  }
  for (const c of curated) {
    const owner = leafOwner.get(slugify(c.section));
    if (owner) {
      violations.push(
        `curated chunk ${c.id} repeats the heading "${c.section}" of published chunk ${owner.id}${owner.url ? ` (${owner.url})` : ""}. Delete it from knowledge-base.js: the site already publishes it.`,
      );
    }
  }

  // Rule 2 — copied prose.
  const shingleOwner = new Map();
  for (const p of published) {
    for (const shingle of shinglesOf(shingleWords(p.text))) {
      if (!shingleOwner.has(shingle)) shingleOwner.set(shingle, p);
    }
  }
  for (const c of curated) {
    for (const line of c.text.split("\n")) {
      const words = shingleWords(line);
      if (words.length < CURATED_MIN_WORDS) continue;
      const shingles = shinglesOf(words);
      if (shingles.length === 0) continue;
      let hits = 0;
      let owner = null;
      for (const shingle of shingles) {
        const found = shingleOwner.get(shingle);
        if (found) {
          hits += 1;
          owner ??= found;
        }
      }
      const overlap = hits / shingles.length;
      if (overlap >= CURATED_MAX_OVERLAP) {
        violations.push(
          `curated chunk ${c.id} copies the line "${line.trim()}" (${Math.round(overlap * 100)}% of its ${CURATED_SHINGLE}-word shingles) from published chunk ${owner.id}${owner.url ? ` (${owner.url})` : ""}. Delete it from knowledge-base.js: the site already publishes it.`,
        );
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `curated KB duplicates site-published content (${violations.length}):\n${violations.map((v) => `- ${v}`).join("\n")}`,
    );
  }
  return chunks;
}

/**
 * Remove site-source chunks whose route is already claimed by another source,
 * and fail loudly when a claimed route has no page in dist/ at all (that means
 * the markdown/projects sources index something the site does not publish).
 *
 * A chunk belongs to the site source when its id carries the `site-` prefix —
 * the only prefix loadSiteChunks ever generates (notes use `note-`, projects
 * `project-<lang>-`, the curated KB `kb-`).
 *
 * @param {Array<{ id: string, source: string, url?: string, urlAlt?: string }>} chunks
 * @returns {Array<{ id: string, source: string, url?: string, urlAlt?: string }>}
 */
export function excludeClaimedRoutes(chunks) {
  const isSite = (c) => c.id.startsWith("site-");
  const siteUrls = new Set(chunks.filter(isSite).map((c) => c.url));
  const claimedBy = new Map();
  for (const c of chunks) {
    if (isSite(c)) continue;
    if (c.url && !claimedBy.has(c.url)) claimedBy.set(c.url, c.source);
    if (c.urlAlt && !claimedBy.has(c.urlAlt)) claimedBy.set(c.urlAlt, c.source);
  }
  if (siteUrls.size > 0) {
    for (const [url, source] of claimedBy) {
      if (!siteUrls.has(url)) throw new Error(`claimed route ${url} has no page in dist/ (source ${source})`);
    }
  }
  return chunks.filter((c) => !isSite(c) || !claimedBy.has(c.url));
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

/**
 * Vectorize metadata for one chunk: the exact object shape the live index
 * upserts. Shared with the evals' local index (evals/local-index.ts) so both
 * index the same metadata.
 *
 * @param {{ section: string, source: string, idx: number, text: string, url?: string, urlAlt?: string }} chunk
 * @returns {{ section: string, source: string, idx: number, text: string, url?: string, urlAlt?: string }}
 */
export function vectorMetadata(chunk) {
  return {
    section: chunk.section,
    source: chunk.source,
    idx: chunk.idx,
    text: chunk.text,
    // Notes only: the published route the bot links to instead of dumping the
    // knowledge base. Curated KB chunks have no route and stay unchanged.
    ...(chunk.url ? { url: chunk.url, urlAlt: chunk.urlAlt } : {}),
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
    console.error("CLOUDFLARE_API_TOKEN is required unless running with --dry-run or --check (no network modes).");
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
    const { missing, stale } = diffIds(
      chunks.map((c) => c.id),
      manifestIds,
    );
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
    metadata: vectorMetadata(c),
  }));

  const previousIds = await readManifestIds();
  const currentIds = new Set(vectors.map((v) => v.id));
  const staleIds = previousIds.filter((id) => !currentIds.has(id));

  const upsertResult = await upsertVectors(vectors, { accountId, apiToken });
  const deleteResult = await deleteByIds(staleIds, { accountId, apiToken });

  // Persist the committed chunk-ID manifest used for future prune and --check,
  // but only when the id set actually changed: `generatedAt` otherwise changes
  // on every run and produces an empty bot commit per CI run.
  const sortedIds = [...currentIds].toSorted();
  const idsUnchanged = previousIds.length === sortedIds.length && sortedIds.every((id, i) => previousIds[i] === id);
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
