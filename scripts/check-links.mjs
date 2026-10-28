#!/usr/bin/env node
// Link check over the Astro build output (dist/).
// Internal links (paths, anchors, same-origin URLs) must resolve to a built
// file and, when they carry a #fragment, to an element id on that page. Any
// broken internal link fails the run.
// External links are checked only with --external. A 404, 410 or DNS failure
// after retries fails the run. 401, 403, 429, 5xx and timeouts are reported as
// warnings, because many sites block bots or rate limit CI runners. Hosts in
// EXTERNAL_ALLOWLIST are skipped entirely.
// Usage: node scripts/check-links.mjs [distDir] [--external]
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SITE_ORIGINS = ["https://www.ramirocerda.com.ar", "https://ramirocerda.com.ar"];

// Sites that answer bots with 999/403 regardless of the URL.
export const EXTERNAL_ALLOWLIST = ["linkedin.com", "www.linkedin.com", "x.com", "twitter.com"];

const SKIP_SCHEMES = /^(mailto:|tel:|javascript:|data:|blob:|sms:)/i;
const ATTR_RE = /\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const ID_RE = /\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

const decodeEntities = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function extractLinks(html) {
  // Ignore <link rel="preconnect|dns-prefetch"> targets: they are origins, not pages.
  const cleaned = html.replace(/<link\b[^>]*rel=["'](?:preconnect|dns-prefetch)["'][^>]*>/gi, "");
  const out = [];
  for (const m of cleaned.matchAll(ATTR_RE)) out.push(decodeEntities((m[1] ?? m[2] ?? "").trim()));
  return out.filter((h) => h !== "");
}

export function extractIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(ID_RE)) ids.add(m[1] ?? m[2]);
  return ids;
}

// Classify an href found on page `pagePath` (a URL path like /en/about/).
export function classify(href, pagePath) {
  if (SKIP_SCHEMES.test(href)) return { kind: "skip" };
  if (href.startsWith("//")) href = `https:${href}`;
  if (/^https?:\/\//i.test(href)) {
    const url = new URL(href);
    if (SITE_ORIGINS.includes(url.origin)) {
      return { kind: "internal", path: decodeURI(url.pathname), hash: url.hash.slice(1) };
    }
    return { kind: "external", url: url.toString(), host: url.hostname };
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return { kind: "skip" };
  const url = new URL(href, `https://internal.invalid${pagePath}`);
  return { kind: "internal", path: decodeURI(url.pathname), hash: url.hash.slice(1) };
}

// Candidate files in dist for a URL path.
export function candidates(distDir, urlPath) {
  const rel = urlPath.replace(/^\/+/, "");
  if (rel === "" || rel.endsWith("/")) return [path.join(distDir, rel, "index.html")];
  if (path.extname(rel)) return [path.join(distDir, rel)];
  return [path.join(distDir, rel, "index.html"), path.join(distDir, `${rel}.html`)];
}

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.name.endsWith(".html")) out.push(p);
  }
  return out;
}

function pagePathOf(distDir, file) {
  const rel = path.relative(distDir, file).split(path.sep).join("/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function checkExternal(url, { fetchImpl = fetch, retries = 3, timeoutMs = 15000 } = {}) {
  let last = { status: 0, error: "not checked" };
  for (let attempt = 0; attempt < retries; attempt++) {
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetchImpl(url, {
          method,
          redirect: "follow",
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "user-agent": "Mozilla/5.0 (compatible; ramirocerda-link-check/1.0)" },
        });
        last = { status: res.status };
        if (res.status < 400) return last;
        // Some servers reject HEAD; retry the same attempt with GET.
        if (method === "HEAD" && [403, 404, 405, 501].includes(res.status)) continue;
        break;
      } catch (err) {
        last = { status: 0, error: err?.cause?.code ?? err?.name ?? String(err) };
        break;
      }
    }
    if (last.status === 404 || last.status === 410) return last;
    await sleep(1000 * (attempt + 1));
  }
  return last;
}

export function externalVerdict(result) {
  if (result.status > 0 && result.status < 400) return "ok";
  if (result.status === 404 || result.status === 410) return "broken";
  if (result.status === 0 && /ENOTFOUND|EAI_AGAIN|ECONNREFUSED/.test(result.error ?? "")) return "broken";
  return "warn";
}

export async function run(distDir, { external = false, log = console.log } = {}) {
  const files = await walk(distDir);
  const pages = new Map();
  for (const f of files) pages.set(f, await readFile(f, "utf8"));

  const broken = [];
  const warnings = [];
  const externalUses = new Map();
  const idCache = new Map();

  for (const [file, html] of pages) {
    const pagePath = pagePathOf(distDir, file);
    for (const href of new Set(extractLinks(html))) {
      const c = classify(href, pagePath);
      if (c.kind === "skip") continue;
      if (c.kind === "external") {
        if (!externalUses.has(c.url)) externalUses.set(c.url, { host: c.host, pages: new Set() });
        externalUses.get(c.url).pages.add(pagePath);
        continue;
      }
      let target = null;
      for (const cand of candidates(distDir, c.path)) {
        if (await isFile(cand)) {
          target = cand;
          break;
        }
      }
      if (!target) {
        broken.push({ page: pagePath, href, status: "404 (missing in build)" });
        continue;
      }
      if (c.hash && target.endsWith(".html")) {
        if (!idCache.has(target)) idCache.set(target, extractIds(pages.get(target) ?? (await readFile(target, "utf8"))));
        if (!idCache.get(target).has(decodeURIComponent(c.hash))) {
          broken.push({ page: pagePath, href, status: `missing anchor #${c.hash}` });
        }
      }
    }
  }

  if (external) {
    const entries = [...externalUses.entries()];
    const queue = entries.filter(([, v]) => !EXTERNAL_ALLOWLIST.includes(v.host));
    const results = new Map();
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) {
        const [url] = queue.shift();
        results.set(url, await checkExternal(url));
      }
    });
    await Promise.all(workers);
    for (const [url, use] of entries) {
      if (EXTERNAL_ALLOWLIST.includes(use.host)) continue;
      const r = results.get(url);
      const verdict = externalVerdict(r);
      const status = r.status || r.error;
      const pagesList = [...use.pages].sort().join(", ");
      if (verdict === "broken") broken.push({ page: pagesList, href: url, status: String(status) });
      if (verdict === "warn") warnings.push({ page: pagesList, href: url, status: String(status) });
    }
  }

  log(`Checked ${pages.size} pages, ${externalUses.size} unique external URLs${external ? "" : " (not fetched, pass --external)"}.`);
  for (const w of warnings) log(`WARN  ${w.status}  ${w.href}  (on ${w.page})`);
  for (const b of broken) log(`BROKEN  ${b.status}  ${b.href}  (on ${b.page})`);
  log(broken.length ? `${broken.length} broken link(s).` : "No broken links.");
  return { broken, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const distDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? "dist");
  const { broken } = await run(distDir, { external: args.includes("--external") });
  process.exit(broken.length ? 1 : 0);
}
