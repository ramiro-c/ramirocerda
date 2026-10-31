import { describe, it, expect } from "vitest";

import {
  buildProjectChunks,
  chunkKB,
  chunkNote,
  diffIds,
  globFiles,
  isDraftNote,
  loadKBChunks,
  noteRoute,
  projectRoute,
  sha1Hex,
  stripFrontmatter,
} from "./populate-index.mjs";
import { KNOWLEDGE_BASE } from "./knowledge-base.js";

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const headingRe = /^(#{2,4})\s+.+$/;

describe("chunkKB", () => {
  it("produces deterministic, content-addressed chunk ids", () => {
    const a = chunkKB(KNOWLEDGE_BASE);
    const b = chunkKB(KNOWLEDGE_BASE);

    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    for (const chunk of a) {
      expect(chunk.id).toMatch(/^kb-[a-z0-9-]+-[0-9a-f]{8}$/);
      expect(chunk.id.endsWith(sha1Hex(chunk.text).slice(0, 8))).toBe(true);
    }
  });

  it("splits the real KB into heading-boundary chunks (22)", () => {
    const chunks = chunkKB(KNOWLEDGE_BASE);
    expect(chunks.length).toBeGreaterThanOrEqual(20);

    const sections = chunks.map((c) => c.section);
    expect(sections).toContain("Overview");
    expect(sections).toContain("Stack Técnico");
    expect(sections).toContain("Educación");
    expect(sections).toContain("Soccer Analytics Agent");
    expect(sections).toContain("Mundial 2026 — Soccer Analytics / World Cup Companion");
    expect(sections).toContain("Sitio Web y Arquitectura del Bot");
    expect(sections).toContain("Google Cloud — AI Agents Path (completo, jun–jul 2026)");
    expect(sections).toContain("Workflow de trabajo con agentes (loop de cards)");
    expect(sections).toContain("Triage");
    expect(sections).toContain("card-start");
    expect(sections).toContain("SDD auto");
    expect(sections).toContain("card-review");
    expect(sections).toContain("card-pr");
    expect(sections).toContain("Judgment Day");
    expect(sections).toContain("Partners / Slack");
  });

  it("keeps every KB content line in exactly one chunk (R1 content unchanged)", () => {
    const chunks = chunkKB(KNOWLEDGE_BASE);
    const lines = KNOWLEDGE_BASE.split("\n");

    // Drop the H1 title and everything before the first H2 heading.
    const firstHeading = lines.findIndex((l) => headingRe.test(l));
    const contentLines = lines.slice(firstHeading).filter((l) => l.trim() !== "");

    const occurrences = new Map();
    for (const chunk of chunks) {
      const chunkLines = new Set(chunk.text.split("\n"));
      for (const line of chunkLines) {
        occurrences.set(line, (occurrences.get(line) ?? 0) + 1);
      }
    }

    for (const line of contentLines) {
      const trimmed = line.trim();
      if (trimmed === "" || /^#{1,6}\s+/.test(trimmed)) {
        expect(occurrences.has(line), `line missing from chunks: ${line}`).toBe(true);
        continue;
      }
      expect(occurrences.get(line), `line missing from chunks: ${line}`).toBe(1);
    }
  });

  it("folds container headings into the first child chunk as context", () => {
    const chunks = chunkKB(KNOWLEDGE_BASE);
    const roleChunk = chunks.find((c) => c.text.includes("Full Stack Tech Lead (Hands-on)"));
    expect(roleChunk?.text).toContain("## Experiencia Profesional");
    expect(roleChunk?.text).toContain("### LIBRODEPASES");
  });

  it("returns zero chunks for an empty KB", () => {
    expect(chunkKB("")).toEqual([]);
    expect(chunkKB("   \n  \n")).toEqual([]);
    expect(chunkKB("# Only a document title")).toEqual([]);
  });

  it("chunks sections with no children as whole sections", () => {
    const chunks = chunkKB(KNOWLEDGE_BASE);
    const overview = chunks.find((c) => c.section === "Overview");
    expect(overview?.text).toContain("Ramiro Cerdá");
    expect(overview?.text).toContain("La Plata, Buenos Aires, Argentina");
  });

  it("folds the preamble into the first chunk with foldPreamble", () => {
    const text = "# Título\n\nIntro suelta.\n\n### Sección A\n\nCuerpo A.\n\n### Sección B\n\nCuerpo B.";
    const chunks = chunkKB(text, { idPrefix: "note", foldPreamble: true });
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toContain("# Título");
    expect(chunks[0].text).toContain("Intro suelta.");
    expect(chunks[1].text).not.toContain("Intro suelta.");
    expect(chunks.every((c) => c.id.startsWith("note-"))).toBe(true);
  });

  it("keeps prose-only documents as a single chunk with foldPreamble", () => {
    const chunks = chunkKB("# Solo intro\n\nPárrafo sin headings.", { idPrefix: "note", foldPreamble: true });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("Párrafo sin headings.");
    expect(chunks[0].id.startsWith("note-")).toBe(true);
  });
});

describe("stripFrontmatter", () => {
  it("extracts quoted front matter keys and strips them from the body", () => {
    const md = `---\ntitle: "Mi nota"\ndescription: 'Sub título'\npubDate: 2026-09-08\ndraft: false\n---\n\n# Cuerpo\n`;
    const { frontmatter, body } = stripFrontmatter(md);
    expect(frontmatter.title).toBe("Mi nota");
    expect(frontmatter.description).toBe("Sub título");
    expect(body.trimStart().startsWith("# Cuerpo")).toBe(true);
  });

  it("passes through documents without front matter", () => {
    const md = "# Sin frontmatter\n\ntexto";
    expect(stripFrontmatter(md)).toEqual({ frontmatter: null, body: md });
  });
});

describe("chunkNote", () => {
  it("prefixes every chunk with the note title and keeps ids content-addressed", () => {
    const md = `---\ntitle: "Roles en el SDLC"\ndescription: "Qué pasa con QA y devs"\n---\n\nIntro del post.\n\n### QA\nCuerpo QA.\n\n### Devs\nCuerpo Devs.\n`;
    const chunks = chunkNote(md);
    expect(chunks).toHaveLength(2);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith("# Roles en el SDLC")).toBe(true);
      expect(chunk.id).toMatch(/^note-[a-z0-9-]+-[0-9a-f]{8}$/);
      expect(chunk.id.endsWith(sha1Hex(chunk.text).slice(0, 8))).toBe(true);
    }
    expect(chunks[0].text).toContain("Intro del post.");
  });

  it("is deterministic for the real SDLC note in the repo", async () => {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const notePath = path.resolve(scriptDir, "..", "..", "..", "src", "content", "notes");
    const { readFile } = await import("node:fs/promises");
    const es = await readFile(path.join(notePath, "es", "el-fin-del-pipeline-agentes-adlc.md"), "utf8");
    const en = await readFile(path.join(notePath, "en", "el-fin-del-pipeline-agentes-adlc.md"), "utf8");
    const esChunks = chunkNote(es);
    const enChunks = chunkNote(en);
    expect(esChunks.length).toBeGreaterThanOrEqual(5);
    expect(enChunks.length).toBeGreaterThanOrEqual(5);
    const esIds = esChunks.map((c) => c.id);
    const enIds = enChunks.map((c) => c.id);
    expect(esIds).not.toEqual(enIds);
    for (const chunk of esChunks) expect(chunk.text).toContain("código lo generan los agentes");
  });

  it("carries the published route so the bot can link the note", () => {
    const md = `---\ntitle: "Factory engineering"\n---\n\nIntro.\n\n### Qué es\nCuerpo.\n`;
    const chunks = chunkNote(md, { filePath: "src/content/notes/es/factory-engineering.md" });
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.slug).toBe("factory-engineering");
      expect(chunk.locale).toBe("es");
      expect(chunk.url).toBe("/notes/factory-engineering");
      expect(chunk.urlAlt).toBe("/en/notes/factory-engineering");
    }
  });

  it("prefers the frontmatter slug when the note declares one", () => {
    const md = `---\ntitle: "Con slug"\nslug: "otro-slug"\n---\n\n### Sección\nCuerpo.\n`;
    const chunks = chunkNote(md, { filePath: "src/content/notes/es/con-slug.md" });
    expect(chunks[0].slug).toBe("otro-slug");
    expect(chunks[0].url).toBe("/notes/otro-slug");
    expect(chunks[0].urlAlt).toBe("/en/notes/otro-slug");
  });

  it("keeps the chunks route-free when no file path is known", () => {
    const chunks = chunkNote(`---\ntitle: "Suelta"\n---\n\n### Sección\nCuerpo.\n`);
    expect(chunks[0].url).toBeUndefined();
    expect(chunks[0].slug).toBeUndefined();
  });
});

