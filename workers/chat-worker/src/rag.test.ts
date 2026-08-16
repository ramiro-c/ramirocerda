import { describe, expect, it } from "vitest";

import {
  buildRagPrompt,
  extractEmbedding,
  filterChunks,
  MAX_CHUNKS,
  type VectorizeMatch,
} from "./rag";

const IDENTITY = "Sos Botardo, el asistente virtual de la web personal de Ramiro Cerdá.";

function match(score: number, id = `kb-${score}`): VectorizeMatch {
  return { id, score, metadata: { section: "Overview", source: "knowledge-base", idx: 0, text: `texto de ${id}` } };
}

describe("filterChunks (D3)", () => {
  it("drops matches below the similarity threshold", () => {
    const result = filterChunks([match(0.5), match(0.2), match(0.35)], 0.3);
    expect(result.map((c) => c.score)).toEqual([0.5, 0.35]);
  });

  it("keeps matches exactly at the threshold", () => {
    const result = filterChunks([match(0.3)], 0.3);
    expect(result).toHaveLength(1);
  });

  it("caps injected chunks at MAX_CHUNKS (4)", () => {
    const result = filterChunks([0.9, 0.8, 0.7, 0.6, 0.5, 0.4].map(match), 0.3);
    expect(result).toHaveLength(MAX_CHUNKS);
    expect(MAX_CHUNKS).toBe(4);
  });

  it("returns an empty array for no relevant matches", () => {
    expect(filterChunks([match(0.1), match(0.05)], 0.3)).toEqual([]);
  });
});

describe("extractEmbedding", () => {
  it("extracts from array-of-arrays results (Workers AI)", () => {
    expect(extractEmbedding({ data: [[0.1, 0.2, 0.3]] })).toEqual([0.1, 0.2, 0.3]);
  });

  it("extracts from { embedding } wrapper results", () => {
    expect(extractEmbedding({ data: [{ embedding: [0.5, 0.6] }] })).toEqual([0.5, 0.6]);
  });

  it("throws when no vector data is present", () => {
    expect(() => extractEmbedding({ data: [] })).toThrow();
    expect(() => extractEmbedding({})).toThrow();
  });
});

describe("buildRagPrompt (R2/R3/R4/R6)", () => {
  function turn(role: "user" | "assistant", i: number) {
    return { role, content: `turn ${i}` };
  }

  it("injects the last 10 history turns when more are provided (R6)", () => {
    const history = Array.from({ length: 12 }, (_, i) => turn(i % 2 === 0 ? "user" : "assistant", i));
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [match(0.6)], language: "es", history, message: "¿Dónde trabajás?" });
    expect(messages).toHaveLength(12); // system + 10 history + user
    expect(messages[1].content).toBe("turn 2"); // first 2 turns sliced off
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "¿Dónde trabajás?" });
  });

  it("includes all turns when fewer than 10 exist (R6)", () => {
    const history = [turn("user", 1), turn("assistant", 2), turn("user", 3)];
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [match(0.6)], language: "es", history, message: "hola" });
    expect(messages).toHaveLength(5); // system + 3 history + user
  });

  it("injects retrieved chunk text as the only factual context (R2/R3)", () => {
    const chunk = { ...match(0.6), metadata: { section: "Experiencia", text: "En LDP trabaja como Tech Lead hands-on." } };
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [chunk], language: "en", message: "Where do you work?" });
    const system = messages[0].content;
    expect(system).toContain("En LDP trabaja como Tech Lead hands-on.");
    expect(system).toContain("=== CONTEXTO RECUPERADO");
    expect(system).toContain("basate EXCLUSIVAMENTE en el CONTEXTO RECUPERADO");
  });

  it("adds the firm language instruction (R4, D7)", () => {
    const es = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [match(0.6)], language: "es", message: "hola" })[0].content;
    const en = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [match(0.6)], language: "en", message: "hi" })[0].content;
    expect(es).toContain("IDIOMA OBLIGATORIO (regla firme, no opcional)");
    expect(es).toContain("español rioplatense");
    expect(en).toContain("MANDATORY LANGUAGE RULE (firm, not optional)");
    expect(en).toContain("English");
  });

  it("keeps the identity prompt first and the question last", () => {
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [], language: "es", message: "¿Quién sos?" });
    expect(messages[0].role).toBe("system");
    expect(messages[0].content.startsWith("Sos Botardo")).toBe(true);
    expect(messages[messages.length - 1]).toEqual({ role: "user", content: "¿Quién sos?" });
  });

  it("marks empty retrieval and keeps the no-invent guardrail (R2/R8)", () => {
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [], language: "es", message: "contame un chiste" });
    const system = messages[0].content;
    expect(system).toContain("(sin contexto recuperado)");
    expect(system).toContain("basate EXCLUSIVAMENTE en el CONTEXTO RECUPERADO");
    expect(system).toContain("Si la respuesta no está en el contexto, decilo con naturalidad");
  });
});
