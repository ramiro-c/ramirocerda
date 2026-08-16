export const KNOWLEDGE_BASE = `
# Ramiro Cerdá — Knowledge Base

## Overview
- **Nombre**: Ramiro Cerdá
- **Rol / positioning**: Senior Full-Stack Engineer. En LDP (Libro de Pases) trabaja como Tech Lead hands-on (título actual del empleo; el positioning público prioriza Senior Full-Stack).
- **Ubicación**: La Plata, Buenos Aires, Argentina
- **Años de experiencia**: 6+ años (carrera profesional iniciada en 2020)
- **Especialidades**: Node.js, NestJS, Python, FastAPI, React (19), React Native, TypeScript, Arquitectura de software, performance, observabilidad, agentes de IA (Google ADK, LangGraph), inferencia en el edge y automatizaciones.
- **Idiomas**: Español (Nativo), Inglés (Intermedio/Avanzado)
- **Email**: rami992009@gmail.com (canal preferido para charlar de roles Senior Full-Stack / Applied AI)
- **LinkedIn**: https://www.linkedin.com/in/cerdaramiro/
- **GitHub**: https://github.com/ramiro-c
- **Web personal**: https://ramirocerda.com.ar
- **Contacto profesional**: si preguntan cómo contactarlo o por oportunidades, indicá el email. No digas que "está buscando laburo" ni que "manda CVs"; podés decir que está abierto a charlar de roles Senior Full-Stack / Applied AI con ownership real.

## Experiencia Profesional

### LIBRODEPASES | Full-time | Jun 2022 - Actualidad

#### Full Stack Tech Lead (Hands-on) | Abr 2025 - Actualidad
Desarrollo end-to-end de funcionalidades core de la plataforma SaaS de scouting y mercado de jugadores profesionales de fútbol.
* **Día a día (tareas concretas):** desarrollo de features completas end-to-end, tocando frontend y backend por igual; integraciones con n8n para automatizar flujos de negocio; y trabajo transversal sobre la plataforma SaaS.
* **Refactor de arquitectura backend:** lideré la migración de ~400 endpoints en clases monolíticas (hasta 15k líneas) hacia una arquitectura desacoplada con Patrón Repositorio e inyección de dependencias, reduciendo drásticamente la deuda técnica.
* **Performance a escala:** eliminé cuellos de botella críticos (N+1, operaciones síncronas bloqueantes) con vistas materializadas, paralelización y singletons, logrando 75–90% de mejora en tiempos de respuesta en múltiples endpoints.
* **Perf quick wins (jul-2026):** a partir de New Relic (prod), 6 familias de endpoints concentraban el 92,5% del tiempo total de la API; el costo dominante era BigQuery sin caché. Implementé caché en 3 capas (Cloudflare edge + in-process TTL/singleflight + pool DB), paralelisé llamadas BQ, eliminé N+1 y corregí un desajuste FE/BE que generaba ~9,25% de error rate en guests/users.
* **Observabilidad y seguridad:** centralicé el monitoreo con Sentry, New Relic y logs estructurados (Pino); implementé sanitización de datos en middlewares y validación automatizada de identidad de usuarios.
* **QA Automation y CI/CD:** definí la estrategia global de testing (unit + API + smoke + E2E) en pipelines con reportes a Slack, liderando la adopción de QA Automation en el equipo.
* **IA y desarrollo core:** desarrollo end-to-end de flujos críticos; diseñé e implementé el front-end completo de un asistente conversacional con IA.
* **Liderazgo técnico:** diseñé el challenge técnico de contratación full-stack (code review + entrevistas) y capacité al equipo en herramientas de IA (Cursor, Claude Code, sub-agentes, context management).

#### Desarrollador Mobile / Front-end SSR (React Native y React) | Jun 2022 - Abr 2025
* **Frontend a escala con mentalidad de producto/MVP:** entregué features transversales en web y mobile con foco en lanzamientos rápidos y adaptabilidad al negocio.
* **Modularización del ecosistema:** lideré propuestas técnicas aprobadas para estandarizar el frontend (Zustand, React Query, ESLint, Prettier) y armé pipelines en Bitbucket (Vitest, SonarQube, Husky).
* **Mobile engineering:** reestructuré el state management global con Zustand (corrigiendo fugas de rendimiento), migré componentes clave a TypeScript y coordiné el refactor del Design System mobile.
* **Mentoría:** onboarding y formación de devs junior (incluidas demos técnicas de React Query); acompañamiento hasta completar su período de prueba.

### EXPERIENCIA PREVIA | Desarrollador Full-stack Jr. | 2020 - 2021
#### DevGAM, Secretaría de TIC (UTN FRLP) y New Logic
Desarrollo full-stack para sistemas de administración comercial, gestión de stock, administración contable, gestión de turnos/clientes, trámites universitarios y plataformas web (marketplace y portal de noticias). Motor CMS propietario en PHP, optimización de bases de datos MySQL e implementación de frontends en React y Vue sobre Google Cloud Platform.

## Proyectos Destacados

### AI Agents Hub
Monorepo de experimentación con arquitecturas avanzadas de agentes de IA (Google ADK + LangGraph, jun 2026 – actualidad). Exploré asistentes con planificación multi-paso, extracción estructurada y ejecución nativa de código, y desplegué aplicaciones full-stack en producción.
* **Agentes con Google ADK:** tutor de álgebra (LlmAgent básico + versión YAML-only); solucionador de problemas complejos con PlanReActPlanner (planificación multi-paso); extractor de información de productos con output_schema + Pydantic (JSON estructurado); asistente de investigación con Google Search; asistente de lectura de archivos vía MCP filesystem; asistente matemático con BuiltInCodeExecutor; Travel Agent con MCP PostgreSQL + SQL + function tools.
* **Flujos con LangGraph:** Email Assistant (clasifica mensajes para responder, ignorar o notificar usando StateGraph, Command routing y herramientas @tool).
* **Customer Support Chat:** app full-stack con agente ADK en español (frontend React 19 + TypeScript, backend proxy FastAPI, flujo Browser → Vite → FastAPI → ADK api_server → OpenRouter).
* **Career Coach:** app full-stack de planes de carrera a N meses con BuiltInPlanner y 3 tools (skill gap, estimación de esfuerzo, timeline); desplegado en Vertex AI Agent Engine con frontend React 19 + Markdown y backend FastAPI con sesiones por email (Cloud Run, auth ADC).
* **Stack:** Python 3.13, Google ADK 2.2.0, LangGraph, FastAPI, React 19, TypeScript, LiteLLM, OpenRouter, Vertex AI, Cloud Run, Ruff, pre-commit.
* **Link:** https://github.com/ramiro-c/ai-agents-hub

### Mundial 2026 — Soccer Analytics / World Cup Companion
Aplicación full-stack de análisis de fútbol para el Mundial 2026 (México, USA, Canadá). Incluye tabla de grupos con lógica de mejores terceros, fixture completo con hora local, cuadro eliminatorio de 16avos hasta la Final, mapa interactivo de las 16 sedes, histórico de enfrentamientos en Mundiales desde 1930 con estadísticas por selección y guía de TV por país.
* **Fuentes de datos:** wheniskickoff API (fixture, grupos, sedes, TV), OpenFootball (histórico CC0), StatsBomb (eventos históricos).
* **Stack:** FastAPI, React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet, Cloudflare Workers.
* **Links:** Demo: https://worldcup-2026.rami992009.workers.dev | GitHub: https://github.com/rami992009/mundial-2026

### linkedin-markdownificator
Herramienta para exportar perfiles de LinkedIn a Markdown, facilitando la sincronización con sitios web personales e interacción con agentes de IA. Para lograrlo, diseñé un extractor tolerante a cambios en el DOM adaptado al layout React post-2025, externalicé los selectores en JSON para evitar rupturas de scraping y aseguré la estabilidad con 26 pruebas de integración.
* **Stack:** Python, Selenium, BeautifulSoup, Pytest, Ruff.
* **Link:** https://github.com/ramiro-c/linkedin-markdownificator

### Portafolio Personal y Asistente IA
Diseñé y desarrollé mi sitio web personal integrando a Botardo, un agente conversacional con RAG (retrieval-augmented generation) que responde consultas interactivas sobre mi experiencia y stack. El bot corre en Cloudflare Workers con recuperación vectorial sobre Cloudflare Vectorize y generación con DeepSeek V4 Flash a través de OpenCode Go. La base de conocimiento la armé gracias al scraper linkedin-markdownificator.
* **Stack:** Astro, TypeScript, Cloudflare Workers, Cloudflare Vectorize, Workers AI (embeddings bge-m3), OpenCode Go (DeepSeek V4 Flash), Vercel.
* **Link:** https://ramirocerda.com.ar

## Sitio Web y Arquitectura del Bot

* **Sitio:** https://ramirocerda.com.ar, desarrollado con Astro y TypeScript, desplegado en Vercel.
* **Botardo:** agente conversacional serverless que vive en un Cloudflare Worker junto a la web personal.
* **Pipeline RAG por pregunta:**
  1. Se detecta el idioma del último mensaje del visitante (español o inglés) de forma determinística.
  2. El mensaje se convierte en embedding con el modelo bge-m3 de Workers AI.
  3. Se recuperan los chunks más relevantes de la base de conocimiento desde Cloudflare Vectorize (top-k con umbral de similitud).
  4. Se genera la respuesta con DeepSeek V4 Flash vía la API de OpenCode Go, usando solo el contexto recuperado y el historial de los últimos 10 turnos.
* **Idioma:** responde en el mismo idioma del visitante: español rioplatense (voseo) o inglés.
* **Sin información:** si la pregunta no tiene contexto en la base, Botardo lo aclara con elegancia en el idioma del visitante, sin inventar contenido.
* **Seguridad:** la API key de OpenCode Go vive como secret del Worker, nunca en el repositorio.

### LactarIA
Desarrollé una app móvil en React Native + Expo para la tesis de dos puericultoras, usada por 50 madres como herramienta de apoyo en lactancia y crianza. Implementé un backend serverless integrado con la API de Gemini. Publicada como prueba cerrada en Play Store con 100% de satisfacción de usuarias, 77.3% reportó menor ansiedad gracias al chatbot en tiempo real y 95.5% destacó la facilidad de uso.
* **Stack:** React Native, Expo, Serverless, Gemini.

### Knowledge Vault
Sistema personal de gestión de conocimiento sobre Obsidian, sincronizado con Git (GitHub + iCloud). Capturo fuentes en crudo (artículos, papers, videos, PDFs) y agentes de IA las procesan automáticamente vía skills propias: categorización, extracción de ideas clave, links semánticos entre notas y resúmenes con puntos de acción. El resultado es una base con la que puedo conversar desde cualquier agente, no solo buscar por keyword.
* **Stack:** Obsidian, Git, agentes de IA (Claude, OpenCode, modelos locales/cloud).

## Certificaciones

### Google Cloud — AI Agents Path (completo, jun–jul 2026)
Completé el recorrido completo de Google Cloud en AI Agents: 10 certificaciones oficiales en dos tandas (jun y jul 2026), desde los fundamentos del Agent Development Kit hasta la orquestación multi-agente en Gemini Enterprise y el despliegue de arquitecturas en producción.
* **Junio 2026:** Engineer AI Agents with Agent Development Kit (ADK) · Optimize Agent Behavior · Add Agent Capabilities With Tools · Manage Agent Memory and State.
* **Julio 2026:** Build and Deploy Agents in Production · Deploy Your First Agent · Gen AI Agents: Transform Your Organization · Human-Centered AI · Orchestrate Multi-agent Workflows with Gemini Enterprise · Deploy Multi-Agent Architectures.

## Stack Técnico

* **Frontend & Mobile:** React (19), React Native, TypeScript, JavaScript, Expo, Zustand, React Query, Vue.js, Tailwind CSS (v4), Shadcn/ui, Leaflet, amCharts.
* **Backend, Cloud & Data:** Node.js, NestJS, Python, FastAPI, MySQL, PostgreSQL, Google Cloud Platform (Vertex AI, Cloud Run), Cloudflare Workers (Edge Computing), Serverless, APIs REST, Pino Logger.
* **IA & Automatización:** Google ADK, LangGraph, Cloudflare Workers AI (embeddings bge-m3), Cloudflare Vectorize (RAG), OpenCode Go (DeepSeek V4 Flash), n8n, APIs de LLMs (Gemini, Anthropic), OpenRouter, Claude Code, Cursor (context management).
* **DevOps, Calidad & Testing:** CI/CD (GitHub Actions, Bitbucket Pipelines), Docker, Git (worktrees), Bash, Sentry, New Relic, Pytest, Jest, Vitest, Playwright, SonarQube.
* **Metodologías & Procesos:** SCRUM, GitFlow, Code Reviews, Jira, Confluence.
* **Certificaciones:** Path completo de Google Cloud en AI Agents (10 certificaciones, jun–jul 2026) — ver sección Certificaciones.
* **Idiomas:** Español (Nativo) | Inglés (Intermedio/Avanzado).

## Educación

* **Universidad Tecnológica Nacional - FRLP | Feb 2018 - May 2023**
  * **Ingeniería en Sistemas de Información** — Promedio: 8.04
  * **Ayudante de Cátedra** — Sistemas Operativos (2021): soporte práctico a dos comisiones de 30 estudiantes.
  * **Becario de investigación** — LINSI (1 año): arquitecturas con Docker, Linux, redes de servidores y Blockchain.

* **Coderhouse | Jul 2026 - Ago 2026**
  * **AI Engineering** — Curso de ingeniería en IA (6 clases + trabajo final). Entregables del curso: cliente unificado async de LLMs, pipeline de procesamiento validado (LangChain + Pydantic), RAG semántico local sobre apuntes (LangChain 1.x + Chroma) y RAG híbrido escalable con Pinecone (BM25 + embeddings locales + fusión RRF). Ver: https://www.coderhouse.com/ar/cursos/ai-engineering
`;
