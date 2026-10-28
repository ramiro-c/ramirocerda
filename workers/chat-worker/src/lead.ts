/**
 * POST /lead: contact form + Botardo lead capture.
 *
 * Order matters: validate -> verify Turnstile -> insert into D1 -> respond.
 * Email notifications (Resend) run afterwards via ctx.waitUntil, so a mail
 * failure never loses the lead nor delays the visitor's response.
 */

export const MAX_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_LEAD_MESSAGE_LENGTH = 10;
export const MAX_LEAD_MESSAGE_LENGTH = 2000;
export const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
export const MAX_VISITOR_ID_LENGTH = 64;
export const MAX_USER_AGENT_LENGTH = 300;

import { insertEvent, parseVisitorType, type VisitorType } from "./events";

export type LeadOrigin = "form" | "botardo";
export type LeadLang = "es" | "en";

export interface ValidatedLead {
  name: string;
  email: string;
  message: string;
  origin: LeadOrigin;
  visitorId: string | null;
  lang: LeadLang;
  /** Funnel attribution only (new vs returning), never required. */
  visitorType: VisitorType | null;
  turnstileToken: string;
  /** Honeypot field filled: a bot. Accepted silently, never stored. */
  isBot: boolean;
}

export type LeadValidationError = {
  code: "INVALID_REQUEST";
  field: string;
  error: string;
};

// Pragmatic check, not RFC 5322: one @, no spaces, a dot in the domain.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9-]+$/;

function invalid(field: string, error: string): { ok: false; error: LeadValidationError } {
  return { ok: false, error: { code: "INVALID_REQUEST", field, error } };
}

export function isValidEmail(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL_PATTERN.test(email);
}

export function validateLeadBody(
  body: unknown,
): { ok: true; value: ValidatedLead } | { ok: false; error: LeadValidationError } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return invalid("body", "Request body must be a JSON object");
  }
  const record = body as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return invalid("name", `Name is required (max ${MAX_NAME_LENGTH} characters)`);
  }

  const email = typeof record.email === "string" ? record.email.trim() : "";
  if (!isValidEmail(email)) {
    return invalid("email", "A valid email is required");
  }

  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message.length < MIN_LEAD_MESSAGE_LENGTH || message.length > MAX_LEAD_MESSAGE_LENGTH) {
    return invalid(
      "message",
      `Message must be between ${MIN_LEAD_MESSAGE_LENGTH} and ${MAX_LEAD_MESSAGE_LENGTH} characters`,
    );
  }

  if (record.origin !== undefined && record.origin !== "form" && record.origin !== "botardo") {
    return invalid("origin", "origin must be 'form' or 'botardo'");
  }
  const origin: LeadOrigin = record.origin === "botardo" ? "botardo" : "form";

  let visitorId: string | null = null;
  if (record.visitorId !== undefined && record.visitorId !== null) {
    if (
      typeof record.visitorId !== "string" ||
      record.visitorId.length > MAX_VISITOR_ID_LENGTH ||
      !VISITOR_ID_PATTERN.test(record.visitorId)
    ) {
      return invalid("visitorId", "visitorId must be a short id string");
    }
    visitorId = record.visitorId;
  }

  const lang: LeadLang = record.lang === "en" ? "en" : "es";

  const turnstileToken = typeof record.turnstileToken === "string" ? record.turnstileToken : "";
  if (turnstileToken.length === 0 || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return invalid("turnstileToken", "Turnstile token is required");
  }

  const isBot = typeof record.website === "string" && record.website.trim().length > 0;

  return {
    ok: true,
    value: {
      name,
      email,
      message,
      origin,
      visitorId,
      lang,
      visitorType: parseVisitorType(record.visitorType),
      turnstileToken,
      isBot,
    },
  };
}

// ---------------------------------------------------------------------------
// Turnstile

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Fail closed: no verification, no lead.
    return false;
  }
}

// ---------------------------------------------------------------------------
// D1

export interface D1Like {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => { run: () => Promise<unknown> };
  };
}

