import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language";

describe("detectLanguage", () => {
  it("detects Spanish (AE2)", () => {
    expect(detectLanguage("¿Qué proyectos hizo Ramiro?")).toBe("es");
    expect(detectLanguage("¿Dónde trabajás?")).toBe("es");
    expect(detectLanguage("Hola, ¿cómo estás? Contame sobre tu experiencia.")).toBe("es");
  });

  it("detects English (AE1)", () => {
    expect(detectLanguage("What projects has Ramiro built?")).toBe("en");
    expect(detectLanguage("Where do you work?")).toBe("en");
    expect(detectLanguage("Tell me about his experience and skills")).toBe("en");
  });

  it("defaults to Spanish on a tie (D7)", () => {
    // "how" (en) + "estás" (es) -> tie -> es
    expect(detectLanguage("how estás")).toBe("es");
  });

  it("defaults to Spanish on empty or whitespace input (D7)", () => {
    expect(detectLanguage("")).toBe("es");
    expect(detectLanguage("   ")).toBe("es");
  });
});
