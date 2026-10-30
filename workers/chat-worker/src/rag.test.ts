import { describe, expect, it, vi } from "vitest";

import {
  buildRagPrompt,
  DEFAULT_RAG_RERANK_MODEL,
  extractEmbedding,
  filterChunks,
  MAX_CHUNKS,
  retrieveChunks,
  type VectorizeMatch,
} from "./rag";

const IDENTITY = "Sos Botardo, el asistente virtual de la web personal de Ramiro Cerdá.";

function match(score: number, id = `kb-${score}`): VectorizeMatch {
  return { id, score, metadata: { section: "Overview", source: "knowledge-base", idx: 0, text: `texto de ${id}` } };
}

function withText(score: number, id: string, text: string): VectorizeMatch {
  return { id, score, metadata: { section: "Educación", text } };
}

function ragEnv(
  opts: {
    matches?: VectorizeMatch[];
    rerankResult?: unknown;
    rerankError?: Error;
    on?: boolean;
    vars?: Record<string, string>;
  } = {},
) {
  const run = vi
    .fn()
    .mockImplementation(async (model: string) => {
      if (model === "@cf/baai/bge-m3") return { data: [[0.1, 0.2, 0.3]] };
      if (opts.rerankError) throw opts.rerankError;
      const raw = opts.rerankResult ?? { response: [] };
      return raw as { data?: unknown; response?: unknown };
    });
  const query = vi.fn(async (_vector: number[], _opts: { topK: number }) => ({
    matches: opts.matches ?? [],
  }));
  const env = {
    AI: { run },
    VECTORIZE: { query },
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    ...(opts.on ? { RAG_RERANK_MODEL: DEFAULT_RAG_RERANK_MODEL } : {}),
    ...(opts.vars ?? {}),
  };
  return { env, run, query };
}

describe("retrieveChunks with the reranker", () => {
  it("rescues a chunk the dense score could not let in, ordered by the reranker", async () => {
    const matches = [
      withText(0.42, "kb-overview-aa", "Ramiro Cerdá, Full-Stack Engineer."),
      withText(0.38, "kb-note-bb", "nota sobre determinismo y graders."),
      withText(0.285, "kb-educacion-cc", "Universidad Tecnológica Nacional FRLP, Ingeniería en Sistemas."),
    ];
    const { env, run, query } = ragEnv({
      on: true,
      matches,
      rerankResult: { response: [{ id: 2, score: 9e-4 }, { id: 0, score: 1e-6 }, { id: 1, score: 5e-7 }] },
    });
    const result = await retrieveChunks("¿Qué estudió Ramiro?", env);
    expect(result.map((c) => c.id)).toEqual(["kb-educacion-cc", "kb-overview-aa", "kb-note-bb"]);
    expect(result.map((c) => c.score)).toEqual([0.285, 0.42, 0.38]);
    // One embedding call, one reranker call with the question and full chunk texts.
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1][0]).toBe(DEFAULT_RAG_RERANK_MODEL);
    expect(run.mock.calls[1][1]).toEqual({
      query: "¿Qué estudió Ramiro?",
      contexts: matches.map((m) => ({ text: m.metadata?.text })),
      top_k: 3,
    });
    // Candidates come from the widened fetch, not TOP_K.
    expect(query.mock.calls[0][1].topK).toBe(20);
  });

  it("keeps the no-info gate: nothing above the dense threshold means no rerank call", async () => {
    const matches = [withText(0.2, "kb-a", "x"), withText(0.15, "kb-b", "y")];
    const { env, run } = ragEnv({ on: true, matches });
    expect(await retrieveChunks("¿qué color es el cielo?", env)).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1); // embedding only
  });

  it("fail-open: an invalid reranker answer keeps the dense order", async () => {
    const matches = [withText(0.42, "kb-a", "x"), withText(0.38, "kb-b", "y"), withText(0.31, "kb-c", "z")];
    for (const bad of [{ response: [{ id: 9, score: 1 }] }, { weird: true }]) {
      const { env } = ragEnv({ on: true, matches, rerankResult: bad });
      expect((await retrieveChunks("q", env)).map((c) => c.id)).toEqual(["kb-a", "kb-b", "kb-c"]);
    }
  });

  it("fail-open: a reranker network error keeps the dense order too", async () => {
    const matches = [withText(0.42, "kb-a", "x"), withText(0.38, "kb-b", "y")];
    const { env } = ragEnv({ on: true, matches, rerankError: new Error("boom") });
    expect((await retrieveChunks("q", env)).map((c) => c.id)).toEqual(["kb-a", "kb-b"]);
  });

  it("logs a chat.rerank_fallback event so a dead reranker is not silent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const matches = [withText(0.42, "kb-a", "x"), withText(0.38, "kb-b", "y")];
      const { env } = ragEnv({ on: true, matches, rerankError: new Error("boom") });
      await retrieveChunks("q", env);
      const events = log.mock.calls.map((c) => JSON.parse(String(c[0])));
      const fallback = events.find((e) => e.event === "chat.rerank_fallback");
      expect(fallback).toBeTruthy();
      expect(fallback.reason).toContain("boom");
      // The happy path stays quiet: no event when the reranker answers.
      log.mockClear();
      const { env: ok } = ragEnv({
        on: true,
        matches,
        rerankResult: { response: [{ id: 1, score: 9e-4 }, { id: 0, score: 1e-6 }] },
      });
      await retrieveChunks("q", ok);
      expect(log.mock.calls.some((c) => String(c[0]).includes("chat.rerank_fallback"))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });

  it("caps the reranked order at MAX_CHUNKS (6)", async () => {
    const matches = Array.from({ length: 8 }, (_, i) => withText(0.5 - i * 0.01, `kb-${i}`, `texto ${i}`));
    const { env } = ragEnv({
      on: true,
      matches,
      rerankResult: {
        response: Array.from({ length: 8 }, (_, i) => ({ id: 7 - i, score: 1e-4 - i * 1e-5 })),
      },
    });
    const result = await retrieveChunks("q", env);
    expect(result).toHaveLength(MAX_CHUNKS);
    expect(result.map((c) => c.id).join(",")).toBe("kb-7,kb-6,kb-5,kb-4,kb-3,kb-2");
  });

  it("stays off without RAG_RERANK_MODEL, exactly the dense-only path", async () => {
    const matches = [withText(0.42, "kb-a", "x"), withText(0.38, "kb-b", "y"), withText(0.2, "kb-c", "z")];
    const { env, run, query } = ragEnv({ matches });
    const result = await retrieveChunks("q", env);
    expect(result.map((c) => c.id)).toEqual(["kb-a", "kb-b"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1].topK).toBe(5);
  });

  it("RAG_RERANK_CANDIDATES widens the candidate fetch", async () => {
    const matches = [withText(0.42, "kb-a", "x")];
    const { env, query } = ragEnv({
      on: true,
      matches,
      rerankResult: { response: [{ id: 0, score: 1e-5 }] },
      vars: { RAG_RERANK_CANDIDATES: "50" },
    });
    await retrieveChunks("q", env);
    expect(query.mock.calls[0][1].topK).toBe(50);
  });
});

