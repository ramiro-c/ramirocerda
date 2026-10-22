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

La idea es separar las dos cosas que el juez mezcla. Primero, el caso: una entrada, las herramientas que puede usar, lo que quedó grabado de la conversación (los turnos, con el resultado de cada tool call) y qué se espera realmente.

```json
{
  "id": "refund-status",
  "prompt": "¿Cuál es el estado de mi reembolso?",
  "expected_tools": ["kb_search"],
  "expected_tool_args": { "kb_search": { "query": "estado reembolso" } },
  "expected_numbers": ["1234"],
  "expected_facts": ["reembolso 1234 fue aprobado"],
  "forbidden_phrases": ["como IA no puedo"],
  "expected_language": "es"
}
```

Los `turns` grabados van en el mismo caso, con el resultado de cada tool call; con eso el suite se puede correr en modo replay, sin llamar al agente ni a la red.

Segundo, el grader: cada regla es un programa que recibe la conversación y el caso, y devuelve pass/fail con un motivo. No hay modelo en el medio.

Los graders que valen la pena cuando el agente tiene herramientas (los seis que corren en el harness):

- **`tool_usage`**: usó las que debía usar (`expected_tools`) y no las que no debía (`forbidden_tools`). Borrar una cuenta o mandar un email cuando toca consultar el conocimiento son bugs reales, no detalles de estilo.
- **`tool_args`**: los argumentos importan. Un caso fija un subconjunto esperado de argumentos por herramienta; si ninguna call los matchea, falla.
- **`numeric_grounding`**: todo número que el agente afirma tiene que verse en el resultado de alguna tool call, y cada número que el caso exige tiene que aparecer en la respuesta. Si el KB dice 1234 y el agente contesta 9999, falla con el número ofensor en el detalle. Esto mata las alucinaciones numéricas, que son las más caras porque nadie las nota hasta Billing.
- **`fact_grounding`**: cada afirmación esperada tiene que aparecer en la respuesta Y estar respaldada por una tool call. No es "la respuesta es correcta", es "la respuesta cita lo que dice la fuente".
- **`no_forbidden_content`**: frases que el agente nunca debe decir ("como IA no puedo..."). El matching ignora mayúsculas, acentos y puntuación.
- **`language`**: la respuesta tiene que estar en el idioma que usó el usuario, detectado por stopwords, sin pedirle nada a un modelo.

Y el runner corre todos los casos contra los seis graders, calcula el pass-rate y sale con `exit code 1` cuando baja del umbral:

```bash
PYTHONPATH=src python3 -m agent_evals.cli casos.json --threshold 1.0
```

Una tabla por caso con el motivo exacto de cada falta, un `--report` en JSON para el artefacto del CI. Eso es lo que lo hace usable en CI: no es un script que alguien corre a mano, es una puerta.

## Dónde esto NO alcanza

No quiero vender humo: los evals deterministas verifican hechos, llamadas y límites. No verifican si la respuesta es *buena*.

- ¿Ayudó de verdad al usuario? ¿Es clara? ¿Es el tono correcto? → eso es subjetivo, y un juez LLM (o una persona) sigue siendo lo único razonable.
- ¿El agente tomó el camino más eficiente? Eso es un problema de costo y latencia, no de correctitud.

Mi regla: el juez LLM entra sólo sobre lo que los graders no pueden cubrir, y corre sobre un subconjunto chico, no sobre todo el suite. Si el juez es el único que evalúa, no tenés tests: tenés opiniones con latencia.

## El asset

Lo dejé en [ramiro-c/agent-evals](https://github.com/ramiro-c/agent-evals): el paquete, los graders, el runner, los tests y un ejemplo sintético de agente de soporte con un caso por cada modo de falla. Es framework-agnostic y sólo stdlib, así que entra en cualquier pipeline sin tocar el entorno.

Y aviso algo: el harness que uso en producción vive en un repo privado. Lo que está afuera es el método y un ejemplo de juguete, no el código de producción. Si te sirve la idea, copiá el formato de caso.

Cerrando: los agentes no se testearon con mocks, se testearon con contratos. El snapshot te dice que algo cambió; el caso dorado te dice qué se rompió.
