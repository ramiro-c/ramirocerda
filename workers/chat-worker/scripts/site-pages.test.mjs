// Tests for the site source: chunking the built HTML pages in dist/.
import { describe, it, expect } from "vitest";

import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chunkSitePage, loadSiteChunks, MAX_CHUNK_CHARS, readSitePage } from "./site-pages.mjs";
import { excludeClaimedRoutes, loadKBChunks } from "./populate-index.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoDistDir = path.resolve(scriptDir, "..", "..", "..", "dist");

/** Small indexable page fixture, shaped like the real BaseLayout output. */
function pageHtml({
  lang = "es",
  url = "/workflow/",
  alt = "/en/workflow/",
  title = "Workflow",
  robots = "",
  body = "",
} = {}) {
  const esHref = lang === "es" ? url : alt;
  const enHref = lang === "en" ? url : alt;
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    ${robots ? `<meta name="robots" content="${robots}" />` : ""}
    <link rel="canonical" href="https://www.ramirocerda.com.ar${url}" />
    <link rel="alternate" hreflang="es" href="https://www.ramirocerda.com.ar${esHref}" />
    <link rel="alternate" hreflang="en" href="https://www.ramirocerda.com.ar${enHref}" />
    <link rel="alternate" hreflang="x-default" href="https://www.ramirocerda.com.ar/" />
    <title>${title} · Ramiro Cerdá</title>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

describe("readSitePage", () => {
  it("returns null for noindex pages (404, redirect stubs)", () => {
    expect(readSitePage(pageHtml({ robots: "noindex" }), "404.html")).toBeNull();
  });

  it("normalizes canonical and hreflang urls (trailing slash stripped)", () => {
    const es = readSitePage(pageHtml({ lang: "es" }), "workflow/index.html");
    expect(es.url).toBe("/workflow");
    expect(es.urlAlt).toBe("/en/workflow");
    expect(es.lang).toBe("es");

    const en = readSitePage(
      pageHtml({ lang: "en", url: "/en/workflow/", alt: "/workflow/" }),
      "en/workflow/index.html",
    );
    expect(en.url).toBe("/en/workflow");
    expect(en.urlAlt).toBe("/workflow");
    expect(en.lang).toBe("en");
  });

  it("ignores x-default alternates and pages without an other-locale alternate", () => {
    const html = `<!doctype html>
<html lang="es"><head><link rel="canonical" href="https://x.com/solo/" />
<link rel="alternate" hreflang="x-default" href="https://x.com/" /></head>
<body><main><h1>Solo</h1></main></body></html>`;
    const page = readSitePage(html, "solo/index.html");
    expect(page.url).toBe("/solo");
    expect(page.urlAlt).toBeNull();
  });

  it("throws without <main> and without canonical", () => {
    const noMain = `<!doctype html><html lang="es"><head><link rel="canonical" href="https://x.com/a/" /></head><body><p>x</p></body></html>`;
    expect(() => readSitePage(noMain, "a/index.html")).toThrow("a/index.html: indexable page without <main>");
    const noCanonical = `<!doctype html><html lang="es"><head><title>x</title></head><body><main><h1>x</h1></main></body></html>`;
    expect(() => readSitePage(noCanonical, "a/index.html")).toThrow("a/index.html: indexable page without canonical");
  });

  it("derives pageKey from the url", () => {
    const keyOf = (url) => readSitePage(pageHtml({ url, alt: null }), "x/index.html").pageKey;
    expect(keyOf("/")).toBe("home");
    expect(keyOf("/en")).toBe("home");
    expect(keyOf("/en/workflow/")).toBe("workflow");
    expect(keyOf("/workflow/")).toBe("workflow");
  });

  it("titles from the first h1 inside main, falling back to <title>", () => {
    const withH1 = readSitePage(pageHtml({ body: "<h1>Mi flujo</h1><p>x</p>" }), "x/index.html");
    expect(withH1.title).toBe("Mi flujo");
    const htmlNoH1 = pageHtml({ title: "Fallback" }).replace("<main></main>", "<main><p>x</p></main>");
    const withoutH1 = readSitePage(htmlNoH1, "x/index.html");
    expect(withoutH1.title).toBe("Fallback · Ramiro Cerdá");
  });
});

describe("renderMain", () => {
  it("renders headings and list items", () => {
    const out = readSitePage(
      pageHtml({
        body: "<h1>Flujo</h1><h2>Etapa</h2><p>Hola <strong>mundo</strong></p><ul><li>Uno</li><li>Dos</li></ul>",
      }),
      "x/index.html",
    ).markdown;
    expect(out).toBe("# Flujo\n\n## Etapa\n\nHola mundo\n\n- Uno\n- Dos");
  });

  it("drops dropped-tag and skipped subtrees", () => {
    const out = readSitePage(
      pageHtml({
        body: `<nav>nav</nav><button>btn</button><script>evil()</script><p style=""></p>
            <div hidden>hidden</div><div aria-hidden="true">sr</div><div data-kb="skip">skip</div>
            <p>Queda</p>`,
      }),
      "x/index.html",
    ).markdown;
    expect(out).toBe("Queda");
  });

  it("keeps pre verbatim and splits br lines", () => {
    const out = readSitePage(
      pageHtml({ body: "<p>a<br>b</p><pre><code>x &lt; y\n  indented</code></pre>" }),
      "x/index.html",
    ).markdown;
    expect(out).toContain("a\nb");
    expect(out).toContain("x < y\nindented");
  });
});

describe("chunkSitePage", () => {
  const parse = (body, opts = {}) => readSitePage(pageHtml({ body, ...opts }), "x/index.html");

  it("makes one chunk per h2 section with title prefix and › section chain", () => {
    const page = parse("<h1>Flujo</h1><p>Intro.</p><h2>Uno</h2><p>cuerpo uno</p><h2>Dos</h2><p>cuerpo dos</p>");
    const chunks = chunkSitePage(page);
    expect(chunks).toHaveLength(2);
    for (const c of chunks) {
      expect(c.text.startsWith("# Flujo\n\n")).toBe(true);
      expect(c.id).toMatch(/^site-[a-z0-9-]+-[0-9a-f]{8}$/);
      expect(Buffer.byteLength(c.id, "utf8")).toBeLessThanOrEqual(64);
      expect(c.url).toBe("/workflow");
      expect(c.urlAlt).toBe("/en/workflow");
    }
    expect(chunks[0].text).toContain("Intro.");
    expect(chunks[0].section).toBe("Flujo › Uno");
    expect(chunks[1].text).toContain("cuerpo dos");
    expect(chunks[1].section).toBe("Flujo › Dos");
  });

  it("splits long chunks at blank-line boundaries, repeating headings and suffixing the section", () => {
    const long = Array.from({ length: 8 }, (_, i) => `<p>bloque ${i} ${"x".repeat(220)}</p>`).join("\n");
    const page = parse(`<h1>Largo</h1><h2>Sección</h2>${long}`);
    const chunks = chunkSitePage(page);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.startsWith("# Largo\n\n## Sección\n\n")).toBe(true);
    }
    for (const c of chunks.slice(0, -1)) {
      expect(c.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    expect(chunks[1].section).toBe("Largo › Sección (2)");
    expect(chunks[0].section).toBe("Largo › Sección");
  });

  it("gives identical es/en pages different ids (url is in the hash)", () => {
    const body = "<h1>Same</h1><h2>S</h2><p>body</p>";
    const es = chunkSitePage(parse(body, { lang: "es" }));
    const en = chunkSitePage(parse(body, { lang: "en", url: "/en/workflow/", alt: "/workflow/" }));
    expect(es.map((c) => c.text)).toEqual(en.map((c) => c.text));
    expect(es.map((c) => c.id)).not.toEqual(en.map((c) => c.id));
  });

  it("is deterministic for the same input", () => {
    const body = "<h1>D</h1><h2>S</h2><p>uno</p><h3>T</h3><p>dos</p>";
    expect(chunkSitePage(parse(body))).toEqual(chunkSitePage(parse(body)));
  });

  it("throws the coverage error when no chunk has body content", () => {
    const page = parse('<h1>Solo título</h1><div data-kb="skip">todo UI</div>');
    expect(() => chunkSitePage(page)).toThrow(
      '/workflow: indexable page produced no content (check data-kb="skip" and hidden wrappers)',
    );
  });

  it("keeps a prose-only page as one preamble chunk", () => {
    const page = parse("<h1>Solo</h1><p>Texto sin secciones.</p>");
    const chunks = chunkSitePage(page);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].section).toBe("Solo");
    expect(chunks[0].text).toBe("# Solo\n\nTexto sin secciones.");
  });

  it("emits exactly one title line in every chunk", () => {
    const page = parse("<h1>Flujo</h1><h2>Uno</h2><p>cuerpo uno</p><h2>Dos</h2><p>cuerpo dos</p>");
    const chunks = chunkSitePage(page);
    for (const chunk of chunks) {
      const titleLines = chunk.text.split("\n").filter((line) => line === "# Flujo");
      expect(titleLines, chunk.id).toHaveLength(1);
    }
  });
});