export interface StoredLead {
  id: string;
  name: string;
  email: string;
  message: string;
  origin: LeadOrigin;
  visitorId: string | null;
  lang: LeadLang;
  userAgent: string | null;
  createdAt: string;
}

export const INSERT_LEAD_SQL =
  "INSERT INTO leads (id, name, email, message, origin, visitor_id, lang, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

export async function insertLead(db: D1Like, lead: StoredLead): Promise<void> {
  await db
    .prepare(INSERT_LEAD_SQL)
    .bind(
      lead.id,
      lead.name,
      lead.email,
      lead.message,
      lead.origin,
      lead.visitorId,
      lead.lang,
      lead.userAgent,
      lead.createdAt,
    )
    .run();
}

// ---------------------------------------------------------------------------
// Email (Resend over fetch; free tier: 3,000 emails/month, 100/day)

export const RESEND_API_URL = "https://api.resend.com/emails";

export interface LeadMailConfig {
  apiKey?: string;
  notifyTo?: string;
  from?: string;
  /** "true" sends a confirmation to the contact. Anything else disables it. */
  confirmationEnabled?: string;
}

/** Header-safe single line (subjects, names). */
function oneLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").trim();
}

export function buildNotificationEmail(lead: StoredLead, cfg: Required<Pick<LeadMailConfig, "notifyTo" | "from">>) {
  return {
    from: cfg.from,
    to: [cfg.notifyTo],
    reply_to: lead.email,
    subject: oneLine(`Nuevo lead (${lead.origin}): ${lead.name}`),
    text: [
      `Nombre: ${lead.name}`,
      `Email: ${lead.email}`,
      `Origen: ${lead.origin}`,
      `Idioma: ${lead.lang}`,
      `Visitor ID: ${lead.visitorId ?? "-"}`,
      `Fecha: ${lead.createdAt}`,
      `Lead ID: ${lead.id}`,
      "",
      "Mensaje:",
      lead.message,
    ].join("\n"),
  };
}

const CONFIRMATION_COPY: Record<LeadLang, { subject: string; body: (name: string) => string }> = {
  es: {
    subject: "Recibí tu mensaje",
    body: (name) =>
      `Hola ${name},\n\nGracias por escribirme. Recibí tu mensaje y te respondo a este mail en cuanto pueda.\n\nRamiro Cerdá\nhttps://ramirocerda.com.ar`,
  },
  en: {
    subject: "I got your message",
    body: (name) =>
      `Hi ${name},\n\nThanks for reaching out. I got your message and will reply to this email as soon as I can.\n\nRamiro Cerdá\nhttps://ramirocerda.com.ar/en/`,
  },
};

export function buildConfirmationEmail(lead: StoredLead, cfg: Required<Pick<LeadMailConfig, "notifyTo" | "from">>) {
  const copy = CONFIRMATION_COPY[lead.lang];
  return {
    from: cfg.from,
    to: [lead.email],
    reply_to: cfg.notifyTo,
    subject: copy.subject,
    text: copy.body(oneLine(lead.name)),
  };
}

