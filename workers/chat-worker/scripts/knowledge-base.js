export const KNOWLEDGE_BASE = `
# Ramiro Cerdá — Knowledge Base

## Overview
- **Nombre**: Ramiro Cerdá
- **Rol / positioning**: Semi Senior Full-Stack Engineer. En LDP (Libro de Pases) trabaja como Tech Lead hands-on (título actual del empleo; el positioning público prioriza Semi Senior Full-Stack).
- **Ubicación**: La Plata, Buenos Aires, Argentina
- **Años de experiencia**: 6+ años (carrera profesional iniciada en 2020)
- **Especialidades**: Node.js, NestJS, Python, FastAPI, React (19), React Native, TypeScript, Arquitectura de software, performance, observabilidad, agentes de IA (Google ADK, LangGraph), inferencia en el edge y automatizaciones.
- **Idiomas**: Español (Nativo), Inglés (Intermedio/Avanzado)
- **Email**: rami992009@gmail.com (canal preferido para charlar de roles Semi Senior Full-Stack / Applied AI)
- **LinkedIn**: https://www.linkedin.com/in/cerdaramiro/
- **GitHub**: https://github.com/ramiro-c
- **Web personal**: https://ramirocerda.com.ar
- **Contacto profesional**: si preguntan cómo contactarlo o por oportunidades, indicá el email. No digas que "está buscando laburo" ni que "manda CVs"; podés decir que está abierto a charlar de roles Semi Senior Full-Stack / Applied AI con ownership real.

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

### Soccer Analytics Agent
Agente de chat de análisis y predicción de fútbol sobre ~49k partidos internacionales (1872–hoy, dataset Kaggle), con un loop de herramientas escrito a mano (sin framework de agentes): Gemini vía Vertex AI razona, decide y llama tools. Expone 9 herramientas, entre ellas SQL de solo lectura, búsqueda vectorial, retrieval híbrido con fusión RRF, Elo por equipo, forma y head-to-head, y un predictor de resultados con XGBoost multiclass (51 features, 336 equipos, fallback Elo). Memoria de 3 niveles (working/episodic/semántica) y Postgres 16 + pgvector como capa única de datos, vectores y memoria. Fases 0–7 completas (predictor incluido); fase 8 de deploy a GCP (Cloud Run + Cloud SQL) en curso.
* **Stack:** Python 3.12, uv, Postgres 16 + pgvector, sentence-transformers (MiniLM all-MiniLM-L6-v2, 384 dims), XGBoost, FastAPI, React, Gemini vía Vertex AI, Ruff, pre-commit.
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

### Botardo — Implementación
Agente conversacional con RAG embebido en mi sitio web personal. Implementé el pipeline completo en Cloudflare Workers: el mensaje del visitante se embeddea con bge-m3 (Workers AI), se recuperan los chunks más similares desde Cloudflare Vectorize (umbral de similitud más tope de 4 chunks) y se genera la respuesta con DeepSeek V4 Flash a través de OpenCode Go. El idioma (es/en) se detecta de forma determinística y, si no hay contexto recuperado, igual se llama al modelo: el prompt marca el contexto como vacío e instruye a DeepSeek a responder solo con lo recuperado y a decir con naturalidad que no tiene esa información, sin inventar. Incluye retry con backoff, CORS acotado a los orígenes del sitio y 32 pruebas con Vitest. La base de conocimiento se alimenta desde mi exportador linkedin-markdownificator.
* **Stack:** Astro, TypeScript, Cloudflare Workers, Cloudflare Vectorize, Workers AI (embeddings bge-m3), OpenCode Go (DeepSeek V4 Flash), Vitest.

### Knowledge Vault
Sistema personal de gestión de conocimiento sobre Obsidian, sincronizado con Git (GitHub + iCloud). Capturo fuentes en crudo (artículos, papers, videos, PDFs) y agentes de IA las procesan automáticamente vía skills propias: categorización, extracción de ideas clave, links semánticos entre notas y resúmenes con puntos de acción. El resultado es una base con la que puedo conversar desde cualquier agente, no solo buscar por keyword.
* **Stack:** Obsidian, Git, agentes de IA (Claude, OpenCode, modelos locales/cloud).

## Workflow de trabajo con agentes (loop de cards)

Ramiro itera con agentes de IA en un loop de 7 etapas sobre cards de Jira, alternando fases autónomas con puntos de decisión humana (human-in-the-loop). Cada card del backlog en To Do con label "agent:loop" pasa por las etapas conectadas. No hay auto-merge: la decisión final siempre es humana.

### Triage
Se toma una card del backlog en To Do con label agent:loop. Todavía lo dispara Ramiro manualmente (no hay cron): cada tick agarra como máximo una card. Clasifica tipo de tarea y asigna prioridad.

### card-start
Crea un worktree aislado con su propia rama a partir de la card de Jira. Resuelve el repo y la rama base desde los labels de la card. Listo para trabajar sin tocar el checkout principal.

### SDD auto
Pipeline completo de 5 fases: Explore (contexto), Propose (intención), Spec (requisitos + escenarios), Design (arquitectura técnica), Tasks (desglose en tareas). Todo generado por agentes antes de tocar código. Punto human-in-the-loop: Ramiro revisa antes de continuar.

### card-review
Revisión pre-PR usando los cuatro lentes 4R (Requirements, Reliability, Readability, Risk). Report-only: encuentra issues antes de abrir el PR. Opcionalmente simplifica código si el usuario lo pide.

### card-pr
Push de la rama y apertura del PR en GitHub. No mergea: deja el diff listo para la revisión adversarial del paso siguiente.

### Judgment Day
Revisión adversarial ciega: dos agentes revisan el diff de forma independiente, comparan hallazgos y emiten un veredicto. Si encuentra issues, vuelve a SDD para fix + re-judgment (máximo 2 rondas). Punto human-in-the-loop.

### Partners / Slack
La card se mueve a Partners/Code Review en Jira y se manda una sola notificación al canal de Slack (backend o frontend). El merge es humano — el loop nunca auto-mergea.

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
