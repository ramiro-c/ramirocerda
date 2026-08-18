---
slug: ai-agents-hub
kind: personal
status: active
featured: true
order: 4
tags: ["ADK", "LangGraph", "FastAPI"]
repo: https://github.com/ramiro-c/ai-agents-hub
es:
  title: "AI Agents Hub — Laboratorio de agentes de IA"
  summary: "Monorepo de aprendizaje y referencia con Google ADK y LangGraph: de agentes chicos (PlanReAct, output_schema, MCP, code executor) a apps full-stack en producción. Incluye Customer Support Chat y Career Coach (Vertex AI Agent Engine + Cloud Run)."
  problem: "Aprender agentes en serio implica mezclar frameworks, tools y deploys. Sin un monorepo ordenado terminás con notebooks sueltos, prompts duplicados y cero camino a prod."
  what: "Armé el hub por capas: laboratorio ADK (tutor YAML/Python, PlanReAct vía LiteLLM/OpenRouter, product extractor con Pydantic, research con Google Search, file reader MCP, math con BuiltInCodeExecutor) + notebook LangGraph (email assistant) + dos productos. Customer Support Chat (React 19 + FastAPI + ADK). Career Coach con BuiltInPlanner, 3 tools deterministas, sesiones y deploy multi-stage a Cloud Run/Vertex AI con ADC. Ruff + pre-commit + docs de arquitectura ADK vs LangGraph."
  highlights:
    - "Laboratorio ADK por capas: PlanReAct, output_schema con Pydantic, file reader MCP y code executor."
    - "Notebook LangGraph para un asistente de email."
    - "Customer Support Chat full-stack (React 19 + FastAPI + ADK)."
    - "Career Coach con BuiltInPlanner y 3 tools deterministas, desplegado a Cloud Run + Vertex AI Agent Engine con ADC (sin API keys en prod)."
    - "Ruff + pre-commit y documentación comparando ADK vs LangGraph."
  stack: ["Python 3.13", "Google ADK", "LangGraph", "FastAPI", "React 19", "Vertex AI", "Cloud Run", "LiteLLM"]
en:
  title: "AI Agents Hub — AI agent lab"
  summary: "Learning and reference monorepo for Google ADK and LangGraph: from small agents (PlanReAct, output_schema, MCP, code executor) to full-stack apps in production. Includes Customer Support Chat and Career Coach (Vertex AI Agent Engine + Cloud Run)."
  problem: "Learning agents for real means juggling frameworks, tools, and deploys. Without a structured monorepo you end up with loose notebooks, duplicated prompts, and no path to prod."
  what: "Built the hub in layers: ADK lab (YAML/Python tutors, PlanReAct via LiteLLM/OpenRouter, Pydantic product extractor, Google Search research agent, MCP file reader, BuiltInCodeExecutor math) + LangGraph notebook (email assistant) + two products. Customer Support Chat (React 19 + FastAPI + ADK). Career Coach with BuiltInPlanner, 3 deterministic tools, sessions, and a multi-stage Cloud Run/Vertex AI deploy with ADC. Ruff + pre-commit + ADK vs LangGraph architecture docs."
  highlights:
    - "Layered ADK lab: PlanReAct, Pydantic output_schema, an MCP file reader, and a code executor."
    - "LangGraph notebook for an email assistant."
    - "Full-stack Customer Support Chat (React 19 + FastAPI + ADK)."
    - "Career Coach with BuiltInPlanner and 3 deterministic tools, deployed to Cloud Run + Vertex AI Agent Engine via ADC (no API keys in prod)."
    - "Ruff + pre-commit and docs comparing ADK vs LangGraph."
  stack: ["Python 3.13", "Google ADK", "LangGraph", "FastAPI", "React 19", "Vertex AI", "Cloud Run", "LiteLLM"]
---
