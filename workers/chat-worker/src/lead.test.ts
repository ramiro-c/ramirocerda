import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index";
import { INSERT_EVENT_SQL } from "./events";
import {
  INSERT_LEAD_SQL,
  MAX_LEAD_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  RESEND_API_URL,
  TURNSTILE_VERIFY_URL,
  sendLeadEmails,
  validateLeadBody,
  type StoredLead,
} from "./lead";

const VALID = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  message: "Quiero armar un agente de IA para mi empresa.",
  origin: "form",
  visitorId: "8f14e45f-ceea-4e7a-9b2a-1f0e3c1d2b3a",
  lang: "es",
  turnstileToken: "tok-123",
};

describe("validateLeadBody", () => {
  it("accepts a valid lead and trims fields", () => {
    const result = validateLeadBody({ ...VALID, name: "  Ada  " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("Ada");
      expect(result.value.origin).toBe("form");
      expect(result.value.isBot).toBe(false);
    }
  });

  it("defaults origin to form and lang to es", () => {
    const { origin: _o, lang: _l, ...rest } = VALID;
    const result = validateLeadBody(rest);
    expect(result.ok && result.value.origin).toBe("form");
    expect(result.ok && result.value.lang).toBe("es");
  });

  it.each([
    ["body", null],
    ["body", []],
    ["name", { ...VALID, name: "   " }],
    ["name", { ...VALID, name: "a".repeat(MAX_NAME_LENGTH + 1) }],
    ["email", { ...VALID, email: "not-an-email" }],
    ["email", { ...VALID, email: "a b@example.com" }],
    ["email", { ...VALID, email: "ada@localhost" }],
    ["email", { ...VALID, email: `${"a".repeat(250)}@example.com` }],
    ["message", { ...VALID, message: "corto" }],
    ["message", { ...VALID, message: "x".repeat(MAX_LEAD_MESSAGE_LENGTH + 1) }],
    ["origin", { ...VALID, origin: "ads" }],
    ["visitorId", { ...VALID, visitorId: "<script>" }],
    ["visitorId", { ...VALID, visitorId: "a".repeat(65) }],
    ["turnstileToken", { ...VALID, turnstileToken: "" }],
  ])("rejects invalid %s", (field, body) => {
    const result = validateLeadBody(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });

  it("flags the honeypot field", () => {
    const result = validateLeadBody({ ...VALID, website: "http://spam.example" });
    expect(result.ok && result.value.isBot).toBe(true);
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
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    RESEND_API_KEY: "resend-key",
    LEAD_NOTIFY_TO: "ramiro@example.com",
    LEAD_FROM: "Ramiro <hola@example.com>",
    LEAD_CONFIRMATION_ENABLED: "true",
    CHAT_RATE_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    ...overrides,
  };
  // Lead rows only; funnel events are checked through `events`.
  const inserts = {
    get length() {
      return rows.filter((r) => r.query === INSERT_LEAD_SQL).length;
    },
    at: (i: number) => rows.filter((r) => r.query === INSERT_LEAD_SQL)[i].values,
  };
  const events = () => rows.filter((r) => r.query === INSERT_EVENT_SQL).map((r) => r.values);
  return { env, inserts, events };
}

function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) }, pending };
}

function leadRequest(body: unknown, origin = "https://ramirocerda.com.ar"): Request {
  return new Request("https://worker.example/lead", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "203.0.113.7",
      "User-Agent": "vitest-agent",
    },
    body: JSON.stringify(body),
  });
}

