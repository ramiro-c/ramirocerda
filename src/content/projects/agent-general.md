---
slug: agent-general
year: "2026"
featured: true
track: "ai-systems"
order: 1
tags: ["Python", "Google ADK", "Vertex AI", "LLM Evals"]
es:
  title: "Agent General — Asistente de producto multi-agente"
  summary: "Asistente de producto para una plataforma futbolística: un agente raíz que clasifica cada turno y delega en 14 sub-agentes de dominio (scouting, perfiles, comparaciones, mercado, plantillas, reportes, notificaciones y más), construido con Google ADK y desplegado en Vertex AI Agent Engine."
  problem: "La plataforma tenía datos dispersos en muchas pantallas: para responder algo simple, el usuario cruzaba varias vistas. Un solo agente monolítico no escala: cada dominio tiene sus tools, sus permisos y sus límites de plan. Y en un asistente conectado a datos reales, la confianza lo es todo: una respuesta no puede inventar números ni leer datos que no le corresponden al usuario."
  what: "Diseñé el sistema con Google ADK: un agente raíz sin data tools que clasifica el turno, delega en uno o más sub-agentes de dominio (single-turn, expuestos como tools) y compone una respuesta citando solo lo que devolvieron las herramientas. Cada llamada a la API se hace con el JWT del usuario que está conversando: plan, permisos y datos privados son exactamente lo que ese usuario ve en la app, con verificación de identidad en cada turno y sesiones aisladas por usuario. Responde en el idioma del usuario (es/en/pt first-class). La confianza se evalúa de forma determinística: un harness de evals sin LLM juez que corre casos reales contra el entorno de la plataforma y verifica sub-agentes y tools esperados, grounding numérico (los números de la respuesta salen de las respuestas de las tools) e idioma de la respuesta."
  highlights:
    - "Raíz que clasifica y delega en 14 sub-agentes de dominio (Google ADK, single-turn como tools)."
    - "Identidad por usuario: cada llamada usa el JWT del usuario, con verificación en cada turno y sesiones aisladas."
    - "Desplegado en Vertex AI Agent Engine; smoke tests con usuarios reales y aislamiento de sesiones verificado."
    - "Evals determinísticos sin LLM juez: grounding numérico, tools esperadas e idioma, contra el entorno real."
    - "MCP propio (stdio): expone el agente desplegado como una sola tool ask(message) para agentes de código — password en el Keychain, JWT cacheado."
  stack: ["Python 3.13", "Google ADK", "Vertex AI Agent Engine", "Gemini", "uv", "pytest"]
en:
  title: "Agent General — Multi-agent product assistant"
  summary: "Product assistant for a football platform: a root agent that classifies each turn and delegates to 14 domain sub-agents (scouting, profiles, comparisons, market, rosters, reports, notifications and more), built with Google ADK and deployed to Vertex AI Agent Engine."
  problem: "The platform had data scattered across many screens: to answer something simple, users had to cross-reference several views. A single monolithic agent doesn't scale — each domain has its own tools, permissions, and plan limits. And for an assistant wired to real data, trust is everything: an answer can never invent numbers or read data that doesn't belong to the asking user."
  what: "I designed the system with Google ADK: a root agent holding no data tools, which classifies the turn, delegates to one or more single-turn domain sub-agents (exposed as tools), and composes one answer citing only tool-returned data. Every API call uses the JWT of the user currently chatting: plan, permissions, and private data are exactly what that user sees in the app, with identity verification on every turn and per-user isolated sessions. It replies in the user's language (es/en/pt first-class). Trust is measured deterministically: an eval harness with no LLM judge runs real cases against the platform's environment and checks expected sub-agents and tools, numeric grounding (numbers in the reply must come from tool responses), and reply language."
  highlights:
    - "Root that classifies and delegates to 14 domain sub-agents (Google ADK, single-turn as tools)."
    - "Per-user identity: every call uses the user's JWT, verified on every turn, with isolated sessions."
    - "Deployed to Vertex AI Agent Engine; smoke tests with real users and verified session isolation."
    - "Deterministic evals with no LLM judge: numeric grounding, expected tools, and reply language, against the real environment."
    - "Own MCP server (stdio): exposes the deployed agent as a single ask(message) tool for coding agents — password in the Keychain, JWT cached."
  stack: ["Python 3.13", "Google ADK", "Vertex AI Agent Engine", "Gemini", "uv", "pytest"]
---
