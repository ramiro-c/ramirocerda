import { describe, it, expect } from "vitest";

import { chunkKB, sha1Hex } from "./populate-index.mjs";
import { KNOWLEDGE_BASE } from "./knowledge-base.js";

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

  it("splits the real KB into heading-boundary chunks (14)", () => {
    const chunks = chunkKB(KNOWLEDGE_BASE);
    expect(chunks.length).toBe(14);

    const sections = chunks.map((c) => c.section);
    expect(sections).toContain("Overview");
    expect(sections).toContain("Stack Técnico");
    expect(sections).toContain("Educación");
    expect(sections).toContain("Soccer Analytics Agent");
    expect(sections).toContain("Mundial 2026 — Soccer Analytics / World Cup Companion");
    expect(sections).toContain("Sitio Web y Arquitectura del Bot");
    expect(sections).toContain("Google Cloud — AI Agents Path (completo, jun–jul 2026)");
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
});