describe("noteRoute", () => {
  it("maps the Spanish and English locale dirs to their site routes", () => {
    expect(noteRoute("src/content/notes/es/factory-engineering.md")).toEqual({
      slug: "factory-engineering",
      locale: "es",
      url: "/notes/factory-engineering",
      urlAlt: "/en/notes/factory-engineering",
    });
    expect(noteRoute("src/content/notes/en/factory-engineering.md")).toEqual({
      slug: "factory-engineering",
      locale: "en",
      url: "/en/notes/factory-engineering",
      urlAlt: "/notes/factory-engineering",
    });
  });

  it("defaults to the Spanish route for notes outside a locale dir", () => {
    expect(noteRoute("src/content/notes/legacy.md")).toMatchObject({
      slug: "legacy",
      locale: "es",
      url: "/notes/legacy",
      urlAlt: "/en/notes/legacy",
    });
  });

  it("honors a slug override, which is what the site route uses", () => {
    expect(noteRoute("src/content/notes/es/factory-engineering.md", "otro-slug")).toMatchObject({
      slug: "otro-slug",
      url: "/notes/otro-slug",
      urlAlt: "/en/notes/otro-slug",
    });
    expect(noteRoute("src/content/notes/en/factory-engineering.md", "otro-slug")).toMatchObject({
      slug: "otro-slug",
      locale: "en",
      url: "/en/notes/otro-slug",
      urlAlt: "/notes/otro-slug",
    });
  });
});

