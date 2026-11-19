/**
 * site-pages.mjs — KB source that indexes what the site actually publishes.
 *
 * Reads every indexable HTML page Astro emitted to dist/, renders the page's
 * <main> back to markdown-lite, and chunks it on the same heading boundaries
 * the other sources use (via chunkKB). This is what makes Botardo know
 * everything the site publishes — /workflow, /about, the home page, the
 * notes/work indexes — with no hand-written copy: the markup is the single
 * source of truth.
 *
 * Pages opt out with <meta name="robots" content="noindex"> (the 404 page and
 * Astro redirect stubs), and page fragments that are UI — not content — opt
 * out with data-kb="skip", hidden, or aria-hidden="true" wrappers.
 *
 * Everything is deterministic: same dist/ in, same chunk ids out.
 */

import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { parse } from "parse5";

import { chunkKB, globFiles, sha1Hex, slugify } from "./chunking.mjs";

/** A site chunk longer than this is split at blank-line block boundaries. */
export const MAX_CHUNK_CHARS = 1200;

/** Resolving root-relative hrefs (canonical, alternates) needs a base URL. */
const HREF_BASE = "https://kb.invalid";

/** Elements whose whole subtree is UI or machinery, never KB content. */
const DROP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "template",
  "svg",
  "img",
  "picture",
  "video",
  "iframe",
  "button",
  "form",
  "dialog",
  "nav",
]);

/** Block elements that open a new blank-line-separated block when rendered. */
const BLOCK_TAGS = new Set([
  "h5",
  "h6",
  "p",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "figcaption",
  "blockquote",
  "dt",
  "dd",
  "tr",
  "ul",
  "ol",
  "dl",
  "table",
]);

const HEADING_LEVELS = { h1: 1, h2: 2, h3: 3, h4: 4 };

function attrsOf(el) {
  return Object.fromEntries((el.attrs ?? []).map((a) => [a.name, a.value]));
}

/** Depth-first element iterator over a parse5 subtree. */
function* walkElements(node) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === "#text" || child.nodeName === "#comment") continue;
    yield child;
    yield* walkElements(child);
  }
}

function findFirst(root, predicate) {
  for (const el of walkElements(root)) {
    if (predicate(el)) return el;
  }
  return null;
}

/** True when the element and its whole subtree must stay out of the KB. */
function isDropped(el) {
  if (DROP_TAGS.has(el.tagName)) return true;
  const attrs = attrsOf(el);
  if ("hidden" in attrs) return true;
  if (attrs["aria-hidden"] === "true") return true;
  if (attrs["data-kb"] === "skip") return true;
  return false;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ");
}

/** Decoded text content of a subtree, skipping dropped elements. */
function allText(node) {
  let out = "";
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === "#text") out += child.value;
    else if (child.nodeName === "#comment") continue;
    else if (!isDropped(child)) out += allText(child);
  }
  return out;
}

/** Verbatim (uncollapsed) text of a subtree — for `pre`. */
function rawText(node) {
  let out = "";
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === "#text") out += child.value;
    else if (child.nodeName === "#comment") continue;
    else if (!isDropped(child)) out += rawText(child);
  }
  return out;
}

/** Collapsed, trimmed inline text of an element (headings, list items). */
function inlineText(el) {
  return collapseWhitespace(allText(el)).trim();
}

/** True when the element has a non-dropped descendant heading or block tag. */
function hasBlockDescendant(el) {
  for (const child of el.childNodes ?? []) {
    if (child.nodeName === "#text" || child.nodeName === "#comment") continue;
    if (isDropped(child)) continue;
    if (HEADING_LEVELS[child.tagName] || BLOCK_TAGS.has(child.tagName)) return true;
    if (hasBlockDescendant(child)) return true;
  }
  return false;
}

/** Render one element to markdown-lite. See renderMain for the rules. */
function renderElement(el) {
  if (isDropped(el)) return "";
  const tag = el.tagName;
  if (HEADING_LEVELS[tag]) {
    return `\n\n${"#".repeat(HEADING_LEVELS[tag])} ${inlineText(el)}\n\n`;
  }
  if (tag === "li") {
    // A list item that contains headings or block elements is a block
    // itself (e.g. the /workflow stages: <li><div class="row-detail">
    // <h3>…</h3><p>…</p></div></li>) — flatten only simple items.
    if (hasBlockDescendant(el)) return `\n\n${renderChildren(el).trim()}\n\n`;
    return `\n- ${inlineText(el)}`;
  }
  if (tag === "br") return "\n";
  if (tag === "pre") return `\n${rawText(el)}\n`;
  // Table cells need a separator between them (source markup has none).
  if (tag === "td" || tag === "th") return `${renderChildren(el)} `;
  if (BLOCK_TAGS.has(tag)) return `\n\n${renderChildren(el).trim()}\n\n`;
  // Inline elements (span, a, strong, em, code, ...) pass text through.
  return renderChildren(el);
}