/** fetch mock routing Turnstile + Resend calls. */
function stubFetch(opts: { turnstileOk?: boolean; resend?: () => Promise<Response> } = {}) {
  const fetchMock = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
    const href = String(url);
    if (href === TURNSTILE_VERIFY_URL) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: opts.turnstileOk ?? true }), { status: 200 }),
      );
    }
    if (href === RESEND_API_URL) {
      return opts.resend ? opts.resend() : Promise.resolve(new Response("{}", { status: 200 }));
    }
    return Promise.reject(new Error(`unexpected fetch ${href}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, url: string) {
  return fetchMock.mock.calls.filter(([u]) => String(u) === url);
}

describe("POST /lead", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the lead in D1 and returns 201 with CORS for allowed origins", async () => {
    const fetchMock = stubFetch();
    const { env, inserts, events } = makeEnv();
    const { ctx, pending } = makeCtx();

    const res = await worker.fetch(
      leadRequest({ ...VALID, origin: "botardo", visitorType: "returning" }),
      env as never,
      ctx,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://ramirocerda.com.ar");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(inserts).toHaveLength(1);
    const [id, name, email, message, origin, visitorId, lang, userAgent, createdAt] = inserts.at(0);
    expect(id).toBe(body.id);
    expect([name, email, message, origin, visitorId, lang, userAgent]).toEqual([
      VALID.name,
      VALID.email,
      VALID.message,
      "botardo",
      VALID.visitorId,
      "es",
      "vitest-agent",
    ]);
    expect(String(createdAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Turnstile verified server-side with the secret + visitor IP.
    const [, init] = callsTo(fetchMock, TURNSTILE_VERIFY_URL)[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      secret: "turnstile-secret",
      response: "tok-123",
      remoteip: "203.0.113.7",
    });

    await Promise.all(pending);
    expect(callsTo(fetchMock, RESEND_API_URL)).toHaveLength(2);
    // Funnel event recorded server-side with origin + visitor type.
    expect(events()).toHaveLength(1);
    expect(events()[0].slice(0, 7)).toEqual([
      "lead_submitted",
      null,
      null,
      "botardo",
      VALID.visitorId,
      "returning",
      "es",
    ]);
  });

  it("rejects with 403 and stores nothing when Turnstile fails", async () => {
    const fetchMock = stubFetch({ turnstileOk: false });
    const { env, inserts } = makeEnv();
    const { ctx, pending } = makeCtx();

    const res = await worker.fetch(leadRequest(VALID), env as never, ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("TURNSTILE_FAILED");
    expect(inserts).toHaveLength(0);
    expect(pending).toHaveLength(0);
    expect(callsTo(fetchMock, RESEND_API_URL)).toHaveLength(0);
  });

  it("fails closed when the Turnstile endpoint errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { env, inserts } = makeEnv();
    const res = await worker.fetch(leadRequest(VALID), env as never, makeCtx().ctx);
    expect(res.status).toBe(403);
    expect(inserts).toHaveLength(0);
  });

  it("returns 400 with the failing field and skips Turnstile on invalid input", async () => {
    const fetchMock = stubFetch();
    const { env, inserts } = makeEnv();
    const res = await worker.fetch(leadRequest({ ...VALID, email: "nope" }), env as never, makeCtx().ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("email");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("returns 400 on a non-JSON body", async () => {
    stubFetch();
    const { env } = makeEnv();
    const req = new Request("https://worker.example/lead", {
      method: "POST",
      headers: { Origin: "https://ramirocerda.com.ar" },
      body: "not json",
    });
    const res = await worker.fetch(req, env as never, makeCtx().ctx);
    expect(res.status).toBe(400);
  });

  it("rejects blocked origins before doing any work", async () => {
    const fetchMock = stubFetch();
    const { env, inserts } = makeEnv();
    const res = await worker.fetch(leadRequest(VALID, "https://evil.example"), env as never, makeCtx().ctx);
    expect(res.status).toBe(403);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("applies the rate limiter with a lead-specific key", async () => {
    stubFetch();
    const limit = vi.fn().mockResolvedValue({ success: false });
    const { env, inserts } = makeEnv({ CHAT_RATE_LIMITER: { limit } });
    const res = await worker.fetch(leadRequest(VALID), env as never, makeCtx().ctx);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("RATE_LIMITED");
    expect(limit).toHaveBeenCalledWith({ key: "lead:203.0.113.7" });
    expect(inserts).toHaveLength(0);
  });

  it("returns 503 until the D1 binding and Turnstile secret exist", async () => {
    stubFetch();
    for (const missing of [{ LEADS_DB: undefined }, { TURNSTILE_SECRET_KEY: undefined }]) {
      const { env } = makeEnv(missing);
      const res = await worker.fetch(leadRequest(VALID), env as never, makeCtx().ctx);
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("LEADS_UNAVAILABLE");
    }
  });

  it("returns 500 when the D1 insert fails and sends no email", async () => {
    const fetchMock = stubFetch();
    const { env } = makeEnv({
      LEADS_DB: {
        prepare: () => ({
          bind: () => ({ run: () => Promise.reject(new Error("D1_ERROR")) }),
        }),
      },
    });
    const { ctx, pending } = makeCtx();
    const res = await worker.fetch(leadRequest(VALID), env as never, ctx);
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("STORAGE_ERROR");
    expect(pending).toHaveLength(0);
    expect(callsTo(fetchMock, RESEND_API_URL)).toHaveLength(0);
  });

  it("silently accepts honeypot submissions without storing or verifying", async () => {
    const fetchMock = stubFetch();
    const { env, inserts } = makeEnv();
    const res = await worker.fetch(leadRequest({ ...VALID, website: "spam" }), env as never, makeCtx().ctx);
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responds before email delivery finishes and keeps the lead when Resend fails", async () => {
    let releaseResend: (r: Response) => void = () => {};
    const fetchMock = stubFetch({
      resend: () => new Promise<Response>((resolve) => (releaseResend = resolve)),
    });
    const { env, inserts } = makeEnv({ LEAD_CONFIRMATION_ENABLED: "false" });
    const { ctx, pending } = makeCtx();

    const res = await worker.fetch(leadRequest(VALID), env as never, ctx);
    // Response is ready while the Resend call is still hanging.
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
    expect(pending).toHaveLength(1);
    expect(callsTo(fetchMock, RESEND_API_URL)).toHaveLength(1);

    releaseResend(new Response("boom", { status: 500 }));
    await expect(Promise.all(pending)).resolves.toBeDefined();
  });

  it("works without an execution context (mail still fire-and-forget)", async () => {
    stubFetch();
    const { env, inserts } = makeEnv();
    const res = await worker.fetch(leadRequest(VALID), env as never);
    expect(res.status).toBe(201);
    expect(inserts).toHaveLength(1);
  });
});

describe("sendLeadEmails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lead: StoredLead = {
    id: "lead-1",
    name: "Ada\r\nBcc: x@evil.example",
    email: "ada@example.com",
    message: "Hola, quiero trabajar juntos.",
    origin: "form",
    visitorId: null,
    lang: "en",
    userAgent: null,
    createdAt: "2026-10-28T19:00:00.000Z",
  };
  const cfg = {
    apiKey: "resend-key",
    notifyTo: "ramiro@example.com",
    from: "Ramiro <hola@example.com>",
  };

  it("notifies Ramiro with reply_to set to the contact and a single-line subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await sendLeadEmails(lead, { ...cfg, confirmationEnabled: "false" });
    expect(outcome).toEqual({ notification: "sent", confirmation: "skipped" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_API_URL);
    expect(init.headers.Authorization).toBe("Bearer resend-key");
    const payload = JSON.parse(init.body);
    expect(payload.to).toEqual(["ramiro@example.com"]);
    expect(payload.reply_to).toBe("ada@example.com");
    expect(payload.subject).not.toMatch(/[\r\n]/);
    expect(payload.text).toContain("Hola, quiero trabajar juntos.");
  });

  it("sends the confirmation in the contact's language only when enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await sendLeadEmails(lead, { ...cfg, confirmationEnabled: "true" });
    expect(outcome).toEqual({ notification: "sent", confirmation: "sent" });
    const confirmation = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(confirmation.to).toEqual(["ada@example.com"]);
    expect(confirmation.subject).toBe("I got your message");
  });

  it("skips everything when Resend is not configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendLeadEmails(lead, { confirmationEnabled: "true" })).toEqual({
      notification: "skipped",
      confirmation: "skipped",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never throws on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await expect(sendLeadEmails(lead, { ...cfg, confirmationEnabled: "true" })).resolves.toEqual({
      notification: "failed",
      confirmation: "failed",
    });
  });
});