describe("globFiles", () => {
  const tempRoot = path.join(tmpdir(), "botardo-glob-test");

  async function makeFixture() {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(path.join(tempRoot, "src/content/notes/es"), { recursive: true });
    await mkdir(path.join(tempRoot, "src/content/notes/en"), { recursive: true });
    await mkdir(path.join(tempRoot, "src/content/notes/.hidden"), { recursive: true });
    await writeFile(path.join(tempRoot, "src/content/notes/es/a.md"), "a");
    await writeFile(path.join(tempRoot, "src/content/notes/en/b.md"), "b");
    await writeFile(path.join(tempRoot, "src/content/notes/.hidden/c.md"), "c");
    await writeFile(path.join(tempRoot, "src/content/notes/d.txt"), "d");
  }

  it("expands ** across nested dirs and skips hidden dirs and non-matching extensions", async () => {
    await makeFixture();
    const files = await globFiles(tempRoot, "src/content/notes/**/*.md");
    expect(files).toEqual([path.join(tempRoot, "src/content/notes/en/b.md"), path.join(tempRoot, "src/content/notes/es/a.md")]);
    await rm(tempRoot, { recursive: true, force: true });
  });
});

describe("diffIds", () => {
  it("reports missing and stale ids in both directions", () => {
    const { missing, stale } = diffIds(["a", "b", "c"], ["b", "c", "d"]);
    expect(missing).toEqual(["a"]);
    expect(stale).toEqual(["d"]);
  });

  it("reports an empty diff when in sync", () => {
    expect(diffIds(["a", "b"], ["b", "a"])).toEqual({ missing: [], stale: [] });
  });
});

