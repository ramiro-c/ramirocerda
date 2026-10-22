---
title: "Testear agentes sin juez LLM"
description: "Un harness de evals deterministas para agentes: casos dorados, graders verificables y un umbral de passage que corta el CI. Por qué el juez LLM no debería ser la primera opción."
pubDate: 2026-10-22
lang: "es"
draft: false
relatedProjects: ["spec-refinery", "rag-citation-agent"]
---

Probar un agente es raro. Un test normal verifica una función: entrada, salida, listo. Un agente decide en runtime qué herramienta usar, con qué argumentos, y qué contestar. Si lo probás por el texto que devuelve, cada cambio de modelo te rompe el suite y cada error real se esconde adentro de un snapshot que nadie lee.

Existe una salida conocida: un "juez" con LLM que califica la respuesta. Es flexible, pero tiene tres problemas que me hicieron buscar otra cosa: no es determinista (la misma entrada se califica distinto según el día), no es barato (pagás una llamada por caso, por iteración) y no es diagnosticable (cuando falla no te dice QUÉ se rompió: si fue una herramienta mal llamada, un número inventado, o un idioma incorrecto).

## La alternativa: casos dorados y graders deterministas

La idea es separar las dos cosas que el juez mezcla. Primero, el caso: una entrada, el contexto que el agente tiene disponible, las herramientas que puede usar y qué se espera realmente.

```yaml
id: invoice-total
input: "¿Cuánto gasté en hosting en marzo?"
context:
  - "Hosting marzo 2026: USD 42.50 (factura 0031)"
tools_available: [kb_search, calculator]
expect:
  tools_called:
    - name: kb_search
      args: { query: "hosting marzo 2026" }
    - name: calculator
      args: { expression: "42.50" }
  numeric_claims:
    - value: 42.50
      must_appear_in_context: true
  forbidden_content: ["no puedo ver tus facturas"]
  language: es
```

Segundo, el grader: cada regla es un programa que recibe la conversación y el caso, y devuelve pass/fail con un motivo. No hay modelo en el medio.

Los graders que valen la pena cuando el agente tiene herramientas:

- **Herramientas**: usó las que debía usar y no las que no debía. Y los argumentos importan: llamar `calculator` con `42.50` en vez de `"42.50"` es un bug real, no un detalle de estilo.
- **Grounding numérico**: todo número que el agente afirma tiene que aparecer en el contexto. Si dice 42.50 y el contexto dice 42.50, pasa. Si dice 4250, falla. Esto mata las alucinaciones numéricas, que son las más caras porque nadie las nota hasta el Billing.
- **Grounding factual**: cada afirmación atribuible a una fuente tiene que traer su cita. No es "la respuesta es correcta", es "la respuesta cita lo que dice".
- **Contenido prohibido**: frases que el agente nunca debe decir ("como IA no puedo...", "no tengo acceso a tus datos", prometer lo que no puede hacer).
- **Idioma**: la respuesta tiene que estar en el idioma que usó el usuario, detectado con stopwords, sin pedirle nada a un modelo.

Y el runner corre todos los casos, calcula el pass-rate y sale con exit code distinto de cero cuando baja del umbral. Eso es lo que lo hace usable en CI: no es un script que alguien corre a mano, es una puerta.

## Dónde esto NO alcanza

No quiero vender humo: los evals deterministas verifican hechos, llamadas y límites. No verifican si la respuesta es *buena*.

- ¿Ayudó de verdad al usuario? ¿Es clara? ¿Es el tono correcto? → eso es subjetivo, y un juez LLM (o una persona) sigue siendo lo único razonable.
- ¿El agente tomó el camino más eficiente? Eso es un problema de costo y latencia, no de correctitud.

Mi regla: el juez LLM entra sólo sobre lo que los graders no pueden cubrir, y corre sobre un subconjunto chico, no sobre todo el suite. Si el juez es el único que evalúa, no tenés tests: tenés opiniones con latencia.

## El asset

Lo dejé en [ramiro-c/agent-evals](https://github.com/ramiro-c/agent-evals): el paquete, los graders, el runner, los tests y un ejemplo sintético de agente de soporte con un caso por cada modo de falla. Es framework-agnostic y sólo stdlib, así que entra en cualquier pipeline sin tocar el entorno.

Y aviso algo: el harness que uso en producción vive en un repo privado. Lo que está afuera es el método y un ejemplo de juguete, no el código de producción. Si te sirve la idea, copiá el formato de caso.

Cerrando: los agentes no se testearon con mocks, se testearon con contratos. El snapshot te dice que algo cambió; el caso dorado te dice qué se rompió.
