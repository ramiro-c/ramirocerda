import { describe, expect, it, vi } from "vitest";

import { readAdaptiveConfig } from "./config";
import { heuristicRoute, matchSmalltalk, normalize, parseRouteLabel, routeMessage } from "./router";

const config = readAdaptiveConfig({});

function aiReturning(response: unknown) {
  const run = vi.fn().mockResolvedValue({ response });
  return { env: { AI: { run } }, run };
}

describe("router heuristics", () => {
  it.each([
    ["hola", "greeting", "es"],
    ["¡Hola Botardo! ¿Qué tal?", "greeting", "es"],
    ["buenas tardes", "greeting", "es"],
    ["Hi!", "greeting", "en"],
    ["hello hello", "greeting", "en"],
    ["Hey there, how's it going?", "greeting", "en"],
    ["good morning", "greeting", "en"],
    ["gracias!!", "thanks", "es"],
    ["thank you so much", "thanks", "en"],
    ["thanks", "thanks", "en"],
    ["chau, gracias", "bye", "es"],
    ["ok", "ack", undefined],
    ["jajaja genial", "ack", "es"],
  ])("classifies %j as smalltalk kind %s", (message, kind, lang) => {
    expect(matchSmalltalk(message)).toEqual({ kind, lang });
  });

  it("rejects messages with any non-smalltalk token", () => {
    expect(matchSmalltalk("hello world")).toBeNull();
    expect(matchSmalltalk("hola, contame un chiste")).toBeNull();
  });

  it("does not treat a greeting plus a question as smalltalk", () => {
    expect(matchSmalltalk("hola, ¿dónde trabaja Ramiro?")).toBeNull();
    expect(heuristicRoute("hola, ¿dónde trabaja Ramiro?")).toEqual({ route: "about_ramiro", via: "heuristic" });
  });

  it("does not treat 'que onda la factory' as smalltalk", () => {
    expect(heuristicRoute("que onda la factory")?.route).toBe("about_ramiro");
  });

  it.each([
    "¿Qué proyectos hizo Ramiro?",
    "What is his tech stack?",
    "¿Dónde trabajás?",
    "¿Quién sos?",
    "Does he have any certifications?",
    "¿Cómo lo contacto por LinkedIn?",
  ])("routes %j to about_ramiro without an LLM call", (message) => {
    expect(heuristicRoute(message)).toEqual({ route: "about_ramiro", via: "heuristic" });
  });

  it("leaves ambiguous messages to the LLM", () => {
    expect(heuristicRoute("What is the capital of France?")).toBeNull();
    expect(heuristicRoute("¿y antes de eso?")).toBeNull();
  });

  it("normalizes accents, case and punctuation", () => {
    expect(normalize("¡Buenos DÍAS!!")).toBe("buenos dias");
  });
});

describe("parseRouteLabel", () => {
  it("accepts label variants", () => {
    expect(parseRouteLabel("off_topic")).toBe("off_topic");
    expect(parseRouteLabel("Label: Off-topic.")).toBe("off_topic");
    expect(parseRouteLabel("smalltalk")).toBe("smalltalk");
    expect(parseRouteLabel("about_ramiro")).toBe("about_ramiro");
  });

  it("returns null for unknown output", () => {
    expect(parseRouteLabel("maybe?")).toBeNull();
    expect(parseRouteLabel(null)).toBeNull();
  });
});

describe("routeMessage", () => {
  it("never calls the LLM when the heuristics decide", async () => {
    const { env, run } = aiReturning("off_topic");
    const decision = await routeMessage("hola", [], env, config);
    expect(decision.route).toBe("smalltalk");
    expect(run).not.toHaveBeenCalled();
  });

  it("uses the small LLM for ambiguous messages, with temperature 0 and a tiny budget", async () => {
    const { env, run } = aiReturning("off_topic");
    const decision = await routeMessage("What is the capital of France?", [], env, config);
    expect(decision).toEqual({ route: "off_topic", via: "llm" });
    const [model, input] = run.mock.calls[0];
    expect(model).toBe(config.routerModel);
    expect(input).toMatchObject({ temperature: 0, max_tokens: 8 });
  });

  it("passes recent history to the LLM so follow-ups are not refused", async () => {
    const { env, run } = aiReturning("about_ramiro");
    const history = [
      { role: "user" as const, content: "¿Dónde trabaja Ramiro?" },
      { role: "assistant" as const, content: "En LDP como Tech Lead." },
    ];
    const decision = await routeMessage("¿y antes de eso?", history, env, config);
    expect(decision.route).toBe("about_ramiro");
    expect(run.mock.calls[0][1].messages[1].content).toContain("En LDP como Tech Lead.");
  });

  it("fails open to about_ramiro when the LLM throws", async () => {
    const env = { AI: { run: vi.fn().mockRejectedValue(new Error("boom")) } };
    expect(await routeMessage("What is the capital of France?", [], env, config)).toEqual({
      route: "about_ramiro",
      via: "fallback",
    });
  });

  it("fails open to about_ramiro when the LLM times out", async () => {
    vi.useFakeTimers();
    try {
      const env = { AI: { run: vi.fn().mockReturnValue(new Promise(() => {})) } };
      const pending = routeMessage("What is the capital of France?", [], env, { ...config, routerTimeoutMs: 50 });
      await vi.advanceTimersByTimeAsync(60);
      expect(await pending).toEqual({ route: "about_ramiro", via: "fallback" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails open to about_ramiro on an unparsable label", async () => {
    const { env } = aiReturning("I think this is about France");
    expect((await routeMessage("What is the capital of France?", [], env, config)).route).toBe("about_ramiro");
  });

  it("skips the LLM when ROUTER_LLM_ENABLED=false", async () => {
    const { env, run } = aiReturning("off_topic");
    const decision = await routeMessage("What is the capital of France?", [], env, {
      ...config,
      routerLlmEnabled: false,
    });
    expect(decision).toEqual({ route: "about_ramiro", via: "disabled" });
    expect(run).not.toHaveBeenCalled();
  });
});