describe("loadKBChunks", () => {
  it("chunks curated + markdown sources with per-source ids from kb-sources.json", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-kb-test-"));
    try {
      await mkdir(path.join(root, "kb"), { recursive: true });
      await writeFile(
        path.join(root, "kb", "kb.mjs"),
        `export const KNOWLEDGE_BASE = "## Overview\\n- dato\\n";\n`,
      );
      await mkdir(path.join(root, "src", "content", "notes"), { recursive: true });
      await writeFile(
        path.join(root, "src", "content", "notes", "n1.md"),
        `---\ntitle: "Nota 1"\n---\n\n### Sección\nCuerpo.\n`,
      );
      await mkdir(path.join(root, "workers", "chat-worker"), { recursive: true });
      await writeFile(
        path.join(root, "workers", "chat-worker", "kb-sources.json"),
        JSON.stringify({
          sources: [
            { id: "kb", type: "curated", file: "kb/kb.mjs" },
            { id: "notes", type: "markdown", glob: "src/content/notes/*.md" },
          ],
        }),
      );

      const chunks = await loadKBChunks(root);
      const bySource = Object.groupBy(chunks, (c) => c.source);
      expect(bySource.kb).toHaveLength(1);
      expect(bySource.kb[0].id).toMatch(/^kb-overview-[0-9a-f]{8}$/);
      expect(bySource.kb[0].text).toContain("- dato");
      expect(bySource.notes).toHaveLength(1);
      expect(bySource.notes[0].text).toContain("# Nota 1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("attaches the published note route to markdown chunks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-kb-route-"));
    try {
      await mkdir(path.join(root, "src", "content", "notes", "es"), { recursive: true });
      await mkdir(path.join(root, "src", "content", "notes", "en"), { recursive: true });
      const note = `---\ntitle: "Factory engineering"\n---\n\n### Qué es\nCuerpo ES.\n`;
      await writeFile(path.join(root, "src", "content", "notes", "es", "factory-engineering.md"), note);
      await writeFile(path.join(root, "src", "content", "notes", "en", "factory-engineering.md"), note);
      await mkdir(path.join(root, "workers", "chat-worker"), { recursive: true });
      await writeFile(
        path.join(root, "workers", "chat-worker", "kb-sources.json"),
        JSON.stringify({ sources: [{ id: "notes", type: "markdown", glob: "src/content/notes/**/*.md" }] }),
      );

      const chunks = await loadKBChunks(root);
      const esChunk = chunks.find((c) => c.locale === "es");
      const enChunk = chunks.find((c) => c.locale === "en");
      expect(esChunk.url).toBe("/notes/factory-engineering");
      expect(esChunk.urlAlt).toBe("/en/notes/factory-engineering");
      expect(enChunk.url).toBe("/en/notes/factory-engineering");
      expect(enChunk.urlAlt).toBe("/notes/factory-engineering");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("projectRoute", () => {
  it("maps project slugs to the published /work routes", () => {
    expect(projectRoute("agent-scout", "es")).toEqual({
      slug: "agent-scout",
      lang: "es",
      url: "/work/agent-scout",
      urlAlt: "/en/work/agent-scout",
    });
    expect(projectRoute("agent-scout", "en")).toEqual({
      slug: "agent-scout",
      lang: "en",
      url: "/en/work/agent-scout",
      urlAlt: "/work/agent-scout",
    });
  });
});

describe("buildProjectChunks", () => {
  // Real project file shape: pure YAML frontmatter, nested es/en objects,
  // closing `---` possibly at EOF without a trailing newline.
  const project = `---
slug: agent-scout
year: "2026"
featured: true
es:
  title: "Agent Scout — Asistente de scouting"
  summary: "Asistente de scouting que llama a la API real."
  problem: "El scouting vive de preguntas difusas."
  what: "Construí el agente con Google ADK y 9 tools."
  highlights:
    - "9 tools sobre la API real."
    - "Evals determinísticos sin juez LLM."
  stack: ["Google ADK", "LiteLLM"]
en:
  title: "Agent Scout — Scouting assistant"
  summary: "A scouting assistant that calls the real API."
  what: "I built the agent with Google ADK and 9 tools."
  highlights:
    - "9 tools over the real API."
  stack: ["Google ADK", "LiteLLM"]
---`;

  it("builds one populated chunk per language from pure frontmatter", () => {
    const chunks = buildProjectChunks(project, { filePath: "src/content/projects/agent-scout.md" });
    expect(chunks).toHaveLength(2);

    const es = chunks[0];
    expect(es.lang).toBe("es");
    expect(es.slug).toBe("agent-scout");
    expect(es.section).toBe("Agent Scout — Asistente de scouting");
    expect(es.text).toContain("# Agent Scout — Asistente de scouting");
    expect(es.text).toContain("Asistente de scouting que llama a la API real.");
    expect(es.text).toContain("**Problema:** El scouting vive de preguntas difusas.");
    expect(es.text).toContain("**Qué hice:** Construí el agente con Google ADK y 9 tools.");
    expect(es.text).toContain("- 9 tools sobre la API real.");
    expect(es.text).toContain("**Stack:** Google ADK, LiteLLM");
    expect(es.text).toContain("**Página:** /work/agent-scout");
    expect(es.url).toBe("/work/agent-scout");
    expect(es.urlAlt).toBe("/en/work/agent-scout");

    const en = chunks[1];
    expect(en.lang).toBe("en");
    expect(en.text).toContain("**What I did:** I built the agent with Google ADK and 9 tools.");
    expect(en.text).toContain("**Page:** /en/work/agent-scout");
    expect(en.url).toBe("/en/work/agent-scout");
    expect(en.urlAlt).toBe("/work/agent-scout");
  });

  it("uses content-addressed ids stable across runs", () => {
    const a = buildProjectChunks(project, { filePath: "src/content/projects/agent-scout.md" });
    const b = buildProjectChunks(project, { filePath: "src/content/projects/agent-scout.md" });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    for (const chunk of a) {
      expect(chunk.id).toMatch(/^project-(es|en)-agent-scout-[0-9a-f]{8}$/);
      expect(chunk.id.endsWith(sha1Hex(chunk.text).slice(0, 8))).toBe(true);
    }
  });

  it("derives the slug from the file path when frontmatter omits it", () => {
    const chunks = buildProjectChunks("---\nes:\n  title: \"Solo título\"\n---", {
      filePath: "src/content/projects/deslizado.md",
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].slug).toBe("deslizado");
    expect(chunks[0].id.startsWith("project-es-deslizado-")).toBe(true);
  });

  it("returns zero chunks without frontmatter or localized blocks", () => {
    expect(buildProjectChunks("# Not frontmatter\n\nbody")).toEqual([]);
    expect(buildProjectChunks("---\nyear: \"2026\"\n---")).toEqual([]);
  });

  it("tolerates a closing --- at EOF without a trailing newline", () => {
    expect(buildProjectChunks(project.trimEnd())).toHaveLength(2);
  });

  it("indexes every real project file in es and en with its /work route", async () => {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const projectsDir = path.resolve(scriptDir, "..", "..", "..", "src", "content", "projects");
    const fs = await import("node:fs/promises");
    const mdFiles = (await fs.readdir(projectsDir)).filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(16);
    for (const file of mdFiles) {
      const slug = file.replace(/\.md$/, "");
      const md = await fs.readFile(path.join(projectsDir, file), "utf8");
      const chunks = buildProjectChunks(md, { filePath: `src/content/projects/${file}` });
      expect(chunks, slug).toHaveLength(2);
      expect(chunks[0].lang, slug).toBe("es");
      expect(chunks[1].lang, slug).toBe("en");
      for (const chunk of chunks) {
        // Every localized block must actually be populated (this is the bug
        // that silently dropped all projects from the index).
        expect(chunk.text.length, slug).toBeGreaterThan(300);
        const pageLine =
          chunk.lang === "es" ? `**Página:** /work/${slug}` : `**Page:** /en/work/${slug}`;
        expect(chunk.text, slug).toContain(pageLine);
        expect(chunk.url, slug).toBe(chunk.lang === "es" ? `/work/${slug}` : `/en/work/${slug}`);
        expect(chunk.urlAlt, slug).toBe(chunk.lang === "es" ? `/en/work/${slug}` : `/work/${slug}`);
      }
    }
  });
});

describe("loadKBChunks with projects source", () => {
  it("loads project chunks with the projects source type and their route", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-kb-projects-"));
    try {
      await mkdir(path.join(root, "src", "content", "projects"), { recursive: true });
      await writeFile(
        path.join(root, "src", "content", "projects", "agent-general.md"),
        `---\nslug: agent-general\nes:\n  title: "Agent General"\n  summary: "Root agent multi-agente."\n  what: "Google ADK con 14 sub-agentes."\nen:\n  title: "Agent General"\n  summary: "Multi-agent root assistant."\n---\n`,
      );
      await mkdir(path.join(root, "workers", "chat-worker"), { recursive: true });
      await writeFile(
        path.join(root, "workers", "chat-worker", "kb-sources.json"),
        JSON.stringify({ sources: [{ id: "projects", type: "projects", glob: "src/content/projects/**/*.md" }] }),
      );

      const chunks = await loadKBChunks(root);
      expect(Object.groupBy(chunks, (c) => c.source).projects).toHaveLength(2);
      const esChunk = chunks.find((c) => c.lang === "es");
      const enChunk = chunks.find((c) => c.lang === "en");
      expect(esChunk.id).toMatch(/^project-es-agent-general-[0-9a-f]{8}$/);
      expect(esChunk.text).toContain("Root agent multi-agente.");
      expect(esChunk.url).toBe("/work/agent-general");
      expect(enChunk.url).toBe("/en/work/agent-general");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("draft notes", () => {
  it("reads the draft flag from the leading front matter only", () => {
    expect(isDraftNote(`---\ntitle: "X"\ndraft: true\n---\n\nBody.\n`)).toBe(true);
    expect(isDraftNote(`---\ntitle: "X"\ndraft: TRUE\n---\n\nBody.\n`)).toBe(true);
    expect(isDraftNote(`---\ntitle: "X"\ndraft: false\n---\n\nBody.\n`)).toBe(false);
    expect(isDraftNote(`---\ntitle: "X"\n---\n\nBody.\n`)).toBe(false);
    // A body that merely mentions the flag is prose, not front matter.
    expect(isDraftNote(`---\ntitle: "X"\n---\n\nI wrote draft: true in the front matter.\n`)).toBe(false);
    expect(isDraftNote(`# No front matter\n\ndraft: true\n`)).toBe(false);
  });

  it("keeps draft notes out of the loaded chunk set", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-kb-draft-"));
    try {
      await mkdir(path.join(root, "src", "content", "notes", "es"), { recursive: true });
      await writeFile(
        path.join(root, "src", "content", "notes", "es", "published.md"),
        `---\ntitle: "Published"\ndraft: false\n---\n\n### Section\nPublic body.\n`,
      );
      await writeFile(
        path.join(root, "src", "content", "notes", "es", "borrador.md"),
        `---\ntitle: "Unreleased"\ndraft: true\n---\n\n### Section\nDRAFT-MUST-NOT-BE-INDEXED\n`,
      );
      await mkdir(path.join(root, "workers", "chat-worker"), { recursive: true });
      await writeFile(
        path.join(root, "workers", "chat-worker", "kb-sources.json"),
        JSON.stringify({
          sources: [{ id: "notes", type: "markdown", glob: "src/content/notes/**/*.md" }],
        }),
      );

      const chunks = await loadKBChunks(root);
      expect(chunks.some((c) => c.text.includes("# Published"))).toBe(true);
      expect(chunks.some((c) => c.text.includes("Unreleased"))).toBe(false);
      expect(chunks.some((c) => c.text.includes("DRAFT-MUST-NOT-BE-INDEXED"))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
