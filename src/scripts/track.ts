/**
 * First party funnel events to the worker (POST /event, stored in D1).
 * No cookies, no third party scripts. Skipped under GPC / Do Not Track.
 *
 *   visit      once per browser session, with new vs returning
 *   cta_click  any element with data-cta-id (+ data-cta-position)
 *
 * lead_submitted is recorded by the worker itself when a lead is stored.
 */
import { WORKER_URL } from "../config/site";
import { getVisitorId, getVisitorType, prefersNoTracking } from "./visitor";

const VISIT_SENT_KEY = "rc:visitEventSent";

function send(payload: Record<string, unknown>): void {
  if (prefersNoTracking()) return;
  try {
    void fetch(`${WORKER_URL}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        visitorId: getVisitorId(),
        visitorType: getVisitorType(),
        lang: document.documentElement.lang === "en" ? "en" : "es",
        path: location.pathname.slice(0, 200),
      }),
      // Survives navigation when the CTA is a link.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the page.
  }
}

export function trackCtaClick(ctaId: string, position: string | null): void {
  send({ type: "cta_click", ctaId, position });
}

export function initTracking(): void {
  try {
    if (!sessionStorage.getItem(VISIT_SENT_KEY)) {
      sessionStorage.setItem(VISIT_SENT_KEY, "1");
      send({ type: "visit" });
    }
  } catch {
    // sessionStorage unavailable: skip visit events.
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-cta-id]") : null;
      if (!(target instanceof HTMLElement)) return;
      const ctaId = target.dataset.ctaId;
      if (!ctaId) return;
      trackCtaClick(ctaId, target.dataset.ctaPosition ?? null);
    },
    { capture: true },
  );
}
