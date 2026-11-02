/**
 * Read side of the anonymous visitor state. The write side (id + visit count)
 * runs inline in BaseLayout's <head> so html[data-returning] is set before
 * first paint; this module only reads what it stored.
 */
import { STORAGE_KEYS } from "../config/site";

export type VisitorType = "new" | "returning";

export function getVisitorId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.visitorId);
  } catch {
    return null;
  }
}

export function getVisitorType(): VisitorType {
  return document.documentElement.hasAttribute("data-returning") ? "returning" : "new";
}

/** Browser privacy signals: when set, no funnel events leave the browser. */
export function prefersNoTracking(): boolean {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || navigator.doNotTrack === "1";
}
