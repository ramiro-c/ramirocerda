/**
 * Test helpers: a scripted fetch that plays OpenRouter (router and judge calls,
 * told apart by the JSON schema name / system prompt) and OpenCode Go generation.
 * Only imported by *.test.ts files.
 */
import { vi } from "vitest";

import { DEFAULT_OPENROUTER_ENDPOINT } from "./config";
import { JUDGE_SYSTEM_PROMPT } from "./retrieval";
import { ROUTER_SYSTEM_PROMPT } from "./router";

export const GENERATION_ENDPOINT = "https://opencode.example/v1/chat/completions";

/** One scripted OpenRouter answer: a JSON value (sent as content), raw content text, an HTTP status, a thrown error, or "hang". */
export type ScriptedAnswer =
  | { json: unknown }
  | { content: string }
  | { status: number }
  | { error: Error }
  | "hang";

export interface FetchScript {
  router?: ScriptedAnswer[];
  judge?: ScriptedAnswer[];
  generation?: string;
}

function respond(answer: ScriptedAnswer, signal: AbortSignal | undefined): Promise<Response> {
  if (answer === "hang") {
    return new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }
  if ("error" in answer) return Promise.reject(answer.error);
  if ("status" in answer) return Promise.resolve(new Response("upstream error", { status: answer.status }));
  const content = "json" in answer ? JSON.stringify(answer.json) : answer.content;
  return Promise.resolve(
    new Response(
      JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 20 } }),
      { status: 200 },
    ),
  );
}

export function stubFetch(script: FetchScript = {}) {
  const router = [...(script.router ?? [])];
  const judge = [...(script.judge ?? [])];
  const calls = { router: [] as unknown[], judge: [] as unknown[], generation: [] as unknown[] };
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === DEFAULT_OPENROUTER_ENDPOINT) {
      const system = body.messages?.[0]?.content;
      if (system === ROUTER_SYSTEM_PROMPT) {
        calls.router.push(body);
        return respond(router.shift() ?? { status: 500 }, init?.signal ?? undefined);
      }
      if (system === JUDGE_SYSTEM_PROMPT) {
        calls.judge.push(body);
        return respond(judge.shift() ?? { status: 500 }, init?.signal ?? undefined);
      }
      throw new Error("unexpected OpenRouter call");
    }
    if (url === GENERATION_ENDPOINT) {
      calls.generation.push(body);
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: script.generation ?? "Respuesta" } }] }), {
          status: 200,
        }),
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

export const OPENROUTER_VARS = {
  OPENROUTER_API_KEY: "or-test-key",
  OPENROUTER_MODEL: "test/model",
  OPENROUTER_TIMEOUT_MS: "50",
};
