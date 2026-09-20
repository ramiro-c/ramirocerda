import { describe, it, expect } from "vitest";

import { chunkKB, chunkNote, diffIds, globFiles, loadKBChunks, sha1Hex, stripFrontmatter } from "./populate-index.mjs";
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
    expect(chunks.length).toBe(22);

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
});
