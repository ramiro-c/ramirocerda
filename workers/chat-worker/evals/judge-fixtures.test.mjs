// Grounding checks for the eval data: fixture snippets and expected chunk ids
// must come from the KB the worker actually indexes (kb-sources.json), so no
// eval label rests on invented content.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadKBChunks } from "../scripts/populate-index.mjs";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(EVAL_DIR, "..", "..", "..");
const norm = (s) => s.replace(/\s+/g, " ").trim();
const readJson = (name) => JSON.parse(readFileSync(path.join(EVAL_DIR, name), "utf8"));
const matching = (chunks, prefix) => chunks.filter((c) => c.id === prefix || c.id.startsWith(`${prefix}-`));

describe("eval data is grounded in the indexed KB", () => {
  it("every fixture snippet is a verbatim excerpt of the chunk it names", async () => {
    const chunks = await loadKBChunks(ROOT_DIR);
    const { claimSupport } = readJson("judge-fixtures.json");
    for (const fixture of claimSupport) {
      for (const snippet of fixture.snippets) {
        const found = matching(chunks, snippet.chunk).some((c) => norm(c.text).includes(norm(snippet.text)));
        expect(found, `${fixture.id}: ${snippet.chunk}`).toBe(true);
      }
    }
  });

  it("every expectedChunks prefix in cases.json exists in the KB", async () => {
    const chunks = await loadKBChunks(ROOT_DIR);
    const { cases } = readJson("cases.json");
    for (const c of cases) {
      for (const prefix of c.expected.expectedChunks ?? []) {
        expect(matching(chunks, prefix).length, `${c.id}: ${prefix}`).toBeGreaterThan(0);
      }
    }
  });

  it("near_miss cases name the relevant chunk and are labeled unanswerable", () => {
    const { cases } = readJson("cases.json");
    const nearMiss = cases.filter((c) => c.expected.unanswerableKind === "near_miss");
    expect(nearMiss.length).toBeGreaterThanOrEqual(4);
    for (const c of nearMiss) {
      expect(c.expected.answerable).toBe(false);
      expect(c.expected.expectedChunks?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
