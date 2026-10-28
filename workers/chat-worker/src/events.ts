/**
 * POST /event: first-party funnel events stored in D1 (table `events`).
 *
 * Client events: `visit` (once per browser session) and `cta_click`.
 * `lead_submitted` is recorded server-side by /lead, so it cannot be faked
 * from the browser without passing Turnstile.
 *
 * Analytics Engine (`ANALYTICS`) is not reused on purpose: its blob layout is
 * the Botardo usage schema read by scripts/chat-stats.mjs, and mixing rows
 * would skew those numbers. Queries live in queries/funnel.sql.
 */

import type { D1Like } from "./lead";

export type ClientEventType = "visit" | "cta_click";
export type EventType = ClientEventType | "lead_submitted";
export type VisitorType = "new" | "returning";

export interface FunnelEvent {
  type: EventType;
  ctaId: string | null;
  position: string | null;
  origin: string | null;
  visitorId: string | null;
  visitorType: VisitorType | null;
  lang: "es" | "en";
  path: string | null;
  createdAt: string;
}

export type EventValidationError = { code: "INVALID_REQUEST"; field: string; error: string };

const SLUG_PATTERN = /^[a-z0-9_-]{1,40}$/;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const MAX_PATH_LENGTH = 200;

function invalid(field: string, error: string): { ok: false; error: EventValidationError } {
  return { ok: false, error: { code: "INVALID_REQUEST", field, error } };
}

function optionalSlug(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" && SLUG_PATTERN.test(value) ? value : undefined;
}

export function parseVisitorType(value: unknown): VisitorType | null {
  return value === "new" || value === "returning" ? value : null;
}

export function validateEventBody(
  body: unknown,
  now: () => string = () => new Date().toISOString(),
): { ok: true; value: FunnelEvent } | { ok: false; error: EventValidationError } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalid("body", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;

  if (record.type !== "visit" && record.type !== "cta_click") {
    return invalid("type", "type must be 'visit' or 'cta_click'");
  }

  const ctaId = optionalSlug(record.ctaId);
  const position = optionalSlug(record.position);
  if (ctaId === undefined) return invalid("ctaId", "ctaId must be a short slug");
  if (position === undefined) return invalid("position", "position must be a short slug");
  if (record.type === "cta_click" && ctaId === null) {
    return invalid("ctaId", "cta_click requires ctaId");
  }

  let visitorId: string | null = null;
  if (record.visitorId !== undefined && record.visitorId !== null) {
    if (typeof record.visitorId !== "string" || !VISITOR_ID_PATTERN.test(record.visitorId)) {
      return invalid("visitorId", "visitorId must be a short id string");
    }
    visitorId = record.visitorId;
  }

  let path: string | null = null;
  if (record.path !== undefined && record.path !== null) {
    if (typeof record.path !== "string" || !record.path.startsWith("/") || record.path.length > MAX_PATH_LENGTH) {
      return invalid("path", "path must be a site path");
    }
    path = record.path;
  }

  return {
    ok: true,
    value: {
      type: record.type,
      ctaId,
      position,
      origin: null,
      visitorId,
      visitorType: parseVisitorType(record.visitorType),
      lang: record.lang === "en" ? "en" : "es",
      path,
      createdAt: now(),
    },
  };
}

export const INSERT_EVENT_SQL =
  "INSERT INTO events (type, cta_id, position, origin, visitor_id, visitor_type, lang, path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

export async function insertEvent(db: D1Like, event: FunnelEvent): Promise<void> {
  await db
    .prepare(INSERT_EVENT_SQL)
    .bind(
      event.type,
      event.ctaId,
      event.position,
      event.origin,
      event.visitorId,
      event.visitorType,
      event.lang,
      event.path,
      event.createdAt,
    )
    .run();
}

export interface EventEnv {
  LEADS_DB?: D1Like;
  CHAT_RATE_LIMITER: {
    limit: (opts: { key: string }) => Promise<{ success: boolean }>;
  };
}

type Json = (status: number, payload: Record<string, unknown>) => Response;
type Log = (event: string, data?: Record<string, unknown>) => void;

/**
 * Caller has already checked method and Origin. Analytics must never break
 * the page: storage problems answer 204 and are only logged.
 */
export async function handleEvent(
  request: Request,
  env: EventEnv,
  json: Json,
  noContent: () => Response,
  log: Log,
): Promise<Response> {
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const rate = await env.CHAT_RATE_LIMITER.limit({ key: `event:${clientIp}` });
  if (!rate.success) {
    return json(429, { error: "Too many events", code: "RATE_LIMITED" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body", code: "INVALID_REQUEST", field: "body" });
  }

  const parsed = validateEventBody(body);
  if (!parsed.ok) {
    return json(400, parsed.error);
  }

  if (!env.LEADS_DB) {
    log("event.unavailable");
    return noContent();
  }

  try {
    await insertEvent(env.LEADS_DB, parsed.value);
  } catch (err) {
    log("event.store_error", { error_message: err instanceof Error ? err.message : String(err) });
  }
  return noContent();
}
