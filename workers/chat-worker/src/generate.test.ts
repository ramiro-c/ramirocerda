import { afterEach, describe, expect, it, vi } from "vitest";

import { generateReply } from "./generate";

const messages = [{ role: "system" as const, content: "sys" }];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("generateReply (D8/D9, R5/R7)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the model + messages to the endpoint with a Bearer secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Hola" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({
      endpoint: "https://opencode.ai/zen/go/v1/chat/completions",
      apiKey: "secret-key",
      model: "deepseek-v4-flash",
      messages,
    });

    expect(result).toEqual({ status: 200, content: "Hola" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "deepseek-v4-flash",
      messages,
      max_tokens: 1024,
      temperature: 0.3,
    });
  });

  it("maps HTTP 429 to RATE_LIMITED (D9)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(429, { error: "rate" })));
    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages });
    expect(result).toEqual({ status: 429, code: "RATE_LIMITED" });
  });

  it("maps other HTTP errors to MODEL_ERROR 500 (D9)", async () => {
    for (const status of [401, 403, 500, 502, 503]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(status, {})));
      const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 1 });
      expect(result, `status ${status}`).toEqual({ status: 500, code: "MODEL_ERROR" });
    }
  });

  it("maps network failures and timeouts to MODEL_ERROR 500 (D9)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 1 });
    expect(result).toEqual({ status: 500, code: "MODEL_ERROR" });
  });

  it("treats a missing or empty completion as MODEL_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] })));
    expect(await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 1 })).toEqual({
      status: 500,
      code: "MODEL_ERROR",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "   " } }] })));
    expect(await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 1 })).toEqual({
      status: 500,
      code: "MODEL_ERROR",
    });
  });

  it("retries a transient 5xx and succeeds on the next attempt (W1)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "Recuperado" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, backoffMs: 5 });
    expect(result).toEqual({ status: 200, content: "Recuperado" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after maxAttempts transient failures (W1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 2, backoffMs: 5 });
    expect(result).toEqual({ status: 500, code: "MODEL_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never retries 429 (W1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(429, {}));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages });
    expect(result).toEqual({ status: 429, code: "RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on network failure and succeeds (W1)", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "Ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, backoffMs: 5 });
    expect(result).toEqual({ status: 200, content: "Ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
