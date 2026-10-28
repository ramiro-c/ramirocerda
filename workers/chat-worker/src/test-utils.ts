/**
 * Test helpers: a scripted fetch that plays the decision endpoint (OpenCode
 * System One, Jev) and OpenCode Go generation. Router and judge requests are
 * told apart by their question names ("route" vs "sufficient"), and answers
 * use the real System One response shape. Only imported by *.test.ts files.
 */
import { vi } from "vitest";

import { DEFAULT_DECISION_ENDPOINT } from "./config";

export const GENERATION_ENDPOINT = "https://opencode.example/v1/chat/completions";
export const DECISION_ENDPOINT = DEFAULT_DECISION_ENDPOINT;

/**
 * One scripted decision answer: an `answers` map (wrapped in a System One body),
 * a raw response body (JSON value or non-JSON text), an HTTP status, a thrown
 * error, or "hang" (only resolves by abort).
 */
export type ScriptedAnswer =
  | { answers: Record<string, unknown> }
  | { body: unknown }
  | { text: string }
  | { status: number }
  | { error: Error }
  | "hang";

export interface FetchScript {
  router?: ScriptedAnswer[];
  judge?: ScriptedAnswer[];
  generation?: string;
}

/** System One choice answer for the router's `route` question (+ hire_intent / needs_history nouls). */
export function routerAnswer(
  route: string,
  opts: { hire?: number; needsHistory?: number; confidence?: number } = {},
): ScriptedAnswer {
  const confidence = opts.confidence ?? 0.97;
  return {
    answers: {
      route: { type: "choice", choice: route, confidence, probabilities: { [route]: confidence } },
      hire_intent: { type: "noul", noul: opts.hire ?? 0.03 },
      ...(opts.needsHistory === undefined ? {} : { needs_history: { type: "noul", noul: opts.needsHistory } }),
    },
  };
}

export const judgeAnswer = (sufficient: number): ScriptedAnswer => ({
  answers: { sufficient: { type: "noul", noul: sufficient } },
});

function respond(answer: ScriptedAnswer, signal: AbortSignal | undefined, model: string): Promise<Response> {
  if (answer === "hang") {
    return new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  }
  if ("error" in answer) return Promise.reject(answer.error);
  if ("status" in answer) {
    return Promise.resolve(new Response(JSON.stringify({ detail: "upstream error" }), { status: answer.status }));
  }
  if ("text" in answer) return Promise.resolve(new Response(answer.text, { status: 200 }));
  const body =
    "body" in answer
      ? answer.body
      : {
          model,
          answers: answer.answers,
          usage: { input_tokens: 550, output_tokens: 3, cost: 0, opencode: { billing_source: "free" } },
        };
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

export function stubFetch(script: FetchScript = {}) {
  const router = [...(script.router ?? [])];
  const judge = [...(script.judge ?? [])];
  const calls = {
    router: [] as Array<Record<string, any>>,
    judge: [] as Array<Record<string, any>>,
    generation: [] as unknown[],
    decisionHeaders: [] as Array<Record<string, string>>,
  };
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (url === DECISION_ENDPOINT) {
      calls.decisionHeaders.push({ ...(init?.headers as Record<string, string>) });
      const names = Object.keys(body.questions ?? {});
      if (names.includes("route")) {
        calls.router.push(body);
        return respond(router.shift() ?? { status: 500 }, init?.signal ?? undefined, body.model);
      }
      if (names.includes("sufficient")) {
        calls.judge.push(body);
        return respond(judge.shift() ?? { status: 500 }, init?.signal ?? undefined, body.model);
      }
      throw new Error(`unexpected decision questions ${names.join(",")}`);
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

/** Decision model on with defaults (jev-1.13-free, anonymous) and a short timeout for the "hang" tests. */
export const DECISION_VARS = { DECISION_TIMEOUT_MS: "50" };
/** Decision model off: the linear pipeline. */
export const DECISION_OFF = { DECISION_MODEL: "" };
