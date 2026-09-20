import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";

interface Datapoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

function makeEnv(opts: {
  matches?: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
  generationStatus?: number;
  generationContent?: string;
}) {
  const datapoints: Datapoint[] = [];
  const env = {
    AI: {
      run: (_model: string, _input: unknown) =>
        Promise.resolve({ data: [Array.from({ length: 1024 }, (_, i) => i * 0.001)] }),
    },
    VECTORIZE: {
      query: () => Promise.resolve({ matches: opts.matches ?? [] }),
    },
    ANALYTICS: {
      writeDataPoint: (point: Datapoint) => {
        datapoints.push(point);
      },
    },
    OPENCODE_GO_API_KEY: "secret-key",
    RAG_ENABLED: "true",
    TOP_K: "5",
    SIMILARITY_THRESHOLD: "0.30",
    GENERATION_MODEL: "deepseek-v4-flash",
    OPENCODE_GO_ENDPOINT: "https://opencode.example/v1/chat/completions",
    EMBEDDING_MODEL: "@cf/baai/bge-m3",
  };
  return { env, datapoints };
}

function makeRequest(message: string, sessionId?: string): Request {
  return new Request("https://worker.example/ask", {
    method: "POST",
    headers: { Origin: "https://ramirocerda.com.ar", "Content-Type": "application/json" },
    body: JSON.stringify({ message, ...(sessionId ? { sessionId } : {}) }),
  });
}

describe("chat usage analytics data points", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes one ok datapoint per successful question with retrieval + generation metrics", async () => {
    const { env, datapoints } = makeEnv({
      matches: [
        { id: "kb-a", score: 0.55, metadata: { section: "Overview", text: "texto" } },
        { id: "kb-b", score: 0.44, metadata: { section: "Stack", text: "texto" } },
      ],
      generationContent: "Respuesta",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Respuesta" } }] }), { status: 200 }),
      ),
    );

    const res = await worker.fetch(
      makeRequest("¿Qué proyectos hizo Ramiro?", "conv-123"),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(datapoints).toHaveLength(1);

    const point = datapoints[0];
    expect(point.indexes?.[0]).toBe("conv-123");
    expect(point.blobs?.[0]).toBe("es");
    expect(point.blobs?.[1]).toBe("ok");
    expect(point.blobs?.[2]).toBe("¿Qué proyectos hizo Ramiro?");
    expect(point.doubles?.[0]).toBe(2);
    expect(point.doubles?.[1]).toBeCloseTo(0.55);
    expect(point.doubles?.[2]).toBeGreaterThanOrEqual(0);
    expect(point.doubles?.[3]).toBeGreaterThanOrEqual(0);
  });

  it("writes a zero-chunk datapoint for off-topic questions (no_info signal)", async () => {
    const { env, datapoints } = makeEnv({ matches: [], generationContent: "No tengo ese dato" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "No tengo ese dato" } }] }), { status: 200 }),
      ),
    );

    const res = await worker.fetch(
      makeRequest("What is the capital of France?", "conv-noise"),
      env as never,
    );
    expect(res.status).toBe(200);
    expect(datapoints[0]?.indexes?.[0]).toBe("conv-noise");
    expect(datapoints[0]?.blobs).toEqual(["en", "ok", "What is the capital of France?"]);
    expect(datapoints[0]?.doubles?.slice(0, 2)).toEqual([0, 0]);
    expect(datapoints[0]?.doubles?.length).toBe(4);
  });

  it("writes a rate_limited datapoint when generation is throttled", async () => {
    const { env, datapoints } = makeEnv({
      matches: [{ id: "kb-a", score: 0.5, metadata: { text: "t" } }],
      generationStatus: 429,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate", { status: 429 })));

    const res = await worker.fetch(makeRequest("¿Dónde trabajás?"), env as never);
    expect(res.status).toBe(429);
    expect(datapoints[0]?.blobs?.[1]).toBe("rate_limited");
    expect(datapoints[0]?.doubles?.[0]).toBe(1);
  });

  it("writes a model_error datapoint when generation fails", async () => {
    const { env, datapoints } = makeEnv({ generationStatus: 401 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 401 })));

    const res = await worker.fetch(makeRequest("¿Quién sos?", "conv-err"), env as never);
    expect(res.status).toBe(500);
    expect(datapoints[0]?.indexes?.[0]).toBe("conv-err");
    expect(datapoints[0]?.blobs?.slice(0, 2)).toEqual(["es", "model_error"]);
  });

  it("falls back to a generated sessionId in the datapoint index", async () => {
    const { env, datapoints } = makeEnv({ matches: [], generationContent: "Ok" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "Ok" } }] }), { status: 200 }),
      ),
    );

    await worker.fetch(makeRequest("Hola"), env as never);
    expect(datapoints[0]?.indexes?.[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