describe("loadSiteChunks", () => {
  it("throws when dist is missing", async () => {
    await expect(loadSiteChunks(path.join(tmpdir(), "no-such-dist-dir"))).rejects.toThrow(
      "dist/ missing: run `bun run build` before populate",
    );
  });

  it("reads every html page in sorted order, skipping noindex, failing on duplicate urls", async () => {
    const dist = await mkdtemp(path.join(tmpdir(), "botardo-dist-"));
    try {
      await mkdir(path.join(dist, "b"), { recursive: true });
      await mkdir(path.join(dist, "a"), { recursive: true });
      await writeFile(
        path.join(dist, "b", "index.html"),
        pageHtml({ url: "/b/", body: "<h1>B</h1><p>contenido b</p>" }),
      );
      await writeFile(
        path.join(dist, "a", "index.html"),
        pageHtml({ url: "/a/", body: "<h1>A</h1><p>contenido a</p>" }),
      );
      await writeFile(path.join(dist, "404.html"), pageHtml({ url: "/404/", robots: "noindex" }));
      const chunks = await loadSiteChunks(dist);
      expect(chunks.map((c) => c.url)).toEqual(["/a", "/b"]);

      await writeFile(path.join(dist, "dup.html"), pageHtml({ url: "/a/" }));
      await expect(loadSiteChunks(dist)).rejects.toThrow("duplicate site page url /a");
    } finally {
      await rm(dist, { recursive: true, force: true });
    }
  });
});

