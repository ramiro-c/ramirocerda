/**
 * chunking.mjs — shared deterministic chunking primitives for the KB sources.
 *
 * Moved verbatim out of populate-index.mjs so both the source loaders
 * (populate-index.mjs) and the site page chunker (site-pages.mjs) can use them
 * without an import cycle. No behavior change: chunkKB, slugify, sha1Hex and
 * globFiles are byte-for-byte the same implementations that used to live in
 * populate-index.mjs.
 */

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** First 8 hex chars of the sha1 of a string. */
export function sha1Hex(text) {
  return createHash("sha1").update(text, "utf8").digest("hex");
}

export function slugify(text) {
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
    // Keep parent headings (higher level = fewer #) for sibling chunks at deeper levels
    pendingParents = pendingParents.filter((p) => {
      const pm = p.match(/^(#+)\s+/);
      const cm = c.headingLine.match(/^(#+)\s+/);
      if (!pm || !cm) return false;
      return pm[1].length < cm[1].length;
    });
    const text = lines.join("\n").trimEnd();
    chunks.push({ heading: c.heading, text });
  }

  // Prose-only input with no headings at all: one whole-document chunk so the
  // content is never silently dropped.
  if (chunks.length === 0 && pendingParents.length > 0) {
    const text = pendingParents.join("\n").trimEnd();
    chunks.push({
      heading: text
        .split("\n")[0]
        .replace(/^#+\s*/, "")
        .slice(0, 80),
      text,
    });
  }

  return chunks.map((c, idx) => ({
    id: `${idPrefix}-${slugify(c.heading)}-${sha1Hex(c.text).slice(0, 8)}`,
    text: c.text,
    section: c.heading,
    idx,
  }));
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
  return results.toSorted();
}
