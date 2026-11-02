import { describe, expect, it } from "vitest";

import { DEFAULT_CANDIDATES, parseCandidates, readUsage } from "./gen-bench";

describe("gen-bench helpers", () => {
  it("parses model@reasoning_effort candidates", () => {
    expect(parseCandidates(DEFAULT_CANDIDATES.join(","))).toEqual([
      { label: "deepseek-v4.1-flash", model: "deepseek-v4.1-flash", reasoningEffort: null },
      { label: "deepseek-v4.1-flash@low", model: "deepseek-v4.1-flash", reasoningEffort: "low" },
      { label: "claude-haiku-5-5@off", model: "claude-haiku-5-5", reasoningEffort: "off" },
      { label: "gpt-6-luna@none", model: "gpt-6-luna", reasoningEffort: "none" },
    ]);
  });

  it("reads reasoning tokens from OpenAI- and Responses-style usage", () => {
    expect(readUsage({ prompt_tokens: 900, completion_tokens: 120, completion_tokens_details: { reasoning_tokens: 40 } })).toEqual({
      promptTokens: 900,
      completionTokens: 120,
      reasoningTokens: 40,
    });
    expect(readUsage({ input_tokens: 5, output_tokens: 7, output_tokens_details: { reasoning_tokens: 0 } })).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      reasoningTokens: 0,
    });
    expect(readUsage(undefined)).toEqual({ promptTokens: null, completionTokens: null, reasoningTokens: null });
  });
});
