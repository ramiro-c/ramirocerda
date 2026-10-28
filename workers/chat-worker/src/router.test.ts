import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_DECISION_ENDPOINT, DEFAULT_DECISION_MODEL, readAdaptiveConfig } from "./config";
import { DECISION_USER_AGENT, parseAnswer, parseDecisionResponse } from "./decision";
import {
  buildRouterState,
  contextualQuery,
  HIRE_INTENT_QUESTION,
  NEEDS_HISTORY_QUESTION,
  ROUTE_QUESTION,
  routeMessage,
  routerQuestions,
} from "./router";
import { DECISION_OFF, DECISION_VARS, routerAnswer, stubFetch } from "./test-utils";

const config = readAdaptiveConfig(DECISION_VARS);
const history = [
  { role: "user" as const, content: "¿Dónde trabaja Ramiro?" },
  { role: "assistant" as const, content: "Trabaja en LDP desde 2025." },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseAnswer / parseDecisionResponse (strict System One validation)", () => {
  it("accepts a valid choice and a valid noul", () => {
    expect(parseAnswer(ROUTE_QUESTION, { type: "choice", choice: "search", confidence: 0.8, probabilities: {} })).toEqual({
      type: "choice",
      choice: "search",
      confidence: 0.8,
    });
    expect(parseAnswer(HIRE_INTENT_QUESTION, { type: "noul", noul: 0.98 })).toEqual({ type: "noul", noul: 0.98 });
  });

  it.each<[unknown, string]>([
    [{ type: "choice", choice: "about_ramiro", confidence: 0.9 }, "unknown option"],
    [{ type: "choice", choice: "SEARCH", confidence: 0.9 }, "option casing"],
    [{ type: "choice", choice: "toString", confidence: 0.9 }, "prototype key"],
    [{ type: "choice", choice: "search", confidence: 1.4 }, "confidence out of range"],
    [{ type: "choice", choice: "search" }, "missing confidence"],
    [{ type: "noul", noul: 0.9 }, "wrong answer type"],
    ["search", "bare string"],
    [null, "null"],
  ])("rejects route answer %j (%s)", (value, _reason) => {
    expect(parseAnswer(ROUTE_QUESTION, value)).toBeNull();
  });

  it.each<[unknown, string]>([
    [{ type: "noul", noul: "0.9" }, "string number"],
    [{ type: "noul", noul: -0.1 }, "negative"],
    [{ type: "noul", noul: Number.NaN }, "NaN"],
    [{ type: "noul", noul: true }, "boolean"],
    [{ type: "choice", choice: "true", confidence: 1 }, "wrong answer type"],
  ])("rejects noul answer %j (%s)", (value, _reason) => {
    expect(parseAnswer(HIRE_INTENT_QUESTION, value)).toBeNull();
  });

  it("requires an answer for every question asked and reads usage", () => {
    const questions = routerQuestions(false);
    const answers = {
      route: { type: "choice", choice: "smalltalk", confidence: 1 },
      hire_intent: { type: "noul", noul: 0.1 },
    };
    expect(parseDecisionResponse(questions, { answers, usage: { input_tokens: 541, output_tokens: 3 } })?.usage).toEqual({
      inputTokens: 541,
      outputTokens: 3,
    });
    expect(parseDecisionResponse(questions, { answers: { route: answers.route } })).toBeNull();
    expect(parseDecisionResponse(questions, { choices: [] })).toBeNull();
    expect(parseDecisionResponse(questions, [answers])).toBeNull();
  });
});

