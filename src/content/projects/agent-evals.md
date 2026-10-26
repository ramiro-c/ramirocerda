---
slug: agent-evals
kind: personal
year: "2026"
featured: true
order: 5
track: "ai-systems"
tags: ["Python", "LLM Evals", "CI"]
repo: https://github.com/ramiro-c/agent-evals
es:
  title: "agent-evals — Evals deterministas para agentes de IA"
  summary: "Harness para testear agentes con casos dorados en JSON: qué tools tiene que llamar, con qué argumentos, qué números y hechos tienen que aparecer y en qué idioma responde. El runner calcula el pass-rate contra un threshold y sale con exit code 0 o 1, así que corta el build en CI."
  problem: "Cuando cambiás el prompt, el modelo o una tool, el agente puede empezar a inventar un número o llamar la tool equivocada sin que nadie se entere. Un juez LLM te dice que algo empeoró, pero no qué se rompió ni por qué."
  what: "Cada caso dorado describe el comportamiento esperado y seis graders lo verifican sobre el transcript del agente: tool_usage, tool_args, numeric_grounding, fact_grounding, no_forbidden_content y language. El harness no sabe nada del agente: solo recibe lo que respondió y qué tools llamó, con qué argumentos y resultados. Funciona en dos modos: replay de transcripts grabados (sin modelo ni red) o corriendo tu agente real vía --agent."
  highlights:
    - "Seis graders: tool_usage, tool_args, numeric_grounding, fact_grounding, no_forbidden_content y language."
    - "Runner con threshold y exit code 0/1 para cortar el build en CI; una suite vacía no pasa."
    - "Replay de transcripts grabados o agente real vía --agent, con el contrato agent(case) -> list[Turn]."
    - "Probado contra un LLM real: agente con tool calling vía OpenRouter, con reintentos ante rate limits."
    - "Matcher `contains` en tool_args para queries que el modelo reformula, sin perder determinismo."
    - "Python stdlib, sin dependencias."
  stack: ["Python 3.11+", "unittest", "GitHub Actions", "OpenRouter"]
en:
  title: "agent-evals — Deterministic evals for AI agents"
  summary: "Harness for testing agents with golden cases in JSON: which tools it must call, with which arguments, which numbers and facts must appear, and which language it replies in. The runner computes the pass rate against a threshold and exits 0 or 1, so it gates the build in CI."
  problem: "When you change the prompt, the model, or a tool, the agent can start inventing a number or calling the wrong tool without anyone noticing. An LLM judge tells you something got worse, but not what broke or why."
  what: "Each golden case describes the expected behavior and six graders check it against the agent's transcript: tool_usage, tool_args, numeric_grounding, fact_grounding, no_forbidden_content, and language. The harness knows nothing about the agent: it only gets what it replied and which tools it called, with which arguments and results. It runs in two modes: replaying recorded transcripts (no model, no network) or running your real agent via --agent."
  highlights:
    - "Six graders: tool_usage, tool_args, numeric_grounding, fact_grounding, no_forbidden_content, and language."
    - "Runner with a threshold and exit code 0/1 to gate the build in CI; an empty suite does not pass."
    - "Replay recorded transcripts or run a real agent via --agent, with the agent(case) -> list[Turn] contract."
    - "Tested against a real LLM: a tool-calling agent via OpenRouter, with retries on rate limits."
    - "A `contains` matcher in tool_args for queries the model rephrases, without giving up determinism."
    - "Python stdlib, no dependencies."
  stack: ["Python 3.11+", "unittest", "GitHub Actions", "OpenRouter"]
---
