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
- **Web personal**: https://ramirocerda.vercel.app
- **Contacto profesional**: si preguntan cómo contactarlo o por oportunidades, indicá el email. No digas que "está buscando laburo" ni que "manda CVs"; podés decir que está abierto a charlar de roles Senior Full-Stack / Applied AI con ownership real.

## Experiencia Profesional

### LIBRODEPASES | Full-time | Jun 2022 - Actualidad

#### Full Stack Tech Lead (Hands-on) | Abr 2025 - Actualidad
Desarrollo end-to-end de funcionalidades core de la plataforma SaaS de scouting y mercado de jugadores profesionales de fútbol.
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
Monorepo de experimentación con arquitecturas avanzadas de agentes de IA. Implementé asistentes con capacidades de planificación multi-paso (PlanReAct), extracción de datos estructurados con Pydantic y ejecución nativa de código. Desarrollé y desplegué aplicaciones full-stack (Career Coach y Customer Support) en Cloud Run utilizando autenticación ADC y Vertex AI Agent Engine.
* **Stack:** Python 3.13, Google ADK, LangGraph, FastAPI, React 19, Vertex AI, Cloud Run.
* **Link:** https://github.com/ramiro-c/ai-agents-hub

### Mundial 2026
Aplicación full-stack de alto rendimiento para el seguimiento del torneo. Diseñé el pipeline de cruce de datos en tiempo real desde múltiples APIs y fuentes históricas abiertas, implementando mapas interactivos y una UI responsive optimizada para mobile con carga inmediata.
* **Stack:** FastAPI, React 19, TypeScript, Tailwind CSS v4, Cloudflare Workers.
* **Links:** Demo: https://worldcup-2026.rami992009.workers.dev | GitHub: https://github.com/rami992009/mundial-2026

### linkedin-markdownificator
Herramienta para exportar perfiles de LinkedIn a Markdown, facilitando la sincronización con sitios web personales e interacción con agentes de IA. Para lograrlo, diseñé un extractor tolerante a cambios en el DOM adaptado al layout React post-2025, externalicé los selectores en JSON para evitar rupturas de scraping y aseguré la estabilidad con 26 pruebas de integración.
* **Stack:** Python, Selenium, BeautifulSoup, Pytest, Ruff.
* **Link:** https://github.com/ramiro-c/linkedin-markdownificator

### Portafolio Personal y Asistente IA
Diseñé y desarrollé mi sitio web personal integrando a Botardo, un agente conversacional configurado para responder consultas interactivas sobre mi experiencia y stack. Implementé el bot con Llama 3.2 utilizando Cloudflare Workers AI, logrando respuestas rápidas con latencia mínima y sin costos de infraestructura tradicional. La base de conocimiento la armé gracias al scraper linkedin-markdownificator.
* **Stack:** HTML/CSS, JavaScript, Cloudflare Workers AI, Llama 3.2, Vercel.
* **Link:** https://ramirocerda.vercel.app

### LactarIA
Desarrollé una app móvil en React Native + Expo para la tesis de dos puericultoras, usada por 50 madres como herramienta de apoyo en lactancia y crianza. Implementé un backend serverless integrado con la API de Gemini. Publicada como prueba cerrada en Play Store con 100% de satisfacción de usuarias, 77.3% reportó menor ansiedad gracias al chatbot en tiempo real y 95.5% destacó la facilidad de uso.
* **Stack:** React Native, Expo, Serverless, Gemini.

### Knowledge Vault
Sistema personal de gestión de conocimiento sobre Obsidian, sincronizado con Git (GitHub + iCloud). Capturo fuentes en crudo (artículos, papers, videos, PDFs) y agentes de IA las procesan automáticamente vía skills propias: categorización, extracción de ideas clave, links semánticos entre notas y resúmenes con puntos de acción. El resultado es una base con la que puedo conversar desde cualquier agente, no solo buscar por keyword.
* **Stack:** Obsidian, Git, agentes de IA (Claude, OpenCode, modelos locales/cloud).

## Stack Técnico

* **Frontend & Mobile:** React (19), React Native, TypeScript, JavaScript, Expo, Zustand, React Query, Vue.js, Tailwind CSS (v4), Shadcn/ui, Leaflet, amCharts.
* **Backend, Cloud & Data:** Node.js, NestJS, Python, FastAPI, MySQL, PostgreSQL, Google Cloud Platform (Vertex AI, Cloud Run), Cloudflare Workers (Edge Computing), Serverless, APIs REST, Pino Logger.
* **IA & Automatización:** Google ADK, LangGraph, Cloudflare Workers AI (Llama 3.2), n8n, APIs de LLMs (Gemini, Anthropic), OpenRouter, Claude Code, Cursor (context management).
* **DevOps, Calidad & Testing:** CI/CD (GitHub Actions, Bitbucket Pipelines), Docker, Git (worktrees), Bash, Sentry, New Relic, Pytest, Jest, Vitest, Playwright, SonarQube.
* **Metodologías & Procesos:** SCRUM, GitFlow, Code Reviews, Jira, Confluence.
* **Certificaciones:** 10 certificaciones de Google en AI Agents (ADK, Gemini Enterprise, Responsible AI), 2026.
* **Idiomas:** Español (Nativo) | Inglés (Intermedio/Avanzado).

## Educación

* **Universidad Tecnológica Nacional - FRLP | Feb 2018 - May 2023**
  * **Ingeniería en Sistemas de Información** — Promedio: 8.04
  * **Ayudante de Cátedra** — Sistemas Operativos (2021): soporte práctico a dos comisiones de 30 estudiantes.
  * **Becario de investigación** — LINSI (1 año): arquitecturas con Docker, Linux, redes de servidores y Blockchain.
`;