function renderChildren(node) {
  let out = "";
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === "#text") out += collapseWhitespace(child.value);
    else if (child.nodeName === "#comment") continue;
    else out += renderElement(child);
  }
  return out;
}

/**
 * Render a <main> element to markdown-lite:
 * - dropped subtrees: script/style/nav/button/img/... and anything with
 *   hidden, aria-hidden="true" or data-kb="skip";
 * - h1..h4 → `#`..`####` lines; `li` → `- item`; `br` → newline; `pre` →
 *   verbatim text; block elements separate with a blank line;
 * - inline text collapses whitespace runs, lines are trimmed, 3+ newlines
 *   collapse to 2, and the result is NFC-normalized (parse5 already decoded
 *   the entities).
 *
 * @param {object} main parse5 <main> element
 * @returns {string}
 */
export function renderMain(main) {
  let out = renderChildren(main);
  out = out
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim().normalize("NFC");
}

/** Strip a trailing "/" unless the path is "/" itself. */
function normalizePath(pathname) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function hreflangOf(el) {
  const attrs = attrsOf(el);
  if (!(attrs.rel ?? "").split(/\s+/).includes("alternate")) return null;
  const hreflang = attrs.hreflang ?? "";
  if (!hreflang || hreflang.toLowerCase() === "x-default") return null;
  return hreflang.toLowerCase();
}

/**
 * Derive the stable per-page key used in site chunk ids: the url with a
 * leading `/en` removed, slashes turned into dashes; `/` and `/en` → `home`.
 *
 * @param {string} url normalized canonical pathname
 * @returns {string}
 */
function pageKeyOf(url) {
  const withoutEn = url === "/en" || url.startsWith("/en/") ? url.slice(3) : url;
  const key = withoutEn.split("/").filter(Boolean).join("-");
  return key || "home";
}

/**
 * Parse one built HTML page into an indexable page record, or null when the
 * page is noindex (the 404 page and Astro redirect stubs).
 *
 * @param {string} html built page HTML
 * @param {string} file dist-relative file path, for error messages
 * @returns {null | { file: string, lang: string, url: string, urlAlt: string | null, pageKey: string, title: string, markdown: string }}
 */
export function readSitePage(html, file) {
  const doc = parse(html);

  const robots = findFirst(doc, (el) => el.tagName === "meta" && (attrsOf(el).name ?? "").toLowerCase() === "robots");
  if (robots && /noindex/i.test(attrsOf(robots).content ?? "")) return null;

  const htmlEl = findFirst(doc, (el) => el.tagName === "html");
  const lang = attrsOf(htmlEl ?? {}).lang ?? "";
  const otherLang = lang === "en" ? "es" : "en";

  const canonical = findFirst(
    doc,
    (el) => el.tagName === "link" && (attrsOf(el).rel ?? "").split(/\s+/).includes("canonical"),
  );
  if (!canonical) throw new Error(`${file}: indexable page without canonical`);
  const url = normalizePath(new URL(attrsOf(canonical).href, HREF_BASE).pathname);

  let urlAlt = null;
  for (const el of walkElements(doc)) {
    if (el.tagName !== "link") continue;
    if (hreflangOf(el) !== otherLang) continue;
    urlAlt = normalizePath(new URL(attrsOf(el).href, HREF_BASE).pathname);
    break;
  }

  const main = findFirst(doc, (el) => el.tagName === "main");
  if (!main) throw new Error(`${file}: indexable page without <main>`);

  let pageKey = pageKeyOf(url);

  const h1 = findFirst(main, (el) => el.tagName === "h1");
  let title = h1 ? inlineText(h1) : "";
  if (!title) {
    const titleEl = findFirst(doc, (el) => el.tagName === "title");
    title = titleEl ? inlineText(titleEl) : "";
  }

  return { file, lang, url, urlAlt, pageKey, title, markdown: renderMain(main) };
}

/**
 * Chunk one parsed page the same way chunkNote chunks a note: chunkKB on
 * heading boundaries with the preamble (h1 + intro before the first h2) folded
 * into the first chunk, every chunk prefixed with the page title, and chunks
 * over MAX_CHUNK_CHARS split further at blank-line block boundaries — each
 * continuation repeats the chunk's heading lines and gets ` (2)`, ` (3)`... in
 * its section.
 *
 * @param {{ url: string, urlAlt: string | null, pageKey: string, title: string, markdown: string }} page
 * @returns {Array<{ id: string, text: string, section: string, idx: number, url: string, urlAlt?: string }>}
 */
