/**
 * Isolate-level breaker for the anonymous free decision tier.
 *
 * The free Jev tier has a usage limit and answers HTTP 429 once it is spent. Without
 * any memory of that, every router and judge call pays a wasted anonymous round trip
 * before the paid retry. This module remembers the exhaustion for a bounded window so
 * the following decisions go straight to the paid attempt.
 *
 * Scope and safety:
 * - Per isolate, in memory only: no binding, no KV, no cross-isolate coherence. A cold
 *   isolate starts closed, which is the safe direction (one wasted request).
 * - Only a `http_429` from the PRIMARY attempt opens it, and only when a paid path
 *   exists. A 500/401/network/timeout stays a per-attempt failure.
 * - The window only ever grows (Math.max): two concurrent 429s converge on the later
 *   deadline instead of shortening it, so there is no lost update to reason about.
 */

let exhaustedUntil = 0;

/** True while the free tier is assumed exhausted for this isolate. */
export function isFreeTierExhausted(now: number): boolean {
  return now < exhaustedUntil;
}

/** Remember that the free tier answered 429, keeping any longer window already open. */
export function noteFreeTierExhausted(now: number, cooldownMs: number): void {
  exhaustedUntil = Math.max(exhaustedUntil, now + cooldownMs);
}

/** Close the breaker. For tests: the state is process-wide, so suites must not inherit it. */
export function resetFreeTierBreaker(): void {
  exhaustedUntil = 0;
}
