import { describe, expect, it } from "vitest";

import { detectServicesIntent } from "./intent";

describe("detectServicesIntent", () => {
  it("detects Spanish hiring / services intent", () => {
    for (const msg of [
      "Quiero contratar a Ramiro para un proyecto",
      "¿Está disponible para proyectos freelance?",
      "Necesito un chatbot para mi empresa",
      "¿Cuánto cobra? Quiero un presupuesto",
      "Me gustaría trabajar con él",
      "Tenemos un proyecto y buscamos un desarrollador",
      "¿Cómo lo contacto?",
      "Trabajemos juntos",
    ]) {
      expect(detectServicesIntent(msg), msg).toBe(true);
    }
  });

  it("detects English hiring / services intent", () => {
    for (const msg of [
      "Can I hire Ramiro?",
      "Is he available for consulting?",
      "We need help building an AI agent for our app",
      "I'd love to work with him",
      "How can I get in touch?",
      "What are his rates for a project?",
    ]) {
      expect(detectServicesIntent(msg), msg).toBe(true);
    }
  });

  it("ignores regular profile questions", () => {
    for (const msg of [
      "¿Qué proyectos hizo Ramiro?",
      "¿Dónde trabajás?",
      "Contame sobre su experiencia",
      "What projects has Ramiro built?",
      "Where does he work?",
      "What is factory engineering?",
      "",
      "   ",
    ]) {
      expect(detectServicesIntent(msg), msg).toBe(false);
    }
  });
});
