import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

// @ts-expect-error plain ESM script without types
import { EMBEDDING_MODEL } from "../scripts/populate-index.mjs";
import { buildLocalIndex, cosine, localVectorize } from "./local-index";

describe("cosine", () => {
  it("is 1 for identical vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBe(0);
  });
});

describe("localVectorize", () => {
  const entries = [
    { id: "b", values: [1, 0], metadata: { text: "b" } },
    { id: "a", values: [1, 0], metadata: { text: "a" } },
    { id: "c", values: [0, 1], metadata: { text: "c" } },
    { id: "d", values: [-1, 0], metadata: { text: "d" } },
  ];

  it("returns topK sorted by score descending, ties broken by id ascending", async () => {
    const { matches } = await localVectorize(entries).query([1, 0], { topK: 3 });
    expect(matches.map((m) => m.id)).toEqual(["a", "b", "c"]);
    expect(matches.map((m) => m.score)).toEqual([1, 1, 0]);
  });

  it("keeps metadata by default and leaves it out with returnMetadata none", async () => {
    const index = localVectorize(entries);
    const all = await index.query([1, 0], { topK: 1 });
    expect(all.matches[0]).toEqual({ id: "a", score: 1, metadata: { text: "a" } });
    const none = await index.query([1, 0], { topK: 1, returnMetadata: "none" });
    expect(none.matches[0]).toEqual({ id: "a", score: 1 });
  });
});

describe("buildLocalIndex", () => {
  // Same fixture style as the loadKBChunks tests in scripts/populate-index.test.mjs:
  // a curated source needs no dist/, so no site build is required here.
  async function makeFixture(): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), "botardo-local-index-"));
    await mkdir(path.join(root, "kb"), { recursive: true });
    await writeFile(path.join(root, "kb", "kb.mjs"), `export const KNOWLEDGE_BASE = "## Overview\\n- dato\\n";\n`);
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
    return root;
  }

  it("embeds every chunk on the first build and serves cosine queries", async () => {
    const root = await makeFixture();
    try {
      let calls = 0;
      const ai = {
        run: async (model: string, input: unknown) => {
          calls += 1;
          expect(model).toBe(EMBEDDING_MODEL);
          const texts = (input as { text: string[] }).text;
          return { data: texts.map((t) => [t.length, 1, 0]) };
        },
      };
      const cacheFile = path.join(root, "cache-dir", ".embed-cache.json");

      const first = await buildLocalIndex({ rootDir: root, ai, cacheFile });
      expect(first.chunkCount).toBe(2);
      expect(first.embedded).toBe(2);
      expect(calls).toBe(1);

      const { matches } = await first.query([1, 1, 0], { topK: 2 });
      expect(matches).toHaveLength(2);
      expect(matches[0].score).toBeGreaterThan(matches[1].score);
      for (const m of matches) {
        expect(m.score).toBeGreaterThan(0);
        expect(m.metadata?.source).toBeDefined();
        expect(String(m.metadata?.text).length).toBeGreaterThan(0);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("reuses the cache file: a second build makes zero ai.run calls", async () => {
    const root = await makeFixture();
    try {
      let calls = 0;
      const ai = {
        run: async (model: string, input: unknown) => {
          calls += 1;
          expect(model).toBe(EMBEDDING_MODEL);
          const texts = (input as { text: string[] }).text;
          return { data: texts.map((t) => [t.length, 1, 0]) };
        },
      };
      const cacheFile = path.join(root, ".embed-cache.json");

      const first = await buildLocalIndex({ rootDir: root, ai, cacheFile });
      expect(first.embedded).toBe(2);
      expect(calls).toBe(1);

      const second = await buildLocalIndex({ rootDir: root, ai, cacheFile });
      expect(second.chunkCount).toBe(2);
      expect(second.embedded).toBe(0);
      expect(calls).toBe(1);
      const { matches } = await second.query([1, 1, 0], { topK: 1 });
      expect(matches).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
