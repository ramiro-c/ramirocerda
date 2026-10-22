---
slug: orquestador-langgraph
kind: personal
featured: true
order: 6
track: "ai-systems"
tags: ["Python", "LangGraph", "Multi-Agent", "Tavily"]
repo: https://github.com/ramiro-c/orquestador-langgraph
es:
  title: "Orquestador multi-agente con LangGraph"
  summary: "Supervisor jerárquico armado a mano en LangGraph: un researcher busca con Tavily, un analyst puntúa sentimiento, el supervisor decide si falta alguien y un writer cierra el brief. Cada salto condicional se lee como código."
  problem: "Un sistema multi-agente con un framework de portero automático esconde las decisiones: qué especialista falta, cuándo termina, quién escribe el resultado. Cuando algo sale mal no hay forma de saber qué decidió el sistema."
  what: "El grafo padre es un `StateGraph` armado a mano y los especialistas son agentes de `create_agent`, así que las aristas condicionales (researcher / analyst / FINISH) se leen como código. `FINISH` no corta el grafo: pasa por el writer, que escribe `output.md`. El supervisor evalúa el estado —qué findings hay, qué falta— y decide; el demo expone los hops y deja las trazas en `traces/` para reconstruir por qué se tomó cada camino."
  highlights:
    - "Grafo a mano: las aristas condicionales son código, no configuración."
    - "Especialistas con `create_agent` (el `create_react_agent` quedó deprecado en LangGraph v1)."
    - "`FINISH` pasa por el writer: el brief se escribe en `output.md`."
    - "Trazas por hop en `traces/` para reconstruir cada decisión del supervisor."
    - "Pre-entrega del curso de AI Engineering de Coderhouse."
  stack: ["Python 3.12", "LangGraph", "LangChain", "Tavily", "OpenRouter", "pytest"]
en:
  title: "Multi-agent orchestrator with LangGraph"
  summary: "A hierarchical supervisor built by hand in LangGraph: a researcher searches with Tavily, an analyst scores sentiment, the supervisor decides whether anyone is missing, and a writer closes the brief. Every conditional jump reads like code."
  problem: "A multi-agent system behind an automatic router hides the decisions: which specialist is missing, when it ends, who writes the result. When something goes wrong there is no way to know what the system decided."
  what: "The parent graph is a hand-built `StateGraph` and the specialists are `create_agent` agents, so the conditional edges (researcher / analyst / FINISH) read like code. `FINISH` does not cut the graph short: it goes through the writer, which writes `output.md`. The supervisor evaluates the state — which findings exist, what is missing — and decides; the demo exposes the hops and leaves the traces in `traces/` so you can reconstruct why each path was taken."
  highlights:
    - "Hand-built graph: the conditional edges are code, not configuration."
    - "Specialists built with `create_agent` (`create_react_agent` is deprecated in LangGraph v1)."
    - "`FINISH` goes through the writer: the brief is written to `output.md`."
    - "Per-hop traces in `traces/` to reconstruct every supervisor decision."
    - "Pre-delivery of the Coderhouse AI Engineering course."
  stack: ["Python 3.12", "LangGraph", "LangChain", "Tavily", "OpenRouter", "pytest"]

---
