---
slug: ldp-copilot
year: "2026"
featured: true
track: "ai-systems"
order: 1
tags: ["Python", "Google ADK", "Vertex AI", "LLM Evals"]
es:
  title: "LDP Copilot — Asistente de producto multi-agente"
  summary: "Asistente con IA para Libro de Pases, la plataforma de fútbol para clubes, agentes y jugadores: un agente raíz clasifica cada turno y reparte el trabajo entre 5 sub-agentes agrupados por tarea (jugadores y scouting, clubes y agentes, plantilla y mercado, listas y shadow teams, cuenta y ayuda). Construido con Google ADK y Gemini, desplegado en Vertex AI Agent Engine."
  problem: "La plataforma tenía los datos repartidos en muchas pantallas: para responder algo simple, el usuario cruzaba varias vistas. Un solo agente monolítico no escala: cada dominio tiene sus tools, sus permisos y sus límites de plan. Y en un asistente conectado a datos reales, la confianza lo es todo: una respuesta no puede inventar números ni leer datos que no le corresponden al usuario."
  what: "Diseñé el sistema con Google ADK: un agente raíz sin tools de datos clasifica el turno, delega en uno o más sub-agentes (single-turn, expuestos como tools) y compone una respuesta citando solo lo que devolvieron las herramientas. Empezó con 14 sub-agentes de dominio; los agrupé en 5 según la tarea del usuario, y el scouting (búsqueda en lenguaje natural, jugadores similares, filtros por liga y país) quedó dentro del sub-agente de jugadores. Cada llamada a la API usa el JWT del usuario que conversa: plan, permisos y datos privados son exactamente lo que ese usuario ve en la app, con verificación de identidad en cada turno y sesiones aisladas. También escribe, pero solo con confirmación: los sub-agentes proponen y el usuario confirma crear una lista o un shadow team, sumar o quitar jugadores o generar el PDF de un perfil. Responde con tarjetas de UI generativa (comparaciones, sugerencias, opciones para desambiguar) y en el idioma del usuario. La confianza se mide de forma determinística: 49 casos sin LLM juez contra el entorno real de la plataforma, que verifican sub-agentes y tools esperados, idioma y grounding (cada número y nombre de la respuesta tiene que salir de las tools)."
  highlights:
    - "Agente raíz que clasifica y delega en 5 sub-agentes por tarea del usuario (Google ADK, single-turn como tools)."
    - "Identidad por usuario: cada llamada usa el JWT del usuario, verificado en cada turno, con sesiones aisladas."
    - "Escrituras reversibles solo con confirmación: listas, shadow teams y PDF de perfil."
    - "UI generativa: tarjetas de comparación, sugerencias y desambiguación dentro del chat."
    - "Evals determinísticos sin LLM juez: 49 casos con grounding de números y nombres, tools esperadas e idioma, contra el entorno real."
    - "MCP propio (stdio): expone el agente desplegado como una sola tool ask(message) para agentes de código."
  stack: ["Python 3.13", "Google ADK", "Vertex AI Agent Engine", "Gemini", "uv", "pytest"]
en:
  title: "LDP Copilot — Multi-agent product assistant"
  summary: "An AI assistant for Libro de Pases, the football platform for clubs, agents and players: a root agent classifies each turn and splits the work across 5 sub-agents grouped by task (players and scouting, clubs and agents, roster and market, boards and shadow teams, account and help). Built with Google ADK and Gemini, deployed to Vertex AI Agent Engine."
  problem: "The platform had data spread across many screens: to answer something simple, users had to cross-reference several views. A single monolithic agent doesn't scale — each domain has its own tools, permissions, and plan limits. And for an assistant wired to real data, trust is everything: an answer can never invent numbers or read data that doesn't belong to the asking user."
  what: "I designed the system with Google ADK: a root agent holding no data tools classifies the turn, delegates to one or more single-turn sub-agents (exposed as tools), and composes one answer citing only tool-returned data. It started with 14 domain sub-agents; I grouped them into 5 by user task, and scouting (natural-language search, similar players, league and country filters) now lives inside the players sub-agent. Every API call uses the JWT of the user currently chatting: plan, permissions, and private data are exactly what that user sees in the app, with identity verification on every turn and isolated sessions. It also writes, but only with confirmation: sub-agents propose and the user confirms creating a board or shadow team, adding or removing players, or generating a profile PDF. It answers with generative UI cards (comparisons, suggestions, disambiguation options) and in the user's language. Trust is measured deterministically: 49 cases with no LLM judge against the platform's real environment, checking expected sub-agents and tools, reply language, and grounding (every number and name in the reply must come from the tools)."
  highlights:
    - "Root agent that classifies and delegates to 5 task-grouped sub-agents (Google ADK, single-turn as tools)."
    - "Per-user identity: every call uses the user's JWT, verified on every turn, with isolated sessions."
    - "Reversible writes only with confirmation: boards, shadow teams, and profile PDFs."
    - "Generative UI: comparison, suggestion, and disambiguation cards inside the chat."
    - "Deterministic evals with no LLM judge: 49 cases grounding numbers and names, expected tools, and reply language, against the real environment."
    - "Own MCP server (stdio): exposes the deployed agent as a single ask(message) tool for coding agents."
  stack: ["Python 3.13", "Google ADK", "Vertex AI Agent Engine", "Gemini", "uv", "pytest"]
---
