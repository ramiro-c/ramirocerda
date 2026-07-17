---
slug: soccer-analytics-agent
kind: personal
featured: true
order: 3
tags: ["Gemini", "pgvector", "XGBoost"]
repo: https://github.com/ramiro-c/ai-agents-hub
es:
  title: "Soccer Analytics Agent — Agente de análisis futbolístico"
  summary: "Agente de chat sobre ~49k partidos internacionales (1872–hoy) construido con un tool-loop LLM escrito a mano, sin framework de agentes. Gemini razona y llama tools; Postgres + pgvector es la única capa para datos, memoria y observabilidad. Réplica learning-first del workshop de Oracle sobre stack abierto y deployable en GCP."
  problem: "Los frameworks de agentes esconden cómo funciona un agente de verdad. Para entender el mecanismo hay que escribir el loop a mano: cuándo el modelo responde, cuándo delega en una tool, cómo se arma la memoria."
  what: "Escribí el agente como un while loop puro sobre el SDK de google-genai: el modelo emite texto o pide ejecutar tools, y mi runtime las ejecuta y le devuelve el resultado. Un generalista (Gemini) que delega en especialistas chicos y locales: MiniLM para embeddings (384 dims) y XGBoost multiclase para predecir resultados (51 features, con fallback a Elo). Retrieval híbrido sobre 49k documentos (pgvector + full-text de Postgres, fusionado con RRF), memoria de tres capas (working, episódica, semántica), tracker de Elo de 336 selecciones y observabilidad que persiste cada paso de cada turno. 9 tools, frontend FastAPI + React, camino a Cloud Run."
  stack: ["Python 3.12", "Gemini", "Vertex AI", "Postgres 16", "pgvector", "MiniLM", "XGBoost", "FastAPI", "React"]
en:
  title: "Soccer Analytics Agent — Football analytics agent"
  summary: "Chat agent over ~49k international matches (1872–today) built with a hand-written LLM tool loop, no agent framework. Gemini reasons and calls tools; Postgres + pgvector is the single layer for data, memory, and observability. A learning-first replication of Oracle's workshop on an open, GCP-deployable stack."
  problem: "Agent frameworks hide how an agent actually works. To understand the mechanism you have to write the loop by hand: when the model answers, when it delegates to a tool, how memory is wired."
  what: "Wrote the agent as a pure while loop over the google-genai SDK: the model emits text or asks to run tools, and my runtime executes them and feeds results back. A generalist (Gemini) that delegates to small local specialists: MiniLM for embeddings (384 dims) and a multiclass XGBoost outcome predictor (51 features, with an Elo fallback). Hybrid retrieval over 49k documents (pgvector + Postgres full-text, fused with RRF), three-tier memory (working, episodic, semantic), an Elo tracker for 336 national teams, and observability that persists every step of every turn. 9 tools, FastAPI + React frontend, on the way to Cloud Run."
  stack: ["Python 3.12", "Gemini", "Vertex AI", "Postgres 16", "pgvector", "MiniLM", "XGBoost", "FastAPI", "React"]
---
