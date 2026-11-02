import assert from "node:assert/strict";
import { test } from "node:test";

import { askBotardo, BotardoError, errorText, parseEvents } from "./botardo-stream.mjs";

const enc = new TextEncoder();
function sse(blocks, { hangAfter = false } = {}) {
  return (_url, init) =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(c) {
            for (const b of blocks) c.enqueue(enc.encode(b));
            if (hangAfter) init.signal.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
            else c.close();
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
}
const ev = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

test("parseEvents keeps a split block for the next chunk", () => {
  const seen = [];
  const rest = parseEvents('event: delta\ndata: {"text":"Ho"}\n\nevent: del', (e, d) => seen.push([e, d]));
  assert.deepEqual(seen, [["delta", { text: "Ho" }]]);
  parseEvents(rest + 'ta\ndata: {"text":"la"}\n\n', (e, d) => seen.push([e, d]));
  assert.deepEqual(seen.at(-1), ["delta", { text: "la" }]);
});

test("streams meta, deltas and done", async () => {
  const metas = [];
  const parts = [];
  const result = await askBotardo({
    url: "x",
    payload: {},
    fetchImpl: sse([ev("meta", { offerContact: true }), ev("delta", { text: "Ho" }), ev("delta", { text: "la " }), ev("done", { reply: "Hola", offerContact: true })]),
    onMeta: (m) => metas.push(m),
    onDelta: (_t, soFar) => parts.push(soFar),
  });
  assert.deepEqual(result, { reply: "Hola", offerContact: true });
  assert.deepEqual(metas, [{ offerContact: true }]);
  assert.deepEqual(parts, ["Ho", "Hola "]);
});

test("falls back to the JSON contract", async () => {
  const fetchImpl = () => Promise.resolve(Response.json({ reply: "Hola", offerContact: false }));
  assert.deepEqual(await askBotardo({ url: "x", payload: {}, fetchImpl }), { reply: "Hola", offerContact: false });
});

test("maps JSON and SSE errors to codes", async () => {
  const r429 = () => Promise.resolve(Response.json({ error: "x", code: "RATE_LIMITED" }, { status: 429 }));
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: r429 }), (e) => e instanceof BotardoError && e.code === "RATE_LIMITED");
  const r500 = () => Promise.resolve(new Response("boom", { status: 502 }));
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: r500 }), (e) => e.code === "SERVER");
  const sseErr = sse([ev("meta", { offerContact: false }), ev("error", { code: "MODEL_ERROR", error: "x" })]);
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: sseErr }), (e) => e.code === "MODEL_ERROR");
  const cut = sse([ev("delta", { text: "Ho" })]);
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: cut }), (e) => e.code === "SERVER");
});

test("times out before the first byte", async () => {
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: hang, firstTokenMs: 10 }), (e) => e.code === "TIMEOUT");
});

test("times out an idle stream after the first token", async () => {
  const stalled = sse([ev("meta", { offerContact: false }), ev("delta", { text: "Ho" })], { hangAfter: true });
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: stalled, firstTokenMs: 1000, idleMs: 10 }), (e) => e.code === "TIMEOUT");
});

test("network failures are not timeouts", async () => {
  const down = () => Promise.reject(new TypeError("Failed to fetch"));
  await assert.rejects(askBotardo({ url: "x", payload: {}, fetchImpl: down }), (e) => e.code === "NETWORK");
});

test("errorText picks the localized string", () => {
  const s = { timeout: "t", network: "n", rateLimited: "r", server: "s" };
  assert.equal(errorText("TIMEOUT", s), "t");
  assert.equal(errorText("RATE_LIMITED", s), "r");
  assert.equal(errorText("MODEL_ERROR", s), "s");
  assert.equal(errorText("SERVER", s), "s");
});
