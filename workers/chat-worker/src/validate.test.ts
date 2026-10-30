import { describe, expect, it, vi } from "vitest";

import {
  MAX_HISTORY_MESSAGE_LENGTH,
  MAX_HISTORY_TURNS,
  MAX_HISTORY_TOTAL_CHARS,
  MAX_MESSAGE_LENGTH,
  trimHistory,
  validateAskBody,
} from "./validate";

describe("validateAskBody", () => {
  it("rejects missing or empty message", () => {
    expect(validateAskBody({}).ok).toBe(false);
    expect(validateAskBody({ message: "   " }).ok).toBe(false);
  });

  it("rejects messages over the length cap", () => {
    const long = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    const result = validateAskBody({ message: long });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_REQUEST");
    }
  });

  it("trims history to allowed roles and caps", () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i}`,
    }));
    const result = validateAskBody({ message: "hola", history });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.history).toHaveLength(MAX_HISTORY_TURNS);
      expect(result.value.history[0]?.content).toBe("turn 2"); // last 10 of 12 → 2..11
    }
  });
});

describe("trimHistory", () => {
  it("drops invalid entries", () => {
    expect(
      trimHistory([
        { role: "system", content: "nope" },
        { role: "user", content: "ok" },
        null,
        { role: "assistant", content: "  " },
      ]),
    ).toEqual([{ role: "user", content: "ok" }]);
  });

  it("logs a chat.history_truncated event with counts, no text, when the cap bites", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Each turn is first capped at MAX_HISTORY_MESSAGE_LENGTH (1500), so the
      // 12k total cap needs 9 such turns: 8 fit, the 9th is dropped whole.
      const big = "y".repeat(MAX_HISTORY_MESSAGE_LENGTH);
      const before = Array.from({ length: 9 }, (_, i) => ({ role: "user" as const, content: `${i}${big}` }));
      const out = trimHistory(before);
      expect(out).toHaveLength(8); // 7 full turns (7×1501=10507) + the 8th sliced to its remaining room
      expect(out.reduce((s, t) => s + t.content.length, 0)).toBeLessThanOrEqual(MAX_HISTORY_TOTAL_CHARS);
      const events = log.mock.calls.map((c) => JSON.parse(String(c[0])));
      const truncated = events.find((e) => e.event === "chat.history_truncated");
      expect(truncated).toBeTruthy();
      expect(JSON.stringify(truncated)).not.toContain("yyy");
    } finally {
      log.mockRestore();
    }
  });

  it("stays quiet when nothing is truncated", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      trimHistory([{ role: "user", content: "short" }]);
      expect(log.mock.calls.some((c) => String(c[0]).includes("chat.history_truncated"))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});
