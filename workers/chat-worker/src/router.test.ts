import { afterEach, describe, expect, it, vi } from "vitest";

import { readAdaptiveConfig } from "./config";
import { parseJsonObject } from "./openrouter";
import { buildRouterMessages, parseRouterOutput, ROUTER_SCHEMA, routeMessage } from "./router";
import { OPENROUTER_VARS, stubFetch } from "./test-utils";

const config = readAdaptiveConfig(OPENROUTER_VARS);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseRouterOutput (strict validation)", () => {
  it("accepts a valid search decision and normalizes whitespace in the query", () => {
    expect(parseRouterOutput({ route: "search", hire_intent: false, query: "  stack de   Ramiro " })).toEqual({
      route: "search",
      hireIntent: false,
      query: "stack de Ramiro",
    });
  });

  it("accepts smalltalk and off_topic with an empty query", () => {
    expect(parseRouterOutput({ route: "smalltalk", hire_intent: false, query: "" })?.route).toBe("smalltalk");
    expect(parseRouterOutput({ route: "off_topic", hire_intent: false, query: "" })?.route).toBe("off_topic");
  });

  it.each<[Record<string, unknown>, string]>([
    [{ route: "about_ramiro", hire_intent: false, query: "x" }, "unknown label"],
    [{ route: "SEARCH", hire_intent: false, query: "x" }, "label casing"],
    [{ route: "search", hire_intent: "true", query: "x" }, "string boolean"],
    [{ route: "search", query: "x" }, "missing hire_intent"],
    [{ route: "search", hire_intent: false }, "missing query"],
    [{ route: "search", hire_intent: false, query: "   " }, "empty search query"],
    [{ route: "search", hire_intent: false, query: "x".repeat(301) }, "runaway query"],
  ])("rejects %j (%s)", (value, _reason) => {
    expect(parseRouterOutput(value)).toBeNull();
  });
});

describe("parseJsonObject", () => {
  it("parses a bare object and a ```json fenced object", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("rejects prose, arrays and truncated JSON", () => {
    expect(parseJsonObject('Sure! {"a":1}')).toBeNull();
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject('{"route": "sea')).toBeNull();
  });
});

describe("routeMessage", () => {
  it("makes ONE OpenRouter call returning route + hire intent + standalone query", async () => {
    const { calls, fetchMock } = stubFetch({
      router: [{ json: { route: "search", hire_intent: true, query: "disponibilidad de Ramiro para proyectos freelance" } }],
    });
    const history = [
      { role: "user" as const, content: "¿Qué hace Ramiro?" },
      { role: "assistant" as const, content: "Es Full-Stack Engineer." },
    ];
    const decision = await routeMessage("¿y está disponible para un freelance?", history, config);
    expect(decision).toMatchObject({
      route: "search",
      hireIntent: true,
      query: "disponibilidad de Ramiro para proyectos freelance",
      via: "llm",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = calls.router[0] as Record<string, any>;
    expect(body.model).toBe("test/model");
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(256);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: ROUTER_SCHEMA.name, strict: true, schema: ROUTER_SCHEMA.schema },
    });
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.messages[1].content).toContain("Es Full-Stack Engineer.");
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer or-test-key");
  });

  it("uses the raw message as the nominal query for non-search routes", async () => {
    stubFetch({ router: [{ json: { route: "smalltalk", hire_intent: false, query: "" } }] });
    const decision = await routeMessage("hola!", undefined, config);
    expect(decision).toMatchObject({ route: "smalltalk", query: "hola!", via: "llm" });
  });

  it("does not call OpenRouter when the model or the key is missing", async () => {
    const { fetchMock } = stubFetch();
    for (const vars of [{ OPENROUTER_API_KEY: "k" }, { OPENROUTER_MODEL: "m" }, { OPENROUTER_MODEL: "  ", OPENROUTER_API_KEY: "k" }]) {
      const decision = await routeMessage("hola", undefined, readAdaptiveConfig(vars));
      expect(decision).toEqual({ route: "search", hireIntent: false, query: "hola", via: "not_configured" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ content: "I think this is smalltalk" }, "invalid_json"],
    [{ json: { route: "chitchat", hire_intent: true, query: "" } }, "invalid_shape"],
    [{ json: { route: "search", hire_intent: true } }, "invalid_shape"],
    [{ status: 429 }, "http_429"],
    [{ status: 500 }, "http_500"],
    [{ error: new TypeError("fetch failed") }, "network"],
    ["hang", "timeout"],
  ] as const)("falls back to search/raw message/no hire intent on %j", async (answer, via) => {
    stubFetch({ router: [answer] });
    const decision = await routeMessage("¿Quién es?", undefined, config);
    expect(decision).toMatchObject({ route: "search", hireIntent: false, query: "¿Quién es?", via });
  });

  it("drops hire_intent too when the rest of the JSON is invalid (all-or-nothing)", async () => {
    stubFetch({ router: [{ json: { route: "search", hire_intent: true, query: "" } }] });
    const decision = await routeMessage("quiero contratarlo", undefined, config);
    expect(decision.hireIntent).toBe(false);
  });

  it("honours OPENROUTER_RESPONSE_FORMAT and OPENROUTER_REASONING_EFFORT", async () => {
    const { calls } = stubFetch({
      router: [{ json: { route: "off_topic", hire_intent: false, query: "" } }, { json: { route: "off_topic", hire_intent: false, query: "" } }],
    });
    await routeMessage("x", undefined, readAdaptiveConfig({ ...OPENROUTER_VARS, OPENROUTER_RESPONSE_FORMAT: "none", OPENROUTER_REASONING_EFFORT: "low" }));
    await routeMessage("x", undefined, readAdaptiveConfig({ ...OPENROUTER_VARS, OPENROUTER_RESPONSE_FORMAT: "json_object" }));
    const [none, object] = calls.router as Array<Record<string, unknown>>;
    expect(none.response_format).toBeUndefined();
    expect(none.provider).toBeUndefined();
    expect(none.reasoning).toEqual({ effort: "low", exclude: true });
    expect(object.response_format).toEqual({ type: "json_object" });
    expect(object.reasoning).toBeUndefined();
  });
});

describe("buildRouterMessages", () => {
  it("keeps only the last 4 history turns, truncated", () => {
    const history = Array.from({ length: 6 }, (_, i) => ({ role: "user" as const, content: `turno ${i} ${"x".repeat(500)}` }));
    const [, user] = buildRouterMessages("nuevo", history);
    expect(user.content).not.toContain("turno 1");
    expect(user.content).toContain("turno 2");
    expect(user.content).not.toContain("x".repeat(401));
    expect(user.content).toContain("nuevo");
  });
});