describe("routeMessage", () => {
  it("makes ONE System One request with the real wire shape (model, state, typed questions), anonymous by default", async () => {
    const { calls, fetchMock } = stubFetch({ router: [routerAnswer("search", { hire: 0.98, needsHistory: 0.1 })] });
    const decision = await routeMessage("¿y está disponible para un freelance?", history, config);
    expect(decision).toMatchObject({ route: "search", hireIntent: true, query: "¿y está disponible para un freelance?", via: "llm" });
    expect(decision.usage).toEqual({ inputTokens: 550, outputTokens: 3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(DEFAULT_DECISION_ENDPOINT);
    const body = calls.router[0];
    expect(Object.keys(body).sort()).toEqual(["model", "questions", "state"]);
    expect(body.model).toBe(DEFAULT_DECISION_MODEL);
    expect(body.state).toEqual({ conversation: history, latest_message: "¿y está disponible para un freelance?" });
    expect(body.questions).toEqual({ route: ROUTE_QUESTION, hire_intent: HIRE_INTENT_QUESTION, needs_history: NEEDS_HISTORY_QUESTION });
    const headers = calls.decisionHeaders[0];
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe(DECISION_USER_AGENT);
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.stringify(headers)).not.toContain("opencode");
  });

  it("sends Bearer DECISION_API_KEY when the optional secret is set", async () => {
    const { calls } = stubFetch({ router: [routerAnswer("smalltalk")] });
    await routeMessage("hola", undefined, readAdaptiveConfig({ ...DECISION_VARS, DECISION_API_KEY: " console-key " }));
    expect(calls.decisionHeaders[0].Authorization).toBe("Bearer console-key");
  });

  it("asks needs_history only when there is a previous user turn", async () => {
    const { calls } = stubFetch({ router: [routerAnswer("smalltalk")] });
    await routeMessage("hola", undefined, config);
    expect(Object.keys(calls.router[0].questions)).toEqual(["route", "hire_intent"]);
  });

  it("searches with previous user turn + message when the model says it needs the history; the raw message is the alternate", async () => {
    stubFetch({ router: [routerAnswer("search", { needsHistory: 0.93 })] });
    const decision = await routeMessage("¿Y antes de eso?", history, config);
    expect(decision).toMatchObject({
      route: "search",
      query: "¿Dónde trabaja Ramiro? ¿Y antes de eso?",
      alternateQuery: "¿Y antes de eso?",
      scores: { routeConfidence: 0.97, hireIntent: 0.03, needsHistory: 0.93 },
    });
  });

  it("keeps the raw message for standalone follow-ups, with the contextual query as the alternate", async () => {
    stubFetch({ router: [routerAnswer("search", { needsHistory: 0.12 })] });
    const decision = await routeMessage("¿Qué stack usa?", history, config);
    expect(decision).toMatchObject({ query: "¿Qué stack usa?", alternateQuery: "¿Dónde trabaja Ramiro? ¿Qué stack usa?" });
  });

  it("uses the raw message and no alternate for non-search routes", async () => {
    stubFetch({ router: [routerAnswer("smalltalk", { needsHistory: 0.9 })] });
    const decision = await routeMessage("¡gracias!", history, config);
    expect(decision).toMatchObject({ route: "smalltalk", query: "¡gracias!", alternateQuery: null, via: "llm" });
  });

  it("does not trust a low-confidence smalltalk/off_topic route: searches instead", async () => {
    stubFetch({ router: [routerAnswer("off_topic", { confidence: 0.41 })] });
    const decision = await routeMessage("¿Sabe de Kubernetes?", undefined, config);
    expect(decision).toMatchObject({ route: "search", via: "llm" });
  });

  it("does not call the decision model when DECISION_MODEL or DECISION_ENDPOINT is empty", async () => {
    const { fetchMock } = stubFetch();
    for (const vars of [DECISION_OFF, { DECISION_ENDPOINT: "  " }]) {
      const decision = await routeMessage("hola", undefined, readAdaptiveConfig(vars));
      expect(decision).toEqual({ route: "search", hireIntent: false, query: "hola", alternateQuery: null, via: "not_configured" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ text: "<html>Bad gateway</html>" }, "invalid_json"],
    [{ body: { choices: [{ message: { content: '{"route":"search"}' } }] } }, "invalid_shape"],
    [routerAnswer("chitchat", { hire: 0.99 }), "invalid_shape"],
    [{ answers: { route: { type: "choice", choice: "search", confidence: 0.9 } } }, "invalid_shape"],
    [{ status: 400 }, "http_400"],
    [{ status: 401 }, "http_401"],
    [{ status: 429 }, "http_429"],
    [{ status: 500 }, "http_500"],
    [{ error: new TypeError("fetch failed") }, "network"],
    ["hang", "timeout"],
  ] as const)("falls back to search / raw message / no hire intent on %j", async (answer, via) => {
    stubFetch({ router: [answer] });
    const decision = await routeMessage("quiero contratarlo", history, config);
    expect(decision).toEqual({ route: "search", hireIntent: false, query: "quiero contratarlo", alternateQuery: null, via });
  });
});

describe("router state", () => {
  it("keeps only the last 4 history turns, truncated to 400 chars", () => {
    const long = Array.from({ length: 6 }, (_, i) => ({ role: "user" as const, content: `turno ${i} ${"x".repeat(500)}` }));
    const state = buildRouterState("nuevo", long);
    expect(state.conversation).toHaveLength(4);
    expect(state.conversation[0].content.startsWith("turno 2")).toBe(true);
    expect(state.conversation[0].content).toHaveLength(400);
    expect(state.latest_message).toBe("nuevo");
  });

  it("builds the contextual query from the previous USER turn, capped at 300 chars keeping the message", () => {
    expect(contextualQuery("¿y antes?", undefined)).toBeNull();
    expect(contextualQuery("¿y antes?", [{ role: "assistant", content: "Hola" }])).toBeNull();
    const q = contextualQuery("¿y antes?", [{ role: "user", content: "a".repeat(400) }]);
    expect(q).toHaveLength(300);
    expect(q?.endsWith(" ¿y antes?")).toBe(true);
  });
});
