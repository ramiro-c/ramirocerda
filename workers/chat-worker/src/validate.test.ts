import { describe, expect, it } from "vitest";

import {
  MAX_HISTORY_TURNS,
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
});