async function sendResend(apiKey: string, payload: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

export interface MailOutcome {
  notification: "sent" | "failed" | "skipped";
  confirmation: "sent" | "failed" | "skipped";
}

/** Never throws: every failure is reported in the outcome (and logged by the caller). */
export async function sendLeadEmails(lead: StoredLead, cfg: LeadMailConfig): Promise<MailOutcome> {
  const outcome: MailOutcome = { notification: "skipped", confirmation: "skipped" };
  if (!cfg.apiKey || !cfg.notifyTo || !cfg.from) return outcome;
  const addresses = { notifyTo: cfg.notifyTo, from: cfg.from };

  try {
    outcome.notification = (await sendResend(cfg.apiKey, buildNotificationEmail(lead, addresses)))
      ? "sent"
      : "failed";
  } catch {
    outcome.notification = "failed";
  }

  if (cfg.confirmationEnabled === "true") {
    try {
      outcome.confirmation = (await sendResend(cfg.apiKey, buildConfirmationEmail(lead, addresses)))
        ? "sent"
        : "failed";
    } catch {
      outcome.confirmation = "failed";
    }
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// Handler

export interface LeadEnv {
  LEADS_DB?: D1Like;
  TURNSTILE_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  LEAD_NOTIFY_TO?: string;
  LEAD_FROM?: string;
  LEAD_CONFIRMATION_ENABLED?: string;
  CHAT_RATE_LIMITER: {
    limit: (opts: { key: string }) => Promise<{ success: boolean }>;
  };
}

export interface WaitUntil {
  waitUntil: (promise: Promise<unknown>) => void;
}

type Json = (status: number, payload: Record<string, unknown>) => Response;
type Log = (event: string, data?: Record<string, unknown>) => void;

/**
 * Caller has already checked method (POST) and Origin (allow-list), so CORS
 * behaves exactly like /ask. `json` adds the CORS headers.
 */
export async function handleLead(
  request: Request,
  env: LeadEnv,
  ctx: WaitUntil | undefined,
  json: Json,
  log: Log,
): Promise<Response> {
  const clientIp = request.headers.get("CF-Connecting-IP");
  const rate = await env.CHAT_RATE_LIMITER.limit({ key: `lead:${clientIp ?? "unknown"}` });
  if (!rate.success) {
    log("lead.rate_limited");
    return json(429, {
      error: "Demasiados envíos. Esperá un momento y volvé a intentar.",
      code: "RATE_LIMITED",
    });
  }

  // Fail closed until the D1 database and Turnstile secret exist.
  if (!env.LEADS_DB || !env.TURNSTILE_SECRET_KEY) {
    log("lead.unavailable", { db: Boolean(env.LEADS_DB), turnstile: Boolean(env.TURNSTILE_SECRET_KEY) });
    return json(503, { error: "Contact form is not available yet", code: "LEADS_UNAVAILABLE" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body", code: "INVALID_REQUEST", field: "body" });
  }

  const parsed = validateLeadBody(body);
  if (!parsed.ok) {
    log("lead.invalid", { field: parsed.error.field });
    return json(400, parsed.error);
  }
  const input = parsed.value;

  if (input.isBot) {
    // Honeypot filled (bots fill hidden fields): answer like a success, store nothing.
    log("lead.honeypot");
    return json(201, { ok: true });
  }

  const human = await verifyTurnstile(input.turnstileToken, env.TURNSTILE_SECRET_KEY, clientIp);
  if (!human) {
    log("lead.turnstile_failed", { origin: input.origin });
    return json(403, { error: "Turnstile verification failed", code: "TURNSTILE_FAILED" });
  }

  const lead: StoredLead = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    message: input.message,
    origin: input.origin,
    visitorId: input.visitorId,
    lang: input.lang,
    userAgent: request.headers.get("User-Agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    await insertLead(env.LEADS_DB, lead);
  } catch (err) {
    log("lead.store_error", { error_message: err instanceof Error ? err.message : String(err) });
    return json(500, { error: "Could not save your message. Try again.", code: "STORAGE_ERROR" });
  }
  log("lead.stored", { id: lead.id, origin: lead.origin, lang: lead.lang });

  // The lead is safe in D1; mail and the funnel event run after the response
  // and never block it nor fail it.
  const db = env.LEADS_DB;
  const background = Promise.allSettled([
    sendLeadEmails(lead, {
      apiKey: env.RESEND_API_KEY,
      notifyTo: env.LEAD_NOTIFY_TO,
      from: env.LEAD_FROM,
      confirmationEnabled: env.LEAD_CONFIRMATION_ENABLED,
    }).then((outcome) => log("lead.mail", { id: lead.id, ...outcome })),
    insertEvent(db, {
      type: "lead_submitted",
      ctaId: null,
      position: null,
      origin: lead.origin,
      visitorId: lead.visitorId,
      visitorType: input.visitorType,
      lang: lead.lang,
      path: null,
      createdAt: lead.createdAt,
    }).catch((err) =>
      log("event.store_error", { error_message: err instanceof Error ? err.message : String(err) }),
    ),
  ]);
  if (ctx) {
    ctx.waitUntil(background);
  } else {
    void background;
  }

  return json(201, { ok: true, id: lead.id });
}
