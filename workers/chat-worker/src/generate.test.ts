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
      sessionId: "sess-abc123",
    });

    expect(result).toEqual({ status: 200, content: "Hola" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://opencode.ai/zen/go/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body)).toMatchObject({
      model: "deepseek-v4-flash",
      messages,
      max_tokens: 1024,
      temperature: 0,
    });
  });

  it("sends x-opencode-session and a custom User-Agent (Go requirement)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await generateReply({
      endpoint: "e",
      apiKey: "k",
      model: "m",
      messages,
      sessionId: "sess-xyz",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-opencode-session"]).toBe("sess-xyz");
    expect(init.headers["User-Agent"]).toBe("botardo-web/1.0");
  });

  it("omits the session header when no sessionId is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["x-opencode-session"]).toBeUndefined();
    expect(init.headers["User-Agent"]).toBe("botardo-web/1.0");
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
      // The upstream status rides along so the caller can tell an expired key
      // (401) from a rate limit or an outage without a second probe.
      expect(result, `status ${status}`).toEqual({ status: 500, code: "MODEL_ERROR", upstream: status });
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
    expect(result).toEqual({ status: 500, code: "MODEL_ERROR", upstream: 503 });
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

  it("retries with a doubled budget when the upstream cuts the answer (finish_reason length)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { choices: [{ message: { content: "respuesta cortada" }, finish_reason: "length" }] }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { choices: [{ message: { content: "respuesta completa" } }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, backoffMs: 5 });

    expect(result).toEqual({ status: 200, content: "respuesta completa" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_tokens).toBe(1024);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(2048);
  });

  it("flags the reply as truncated when the larger budget still runs out", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      jsonResponse(200, { choices: [{ message: { content: "respuesta cortada" }, finish_reason: "length" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages, maxAttempts: 4, backoffMs: 5 });

    expect(result).toEqual({ status: 200, content: "respuesta cortada", truncated: true });
    // One bump only: 1024 -> 2048, never unbounded growth.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not bump the budget when the upstream stops normally", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: "Ok" }, finish_reason: "stop" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateReply({ endpoint: "e", apiKey: "k", model: "m", messages });

    expect(result).toEqual({ status: 200, content: "Ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
