/**
 * Conversion layer config: every optional channel lives here so the landing
 * kit can restyle components without touching wiring.
 *
 * All PUBLIC_* values are read at build time (Vercel project env vars).
 */

/** Botardo / leads worker. Same default as the chat widget. */
export const WORKER_URL: string =
  import.meta.env.PUBLIC_BOTARDO_WORKER_URL ?? "https://ramirocerda-chat.rami992009.workers.dev";

/**
 * Cloudflare Turnstile site key (public). Empty: the contact form shows the
 * email fallback instead of a form that cannot be verified. In dev, Cloudflare's
 * always-pass test key keeps the form usable locally.
 */
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.PUBLIC_TURNSTILE_SITE_KEY ?? (import.meta.env.DEV ? "1x00000000000000000000AA" : "");

/** Optional Cal.com (or similar) booking link. Empty: the primary CTA opens the contact form. */
export const CAL_URL: string = import.meta.env.PUBLIC_CAL_URL ?? "";

/**
 * Optional WhatsApp link (https://wa.me/<number>). Empty: hidden.
 * Never hardcode a number here; set PUBLIC_WHATSAPP_URL.
 */
export const WHATSAPP_URL: string = import.meta.env.PUBLIC_WHATSAPP_URL ?? "";

/** Fallback contact shown when the form is unavailable. Already public in the footer. */
export const CONTACT_EMAIL = "rami992009@gmail.com";

/** localStorage / sessionStorage keys (first party, never sent to third parties). */
export const STORAGE_KEYS = {
  visitorId: "rc:visitorId",
  visitCount: "rc:visitCount",
  sessionCounted: "rc:visitCounted",
  noticeDismissed: "rc:storageNoticeDismissed",
} as const;
