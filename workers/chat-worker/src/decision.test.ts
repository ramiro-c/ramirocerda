/**
 * Tier policy of the decision client: when a failed anonymous attempt should be
 * remembered, for how long, and how a Retry-After header is read.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { isFreeTierExhausted, resetFreeTierBreaker } from "./breaker";
import { readAdaptiveConfig } from "./config";
import {
  FREE_TIER_AUTH_COOLDOWN_MS,
  MAX_FREE_TIER_COOLDOWN_MS,
  type DecisionFailure,
  askDecision,
  freeTierCooldownMs,
  parseRetryAfterMs,
} from "./decision";
import { ROUTE_QUESTION } from "./router";
import { DECISION_VARS, routerAnswer, stubFetch } from "./test-utils";

const config = readAdaptiveConfig({ ...DECISION_VARS, OPENCODE_GO_API_KEY: "paid-key" }).decision!;

afterEach(() => {
  vi.unstubAllGlobals();
  resetFreeTierBreaker();
});

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");

  it("reads the delay in seconds and the HTTP-date form", () => {
    expect(parseRetryAfterMs("120", now)).toBe(120_000);
    expect(parseRetryAfterMs(" 0 ", now)).toBe(0);
    expect(parseRetryAfterMs(new Date(now + 45_000).toUTCString(), now)).toBe(45_000);
  });

  it("returns null when the header is missing or unreadable", () => {
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs("", now)).toBeNull();
    expect(parseRetryAfterMs("soon", now)).toBeNull();
    expect(parseRetryAfterMs("-5", now)).toBeNull();
    // A date already in the past means "no need to wait", not a negative delay.
    expect(parseRetryAfterMs(new Date(now - 60_000).toUTCString(), now)).toBe(0);
  });
});

describe("freeTierCooldownMs", () => {
  it("honours Retry-After but never below the configured cooldown", () => {
    expect(freeTierCooldownMs("http_429", 60_000, 900_000)).toBe(900_000);
    expect(freeTierCooldownMs("http_429", 1_800_000, 900_000)).toBe(1_800_000);
    expect(freeTierCooldownMs("http_429", null, 900_000)).toBe(900_000);
  });

  it("caps any window so one bad header cannot disable the tier for hours", () => {
    expect(freeTierCooldownMs("http_429", 99_999_999, 900_000)).toBe(MAX_FREE_TIER_COOLDOWN_MS);
    expect(freeTierCooldownMs("http_401", null, 900_000)).toBeLessThanOrEqual(MAX_FREE_TIER_COOLDOWN_MS);
  });

  it.each<[DecisionFailure, number]>([
    ["http_401", FREE_TIER_AUTH_COOLDOWN_MS],
    ["http_403", FREE_TIER_AUTH_COOLDOWN_MS],
  ])("remembers %s so the next decision skips the anonymous hop", (reason, expected) => {
    expect(freeTierCooldownMs(reason, null, 900_000)).toBe(expected);
  });

  it("does not remember failures the paid tier would hit the same way", () => {
    // A 422 is our own payload shape and a 5xx is the same provider: opening the breaker
    // would hide the real failure behind a silent skip and pay for a retry that fails too.
    expect(freeTierCooldownMs("http_422", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("http_529", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("http_500", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("http_503", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("network", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("timeout", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("invalid_json", null, 900_000)).toBeNull();
    expect(freeTierCooldownMs("invalid_shape", null, 900_000)).toBeNull();
  });
});

describe("askDecision tier policy", () => {
  it("a free 401 sends the next decision straight to the paid tier", async () => {
    const { calls } = stubFetch(
      { router: [{ status: 401 }, routerAnswer("search"), routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();

    const first = await askDecision(config, {}, { route: ROUTE_QUESTION });
    expect(first.ok).toBe(true);
    expect(first.trace).toMatchObject({ tier: "paid", primaryError: "http_401", fallback: "used" });

    const second = await askDecision(config, {}, { route: ROUTE_QUESTION });
    expect(second.ok).toBe(true);
    // The anonymous attempt is not paid again inside the window.
    expect(calls.router).toHaveLength(3);
    expect(calls.router[2].model).toBe(config.fallbackModel);
    expect(second.trace).toMatchObject({ tier: "paid", primaryError: "free_skipped" });
  });

  it("a 422 keeps the free tier in play because the paid tier fails the same way", async () => {
    const { calls } = stubFetch(
      { router: [{ status: 422 }, { status: 422 }, routerAnswer("search"), routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();

    expect((await askDecision(config, {}, { route: ROUTE_QUESTION })).ok).toBe(false);
    expect(isFreeTierExhausted(Date.now())).toBe(false);

    expect((await askDecision(config, {}, { route: ROUTE_QUESTION })).ok).toBe(true);
    // Third call is the anonymous tier again: the 422 was not remembered.
    expect(calls.router).toHaveLength(3);
    expect(calls.router[2].model).toBe(config.model);
  });

  it("a 429 with Retry-After longer than the configured cooldown widens the window", async () => {
    const long = readAdaptiveConfig({ ...DECISION_VARS, OPENCODE_GO_API_KEY: "paid-key" }).decision!;
    stubFetch(
      { router: [{ status: 429, headers: { "retry-after": "1800" } }, routerAnswer("search")] },
      { resetBreaker: false },
    );
    resetFreeTierBreaker();
    const now = Date.now();

    await askDecision(long, {}, { route: ROUTE_QUESTION });

    expect(isFreeTierExhausted(now + 1_700_000)).toBe(true);
    expect(isFreeTierExhausted(now + 1_900_000)).toBe(false);
  });
});