describe("filterChunks (D3)", () => {
  it("drops matches below the similarity threshold", () => {
    const result = filterChunks([match(0.5), match(0.2), match(0.35)], 0.3);
    expect(result.map((c) => c.score)).toEqual([0.5, 0.35]);
  });

  it("keeps matches exactly at the threshold", () => {
    const result = filterChunks([match(0.3)], 0.3);
    expect(result).toHaveLength(1);
  });

  it("caps injected chunks at MAX_CHUNKS (6)", () => {
    const result = filterChunks([0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3].map((score) => match(score)), 0.3);
    expect(result).toHaveLength(MAX_CHUNKS);
    expect(MAX_CHUNKS).toBe(6);
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

  it("labels note chunks with their published route so Botardo can link it", () => {
    const chunk = {
      ...match(0.6),
      metadata: {
        section: "Qué es factory engineering",
        text: "cuerpo de la nota",
        slug: "factory-engineering",
        locale: "es",
        url: "/notes/factory-engineering",
        urlAlt: "/en/notes/factory-engineering",
      },
    };
    const system = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [chunk], language: "es", message: "¿qué onda factory engineering?" })[0]
      .content;
    expect(system).toContain("nota: /notes/factory-engineering");
    expect(system).toContain("/en/notes/factory-engineering");
  });

  it("omits the note label for chunks that are not a note", () => {
    const messages = buildRagPrompt({ identityPrompt: IDENTITY, chunks: [match(0.6)], language: "es", message: "¿Quién sos?" });
    expect(messages[0].content).not.toContain("nota:");
  });

  it("renders the note route as an absolute URL when the site origin is known", () => {
    const chunk = {
      ...match(0.6),
      metadata: {
        section: "Qué es",
        text: "cuerpo",
        url: "/notes/factory-engineering",
        urlAlt: "/en/notes/factory-engineering",
      },
    };
    const system = buildRagPrompt({
      identityPrompt: IDENTITY,
      chunks: [chunk],
      language: "es",
      message: "¿qué onda factory engineering?",
      siteOrigin: "https://ramirocerda.com.ar",
    })[0].content;
    // Absolute, because the widget only auto-links http(s) URLs.
    expect(system).toContain("nota: https://ramirocerda.com.ar/notes/factory-engineering");
    expect(system).toContain("https://ramirocerda.com.ar/en/notes/factory-engineering");
  });
});