export function chunkSitePage(page) {
  const titleLine = `# ${page.title}`;
  const raw = chunkKB(page.markdown, { idPrefix: "site", foldPreamble: true });

  const chunks = [];
  raw.forEach((c) => {
    // chunkKB carries the h1 as a parent line into every chunk; drop it so each
    // chunk is rebuilt with exactly one `# <title>` prefix.
    const lines = c.text.split("\n").filter((line) => line !== titleLine);
    // Heading lines lift to the front of the rebuilt chunk: chunkKB joins the
    // folded preamble to the first heading with a bare newline, and the split
    // continuations need the headings as one repeatable prefix.
    const headingLines = [];
    const bodyBlocks = [];
    let currentBlock = [];
    const flushBlock = () => {
      if (currentBlock.length) bodyBlocks.push(currentBlock.join("\n"));
      currentBlock = [];
    };
    for (const line of lines) {
      if (/^#{1,4}\s/.test(line)) {
        flushBlock();
        headingLines.push(line);
        continue;
      }
      if (line.trim() === "") {
        flushBlock();
        continue;
      }
      currentBlock.push(line);
    }
    flushBlock();

    const prefixText = [titleLine, ...headingLines].join("\n\n");
    // The heading chain for `section` is only the chunk's headings BELOW the
    // h1: the h1 title is already the `page.title ›` prefix, so it must not
    // repeat. Belt and braces: a leading chain element equal to the title is
    // dropped as well.
    let chain = headingLines.filter((l) => !l.startsWith("# ")).map((l) => l.replace(/^#+\s+/, ""));
    if (chain[0] === page.title) chain = chain.slice(1);
    const leafHeading = chain.length ? chain[chain.length - 1] : page.title;
    const baseSection = chain.length ? `${page.title} › ${chain.join(" › ")}` : page.title;

    // Greedy packing of body blocks: once a part would exceed
    // MAX_CHUNK_CHARS, start a continuation part (always at least one block).
    const groups = [];
    let current = [];
    let currentLen = prefixText.length;
    for (const block of bodyBlocks) {
      const add = 2 + block.length;
      if (current.length > 0 && currentLen + add > MAX_CHUNK_CHARS) {
        groups.push(current);
        current = [];
        currentLen = prefixText.length;
      }
      current.push(block);
      currentLen += add;
    }
    if (current.length) groups.push(current);

    groups.forEach((blocks, gi) => {
      const text = [prefixText, ...blocks].join("\n\n");
      const section = gi === 0 ? baseSection : `${baseSection} (${gi + 1})`;
      const chunk = {
        id: `site-${slugify(page.pageKey + "-" + leafHeading)}-${sha1Hex(page.url + "\n" + text).slice(0, 8)}`,
        text,
        section,
        idx: chunks.length,
        url: page.url,
      };
      if (page.urlAlt) chunk.urlAlt = page.urlAlt;
      chunks.push(chunk);
    });
  });

  // A page whose visible content is entirely data-kb="skip" / hidden has
  // nothing honest to index — fail loudly instead of indexing a bare title.
  const hasContent = chunks.some((c) => c.text.slice(titleLine.length).trim() !== "");
  if (!hasContent) {
    throw new Error(`${page.url}: indexable page produced no content (check data-kb="skip" and hidden wrappers)`);
  }

  return chunks;
}

/**
 * Load all site chunks from a built dist directory: every indexable HTML page,
 * in sorted file order, chunked deterministically.
 *
 * @param {string} distDir absolute path to the Astro build output
 * @returns {Promise<Array<{ id: string, text: string, section: string, idx: number, url: string, urlAlt?: string }>>}
 */
export async function loadSiteChunks(distDir) {
  const DIST_MISSING = "dist/ missing: run `bun run build` before populate";
  let st;
  try {
    st = await stat(distDir);
  } catch {
    throw new Error(DIST_MISSING);
  }
  if (!st.isDirectory()) throw new Error(DIST_MISSING);

  const pages = [];
  const seen = new Map();
  for (const file of await globFiles(distDir, "**/*.html")) {
    const rel = path.relative(distDir, file);
    const html = await readFile(file, "utf8");
    const page = readSitePage(html, rel);
    if (!page) continue;
    const first = seen.get(page.url);
    if (first) throw new Error(`duplicate site page url ${page.url} (${first} and ${rel})`);
    seen.set(page.url, rel);
    pages.push(page);
  }
  return pages.flatMap(chunkSitePage);
}
