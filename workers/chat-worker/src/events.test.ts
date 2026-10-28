import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";
import { INSERT_EVENT_SQL, validateEventBody } from "./events";

const NOW = () => "2026-10-28T19:00:00.000Z";

describe("validateEventBody", () => {
  it("accepts a cta_click with slugs, visitor and path", () => {
    const result = validateEventBody(
      {
        type: "cta_click",
        ctaId: "primary",
        position: "hero",
        visitorId: "8f14e45f-ceea-4e7a-9b2a-1f0e3c1d2b3a",
        visitorType: "returning",
        lang: "en",
        path: "/en/",
      },
      NOW,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        type: "cta_click",
        ctaId: "primary",
        position: "hero",
        origin: null,
        visitorId: "8f14e45f-ceea-4e7a-9b2a-1f0e3c1d2b3a",
        visitorType: "returning",
        lang: "en",
        path: "/en/",
        createdAt: NOW(),
      },
    });
  });

  it("accepts a bare visit and normalizes unknown visitorType/lang", () => {
    const result = validateEventBody({ type: "visit", visitorType: "alien", lang: "fr" }, NOW);
    expect(result.ok && result.value.visitorType).toBeNull();
    expect(result.ok && result.value.lang).toBe("es");
  });

  it.each([
    ["body", "nope"],
    ["type", { type: "lead_submitted" }],
    ["type", { type: "pageview" }],
    ["ctaId", { type: "cta_click" }],
    ["ctaId", { type: "cta_click", ctaId: "Has Spaces" }],
    ["ctaId", { type: "cta_click", ctaId: "x".repeat(41) }],
    ["position", { type: "visit", position: "<b>" }],
    ["visitorId", { type: "visit", visitorId: "../../etc" }],
    ["path", { type: "visit", path: "https://evil.example/" }],
    ["path", { type: "visit", path: `/${"a".repeat(250)}` }],
  ])("rejects invalid %s", (field, body) => {
    const result = validateEventBody(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});

function makeEnv(overrides: Record<string, unknown> = {}) {
  const rows: Array<{ query: string; values: unknown[] }> = [];
  const env = {
    LEADS_DB: {
      prepare: (query: string) => ({
        bind: (...values: unknown[]) => ({
          run: () => {
            rows.push({ query, values });
            return Promise.resolve({ success: true });
          },
        }),
      }),
    },
    CHAT_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    ...overrides,
  };
  return { env, rows };
}

function eventRequest(body: unknown, origin = "https://ramirocerda.com.ar"): Request {
  return new Request("https://worker.example/event", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "198.51.100.4" },
    body: JSON.stringify(body),
  });
}

describe("POST /event", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores a valid event and answers 204 with CORS", async () => {
    const { env, rows } = makeEnv();
    const res = await worker.fetch(
      eventRequest({ type: "cta_click", ctaId: "primary", position: "sticky", visitorType: "new" }),
      env as never,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ramirocerda.com.ar");
    expect(rows).toHaveLength(1);
    expect(rows[0].query).toBe(INSERT_EVENT_SQL);
    expect(rows[0].values.slice(0, 6)).toEqual(["cta_click", "primary", "sticky", null, null, "new"]);
  });

  it("returns 400 on invalid events and stores nothing", async () => {
    const { env, rows } = makeEnv();
    const res = await worker.fetch(eventRequest({ type: "cta_click" }), env as never);
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("ctaId");
    expect(rows).toHaveLength(0);
  });

  it("rejects blocked origins", async () => {
    const { env, rows } = makeEnv();
    const res = await worker.fetch(eventRequest({ type: "visit" }, "https://evil.example"), env as never);
    expect(res.status).toBe(403);
    expect(rows).toHaveLength(0);
  });

  it("rate limits with an event-specific key", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const { env, rows } = makeEnv({ CHAT_RATE_LIMITER: { limit } });
    const res = await worker.fetch(eventRequest({ type: "visit" }), env as never);
    expect(res.status).toBe(429);
    expect(limit).toHaveBeenCalledWith({ key: "event:198.51.100.4" });
    expect(rows).toHaveLength(0);
  });

  it("answers 204 without a D1 binding or when the insert fails", async () => {
    const missing = makeEnv({ LEADS_DB: undefined });
    expect((await worker.fetch(eventRequest({ type: "visit" }), missing.env as never)).status).toBe(204);

    const failing = makeEnv({
      LEADS_DB: { prepare: () => ({ bind: () => ({ run: () => Promise.reject(new Error("D1")) }) }) },
    });
    expect((await worker.fetch(eventRequest({ type: "visit" }), failing.env as never)).status).toBe(204);
  });
});