describe("loadKBChunks with a site source", () => {
  async function makeRoot({ withNoteDistPage = true } = {}) {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-kb-site-"));
    await mkdir(path.join(root, "src", "content", "notes", "es"), { recursive: true });
    await writeFile(
      path.join(root, "src", "content", "notes", "es", "n1.md"),
      `---\ntitle: "Nota 1"\n---\n\n### Sección\nCuerpo de la nota.\n`,
    );
    await mkdir(path.join(root, "workers", "chat-worker"), { recursive: true });
    await writeFile(
      path.join(root, "workers", "chat-worker", "kb-sources.json"),
      JSON.stringify({
        sources: [
          { id: "notes", type: "markdown", glob: "src/content/notes/**/*.md" },
          { id: "site", type: "site", dir: "dist" },
        ],
      }),
    );
    const dist = path.join(root, "dist");
    await mkdir(path.join(dist, "notes", "n1"), { recursive: true });
    await mkdir(path.join(dist, "en", "notes", "n1"), { recursive: true });
    await mkdir(path.join(dist, "workflow"), { recursive: true });
    if (withNoteDistPage) {
      await writeFile(
        path.join(dist, "notes", "n1", "index.html"),
        pageHtml({ url: "/notes/n1/", alt: "/en/notes/n1/", title: "Nota 1", body: "<h1>Nota 1</h1><p>cuerpo</p>" }),
      );
      await writeFile(
        path.join(dist, "en", "notes", "n1", "index.html"),
        pageHtml({
          lang: "en",
          url: "/en/notes/n1/",
          alt: "/notes/n1/",
          title: "Nota 1",
          body: "<h1>Nota 1</h1><p>cuerpo</p>",
        }),
      );
    }
    await writeFile(
      path.join(dist, "workflow", "index.html"),
      pageHtml({ title: "Workflow", body: "<h1>Workflow</h1><h2>Etapas</h2><p>nueve etapas</p>" }),
    );
    return root;
  }

  it("drops the site chunk of a route claimed by the notes source, keeps the rest", async () => {
    const root = await makeRoot();
    try {
      const chunks = await loadKBChunks(root);
      const siteChunks = chunks.filter((c) => c.id.startsWith("site-"));
      // /notes/n1 (es + en) claimed by the notes source; /workflow stays.
      expect(siteChunks.map((c) => c.url)).toEqual(["/workflow"]);
      expect(siteChunks[0].source).toBe("site");
      expect(siteChunks[0].id).toMatch(/^site-workflow-[a-z0-9-]+-[0-9a-f]{8}$/);
      // The markdown note chunk is untouched.
      expect(chunks.some((c) => c.source === "notes" && c.text.includes("# Nota 1"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws when a claimed route has no page in dist/", async () => {
    const root = await makeRoot({ withNoteDistPage: false });
    try {
      await expect(loadKBChunks(root)).rejects.toThrow("claimed route /notes/n1 has no page in dist/ (source notes)");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("throws when dist is missing", async () => {
    const root = await makeRoot();
    try {
      await rm(path.join(root, "dist"), { recursive: true, force: true });
      await expect(loadKBChunks(root)).rejects.toThrow("dist/ missing: run `bun run build` before populate");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("excludeClaimedRoutes leaves chunks untouched when no site source ran", () => {
    const chunks = [{ id: "note-x-12345678", source: "notes", url: "/notes/x", urlAlt: "/en/notes/x" }];
    expect(excludeClaimedRoutes(chunks)).toEqual(chunks);
  });
});

describe("site source against the real dist/", () => {
  it.skipIf(!existsSync(repoDistDir))("chunks /workflow and /en/workflow one chunk per stage", async () => {
    const chunks = await loadSiteChunks(repoDistDir);
    const shared = [
      "card-start",
      "Design (architect)",
      "Apply (poteto-mode)",
      "Verify (prove it works)",
      "card-validate",
      "card-review",
      "card-pr + interrogate",
      "Partners / Slack",
    ];
    const pages = {
      "/workflow": ["Triage y framing gate", ...shared],
      "/en/workflow": ["Triage and framing gate", ...shared],
    };
    for (const [url, stages] of Object.entries(pages)) {
      const sections = chunks.filter((c) => c.url === url).map((c) => c.section);
      for (const stage of stages) {
        expect(
          sections.filter((s) => s.endsWith(` › ${stage}`)),
          `${url}: ${stage}`,
        ).toHaveLength(1);
      }
    }
  });

  it.skipIf(!existsSync(repoDistDir))("indexes real site copy, not curated-KB-only content", async () => {
    const chunks = await loadSiteChunks(repoDistDir);
    expect(chunks.some((c) => c.text.includes("interrogate"))).toBe(true);
    expect(chunks.some((c) => c.text.includes("Judgment Day"))).toBe(false);
  });

  it.skipIf(!existsSync(repoDistDir))("keeps every indexed site chunk within MAX_CHUNK_CHARS", async () => {
    const chunks = await loadKBChunks(path.dirname(repoDistDir));
    const oversized = chunks.filter((c) => c.source === "site" && c.text.length > MAX_CHUNK_CHARS);
    expect(oversized.map((c) => c.id)).toEqual([]);
  });

  it.skipIf(!existsSync(repoDistDir))("the real curated file passes the off-site guard", async () => {
    const chunks = await loadKBChunks(path.dirname(repoDistDir));
    expect(chunks.some((c) => c.id.startsWith("kb-"))).toBe(true);
    expect(chunks.some((c) => c.id.startsWith("site-"))).toBe(true);
  });
});
