export const KNOWLEDGE_BASE = `
# Ramiro Cerdá — Knowledge Base

## Overview
- **Nombre**: Ramiro Cerdá
- **Rol**: Tech lead y desarrollador full stack (Full-Stack Engineer). En LDP (Libro de Pases) trabaja como Tech Lead hands-on.
- **Ubicación**: La Plata, Buenos Aires, Argentina
- **Años de experiencia**: 6+ años (carrera profesional iniciada en 2020)
- **Especialidades**: Node.js, NestJS, Python, FastAPI, React (19), React Native, TypeScript, Arquitectura de software, performance, observabilidad, agentes de IA (Google ADK, LangGraph), inferencia en el edge y automatizaciones.
- **Idiomas**: Español (Nativo), Inglés (B2: lectura y escritura técnica fluida, conversación profesional)
- **Modalidad**: 100% remoto, huso horario de Argentina (GMT-3)
- **Email**: rami992009@gmail.com (canal preferido para charlar de roles Full-Stack Engineer / Applied AI)
- **LinkedIn**: https://www.linkedin.com/in/cerdaramiro/
- **GitHub**: https://github.com/ramiro-c
- **Web personal**: https://ramirocerda.com.ar
- **Disponibilidad**: Ramiro está abierto a nuevas oportunidades: proyectos freelance y roles Full-Stack Engineer / Applied AI donde pueda hacerse cargo del producto de punta a punta.
- **Contacto profesional**: para oportunidades o proyectos, el canal es el email o el formulario de la web, que agenda una charla de 20 minutos sin costo ni compromiso.

## Productos y clientes

(In English: Products, projects and clients — who Ramiro has worked with and what products and projects he has built and shipped: Libro de Pases (LDP), Kano Studio, Avellana, LactarIA, Mundial 2026, LDP Copilot (AI product assistant), management software for businesses. Keywords: clients, customers, companies, products, apps, shipped, worked with, portfolio, case studies.)

Ramiro trabajó con **LDP (Libro de Pases)**, **Kano Studio** y **Avellana** (un producto de Kano Studio). Productos que construyó o en los que trabajó, todos en producción o con usuarios reales:
* **Libro de Pases (LDP)** — plataforma SaaS de fútbol para el mercado de pases. Es su trabajo full-time: entró por la app móvil y hoy lidera el desarrollo full stack. Ver: /work/ldp
* **Kano Studio** — colaboración: landing y diagnóstico interactivo del estudio (sistema de diseño, versión en dos idiomas, SEO y accesibilidad). Sitio: https://kano.studio/
* **Avellana** — colaboración con Kano Studio: app gratuita para Android e iOS para comprar ropa en Av. Avellaneda. Sitio: https://avellana.store/
* **LactarIA** — freelance: app de apoyo en lactancia materna con un chatbot de IA sobre un banco de preguntas curado; piloto cerrado con 50 madres. Ver: /work/lactaria
* **Mundial 2026** — producto propio: app para seguir el Mundial (grupos, fixture en tu huso horario, cuadro, sedes y guía de TV). Está online.
* **LDP Copilot** — asistente de producto con IA para LDP: agente multi-agente con Google ADK que responde con los permisos de cada usuario (ver la sección del proyecto).
* **Software de gestión para negocios** — freelance: sistemas de gestión multi rubro en DevGAM (PHP, JS, MySQL) y un sistema de trámites administrativos para la UTN FRLP (Laravel, Vue).

### Kano Studio — landing y diagnóstico interactivo (colaboración)
(In English: Kano Studio — collaboration on the studio's landing page and interactive diagnostic.)
Con el equipo de Kano Studio, Ramiro hizo el sistema de diseño de la landing, la versión en dos idiomas (español e inglés) y el SEO. También corrigió los problemas de accesibilidad que marcó una auditoría. La landing incluye un diagnóstico interactivo. Detalle técnico: design system con paleta de cuatro colores y tokens CSS, i18n con swap estático, pipeline propio de imágenes OG con sharp, fuentes self-hosted y remediación de accesibilidad a WCAG 2.2 AA a partir de una auditoría con bloqueantes de contraste. Stack: Astro, TypeScript, sharp.
* **Rol:** colaboración con el equipo de Kano Studio.
* **Sitio:** https://kano.studio/

### Avellana — app para comprar ropa en Av. Avellaneda (colaboración)
(In English: Avellana — a Kano Studio product, a free Android and iOS app to shop for clothes on Av. Avellaneda in Buenos Aires.)
Avellana es un producto de Kano Studio en el que Ramiro colaboró. Es una app gratuita para Android e iOS que compara precios de ropa de mujer entre los locales de Av. Avellaneda en Buenos Aires, guarda favoritos y arma el recorrido más corto entre los locales.
* **Rol:** colaboración con el equipo de Kano Studio en un producto del estudio.
* **Sitio:** https://avellana.store/

## Servicios: qué tipo de proyectos hace

(In English: Services — what kind of projects Ramiro takes on: web and mobile apps, platforms with their own backend, sites and landing pages, and AI agents. Pricing depends on scope: a free 20-minute call first, then a concrete proposal by email.)

* **Qué hace:** apps web y móviles, plataformas con backend propio, sitios y landings, y agentes de IA. Diseña, desarrolla y mantiene el producto entero, de la primera pantalla al deploy, y se queda hasta que funciona con usuarios reales.
* **Mejorar algo que ya existe:** sí. En Libro de Pases buena parte del trabajo fue mejorar lo que ya estaba: la búsqueda, el monitoreo de errores y performance, los tests y el CI.
* **¿Hace falta IA?:** no siempre. Si una regla, un formulario o una buena búsqueda resuelven el problema, conviene eso. Cuando la IA sirve, la diseña para que cite la fuente y diga cuando no sabe.
* **Después del lanzamiento:** el producto sale con monitoreo de errores y de performance, y con tests que corren en cada cambio.
* **Precio:** depende del alcance. Primero una charla de 20 minutos sin costo para ver qué se necesita y después una propuesta concreta por mail. No hay una tarifa por hora publicada.

## Experiencia Profesional

### LIBRODEPASES | Full-time | Jun 2022 - Actualidad

#### Full Stack Tech Lead (Hands-on) | Abr 2025 - Actualidad
Desarrollo end-to-end de funcionalidades core de la plataforma SaaS de scouting y mercado de jugadores profesionales de fútbol.
* **Día a día (tareas concretas):** desarrollo de features completas end-to-end, tocando frontend, backend y app móvil por igual; ownership de los pipelines de CI/CD; integraciones con n8n para automatizar flujos de negocio; y trabajo transversal sobre la plataforma SaaS.
* **Refactor de arquitectura backend:** lideré la migración de ~400 endpoints en clases monolíticas (hasta 15k líneas) hacia una arquitectura desacoplada con Patrón Repositorio e inyección de dependencias, reduciendo drásticamente la deuda técnica.
* **Performance a escala:** eliminé cuellos de botella críticos (N+1, operaciones síncronas bloqueantes) con vistas materializadas, paralelización y singletons, logrando 75–90% de mejora en tiempos de respuesta en múltiples endpoints.
* **Perf quick wins (jul-2026):** a partir de New Relic (prod), 6 familias de endpoints concentraban el 92,5% del tiempo total de la API; el costo dominante era BigQuery sin caché. Implementé caché en 3 capas (Cloudflare edge + in-process TTL/singleflight + pool DB), paralelisé llamadas BQ, eliminé N+1 y corregí un desajuste FE/BE que generaba ~9,25% de error rate en guests/users.
* **Observabilidad y seguridad:** centralicé el monitoreo con Sentry, New Relic y logs estructurados (Pino); implementé sanitización de datos en middlewares y validación automatizada de identidad de usuarios.
* **QA Automation y CI/CD:** definí la estrategia global de testing (unit + API + smoke + E2E) en pipelines con reportes a Slack, liderando la transición del equipo de QA 100% manual a QA Automation; tras la salida de la analista QA sostengo la suite de forma hands-on.
* **IA y desarrollo core:** desarrollo end-to-end de flujos críticos; diseñé e implementé el front-end completo de un asistente conversacional con IA y construí el LDP Copilot, el asistente de producto multi-agente de LDP (Google ADK + Gemini desplegado en Vertex AI Agent Engine), detallado en la sección Proyectos Destacados.
* **Liderazgo técnico:** diseñé el challenge técnico de contratación full-stack (code review + entrevistas) y capacité al equipo en herramientas de IA (Cursor, Claude Code, sub-agentes, context management), con un formato semanal de demostraciones hands-on (Speed Demos).

#### Caso insignia en LDP: motor de búsqueda de jugadores (ago–sep 2026)
(In English: flagship case — Ramiro rewrote the player search engine at LDP: p95 from 61 s to 1.3 s, p50 from 2.69 s to 387 ms, 30 ms / 247 ms on the cached path, over 1.9M records on PostgreSQL. Keywords: performance, latency, search, optimization, biggest achievement.)
La búsqueda de jugadores es la funcionalidad más usada del producto: filtra 1,9 millones de registros estadísticos por posición, rol, temporada, métricas de rendimiento, ligas y nombre, sobre PostgreSQL en Cloud SQL. Ramiro la reescribió y la llevó de decenas de segundos a milisegundos, medido en New Relic:
* **p95:** de 61 s a 1,3 s. **p50:** de 2,69 s a 387 ms. **Camino cacheado:** p50 de 30 ms y p95 de 247 ms. **Búsqueda por texto:** de 4,5 s a 0,8 s.
* **Late materialization:** los candidatos se ordenan cargando solo ids y claves de orden; la hidratación de perfiles y estadísticas ocurre después del LIMIT, con resultados idénticos byte a byte en 16 escenarios.
* **Hallazgo no obvio:** un gap de 700 ms que el EXPLAIN ANALYZE no explicaba era el JIT de Postgres; desactivarlo solo en la transacción de búsqueda bajó un orden de 943 ms a 246 ms.
* **Texto con trigramas:** la búsqueda por nombre pasó a trigram LIKE sobre los índices GIN existentes, sin crear índices nuevos.
* **Caché medida, no intuida:** midió que cachear la lista completa de candidatos duplicaba el costo del miss y adoptó un prefijo ordenado de 5.000 ids con singleflight.
* **Base de datos:** CLUSTER por período, pg_prewarm y work_mem por transacción; la query de candidatos bajó de 1.020 ms a 105 ms.
* **Stress test:** de 8 a 128 conexiones concurrentes con 0 errores; demostró que el techo era el pool de la app y que agrandarlo empeoraba todo por contención.
* **Red de seguridad:** golden master de hasta 120 escenarios y unos 2.500 tests de Jest para refactorizar sin cambiar resultados.

#### Performance backend en LDP: antes y después
(In English: backend performance at LDP, measured in New Relic — player stats radar −83%, player performance panel −89%, performance comparison −90%, injury history −75%.)
Auditoría de performance con New Relic sobre 389 endpoints y unos 1,5 millones de requests en 3 meses, en coordinación con el equipo de Data. Resultados por funcionalidad:
* **Radar estadístico de jugador:** de 18,6 s a 3,1 s (−83%).
* **Panel de rendimiento de jugador:** de 6,8 s a 0,7 s (−89%).
* **Comparativa de rendimiento:** de 14,8 s a 1,4 s (−90%).
* **Historial de lesiones:** de 3,2 s a 0,8 s (−75%).

#### Otras funcionalidades y logros en LDP
(In English: other LDP work — squad planner module, transfer marketplace, technical debt audit, frontend security audit, QA automation, Spec Driven Development, AI chat frontend, admin panel migration to Vite.)
* **Planificador de plantillas (módulo nuevo end-to-end):** clubes y agentes arman alineaciones hipotéticas con jugadores del mercado. Diseñó el modelo de datos, la API (equipos, etiquetas, membresías, límites por plan) y la interfaz: cancha con formaciones, drag & drop, filtros y borradores, con tests E2E propios.
* **Marketplace de transferencias:** ownership end-to-end del módulo donde clubes y agentes publican, ofertan y cierran operaciones por jugadores: compatibilidad por rol, flujo de ofertas, firma de contrato, notificaciones por email y seguimiento de la transferencia.
* **Features core adicionales:** desarrollé junto al equipo otros módulos centrales de la plataforma: la Comparativa (panel multi-entidad para comparar jugadores, clubes y ligas) y el scouting propio (listas, shadow teams y dashboards).
* **Auditoría de deuda técnica del backend (iniciativa propia):** análisis de ~400 endpoints con 14 hallazgos priorizados por impacto y esfuerzo y un roadmap por sprints. La arquitectura objetivo (Repository Pattern, inyección de dependencias y Zod) se validó con una prueba de concepto de 17 tests en 3 capas.
* **Auditoría de seguridad del frontend:** 10 hallazgos verificados y corregidos en 4 módulos.
* **QA Automation:** más de 60 casos de API en Bruno, E2E con Playwright sobre varios entornos y 3 roles de usuario, y pipelines con reporte a Slack.
* **Spec Driven Development como proceso del equipo:** explorar, proponer, especificar, diseñar, dividir en tareas, implementar y verificar, con review adversarial antes del PR.
* **Bots propios de monitoreo y seguimiento (grokbot, sep 2026):** creé bots que monitorean New Relic y Sentry, generan reportes automáticos y levantan issues, entre otras automatizaciones internas del equipo.
* **Asistente conversacional con IA:** la capa frontend completa del chat embebido en el producto.
* **Panel de administración interno:** migración de Create React App a Vite (React 19, deploys a S3 y CloudFront).
* **Automatización:** flujos de n8n integrados con APIs externas como WhatsApp Business.
* **Observabilidad:** Service Levels y alertas en New Relic, digest semanal a Slack y Sentry en el frontend.
* **Gobierno de costos en GCP:** junto al equipo aplicó políticas en Google Cloud orientadas a bajar los gastos de la nube.

#### Desarrollador Mobile / Front-end SSR (React Native y React) | Jun 2022 - Abr 2025
(Etapas: React Native Developer de jun 2022 a dic 2023 y Full-Stack Developer de ene 2024 a mar 2025.)
* **Primera migración a TypeScript:** pasó la app móvil legacy de JavaScript a TypeScript, la primera vez que se usó TS en el proyecto.
* **Mentoría de 2 pasantes** (de 1 y 3 meses).
* **Frontend a escala con mentalidad de producto/MVP:** entregué features transversales en web y mobile con foco en lanzamientos rápidos y adaptabilidad al negocio.
* **Modularización del ecosistema:** lideré propuestas técnicas aprobadas para estandarizar el frontend (Zustand, React Query, ESLint, Prettier) y armé pipelines en Bitbucket (Vitest, SonarQube, Husky).
* **Mobile engineering:** reestructuré el state management global con Zustand (corrigiendo fugas de rendimiento), migré componentes clave a TypeScript y coordiné el refactor del Design System mobile.
* **Mentoría:** onboarding y formación de devs junior (incluidas demos técnicas de React Query); acompañamiento hasta completar su período de prueba.

### EXPERIENCIA PREVIA | Desarrollador Full-stack Jr. | 2020 - 2021
#### DevGAM, Secretaría de TIC (UTN FRLP) y New Logic
En DevGAM (dic 2020 – dic 2021) hizo sistemas de gestión de stock, contables, de turnos y clientes para frigoríficos, gimnasios, fletes, restaurantes y supermercados. En la Secretaría de TIC de la UTN FRLP (ene 2020 – sep 2021) hizo el sistema de trámites universitarios con Laravel, Vue, React y Strapi. En New Logic (2020) hizo un blog con marketplace en React sobre Google Cloud Platform.
En resumen: desarrollo full-stack para sistemas de administración comercial, gestión de stock, administración contable, gestión de turnos/clientes, trámites universitarios y plataformas web (marketplace y portal de noticias). Motor CMS propietario en PHP, optimización de bases de datos MySQL e implementación de frontends en React y Vue sobre Google Cloud Platform.

## Proyectos Destacados

### LDP Copilot — Asistente de producto multi-agente
(In English: LDP Copilot — the AI product assistant Ramiro built for Libro de Pases. Formerly called Agent General; it also absorbed the earlier Agent Scout scouting assistant. Natural language filters: it parses free-text filters into the structured JSON of the advanced player search.)
LDP Copilot es el asistente de producto con IA que Ramiro construyó para Libro de Pases, la plataforma de fútbol (clubes, agentes y jugadores): un agente raíz sin herramientas de datos clasifica cada turno y delega en 5 sub-agentes agrupados por tarea del usuario: jugadores (scouting, búsqueda en lenguaje natural con un parser NL→JSON que compila lo que pide el usuario en texto libre a los filtros estructurados de la búsqueda avanzada de jugadores, similares, perfil y comparaciones), clubes y agentes, plantilla propia y mercado, scouting propio (listas, shadow teams y dashboards) y cuenta y ayuda. Identidad por usuario: cada llamada a la API usa el JWT del usuario que conversa, verificado en cada turno, con sesiones aisladas. Escrituras reversibles con confirmación explícita (crear una lista o un shadow team, sumar o quitar jugadores, generar el PDF de un perfil). Muestra tarjetas de UI generativa (comparaciones, sugerencias, opciones). Responde en el idioma del usuario (español, inglés y portugués de primera clase). Evals determinísticos sin LLM juez: 49 casos contra el entorno real que verifican sub-agentes y tools esperados, idioma y grounding (cada número y nombre de la respuesta tiene que salir de las tools). Incluye un servidor MCP que expone el agente desplegado como una tool ask(message) para agentes de código. Construido con Google ADK y Gemini, desplegado en Vertex AI Agent Engine.
* **Stack:** Python 3.13, Google ADK, Vertex AI Agent Engine, Gemini, uv, pytest.
* **Link:** https://ramirocerda.com.ar/work/ldp-copilot

### Soccer Analytics Agent
Agente de chat de análisis y predicción de fútbol sobre ~49k partidos internacionales (1872–hoy, dataset Kaggle), con un loop de herramientas escrito a mano (sin framework de agentes): Gemini vía Vertex AI razona, decide y llama tools. Expone 9 herramientas, entre ellas SQL de solo lectura, búsqueda vectorial, retrieval híbrido con fusión RRF, Elo por equipo, forma y head-to-head, y un predictor de resultados con XGBoost multiclass (51 features, 336 equipos, fallback Elo). Memoria de 3 niveles (working/episodic/semántica) y Postgres 16 + pgvector como capa única de datos, vectores y memoria. Fases 0–7 completas (predictor incluido); fase 8 de deploy a GCP (Cloud Run + Cloud SQL) en curso.
* **Stack:** Python 3.12, uv, Postgres 16 + pgvector, sentence-transformers (MiniLM all-MiniLM-L6-v2, 384 dims), XGBoost, FastAPI, React, Gemini vía Vertex AI, Ruff, pre-commit.
* **Link:** https://github.com/ramiro-c/ai-agents-hub

### Mundial 2026 — Soccer Analytics / World Cup Companion
Aplicación full-stack de análisis de fútbol para el Mundial 2026 (México, USA, Canadá). Incluye tabla de grupos con lógica de mejores terceros, fixture completo con hora local, cuadro eliminatorio de 16avos hasta la Final, mapa interactivo de las 16 sedes, histórico de enfrentamientos en Mundiales desde 1930 con estadísticas por selección y guía de TV por país.
* **Fuentes de datos:** wheniskickoff API (fixture, grupos, sedes, TV), OpenFootball (histórico CC0), StatsBomb (eventos históricos).
* **Stack:** FastAPI, React 19, TypeScript, Vite, Tailwind CSS v4, Leaflet, Cloudflare Workers.
* **Links:** Demo: https://worldcup-2026.rami992009.workers.dev | GitHub: https://github.com/ramiro-c/worldcup-2026

### linkedin-markdownificator
Herramienta para exportar perfiles de LinkedIn a Markdown, facilitando la sincronización con sitios web personales e interacción con agentes de IA. Para lograrlo, diseñé un extractor tolerante a cambios en el DOM adaptado al layout React post-2025, externalicé los selectores en JSON para evitar rupturas de scraping y aseguré la estabilidad con 26 pruebas de integración.
* **Stack:** Python, Selenium, BeautifulSoup, Pytest, Ruff.
* **Link:** https://github.com/ramiro-c/linkedin-markdownificator

### Portafolio Personal y Asistente IA
Diseñé y desarrollé mi sitio web personal integrando a Botardo, un agente conversacional con RAG (retrieval-augmented generation) que responde consultas interactivas sobre mi experiencia y stack. El bot corre en Cloudflare Workers con recuperación vectorial sobre Cloudflare Vectorize y generación con DeepSeek V4.1 Flash a través de OpenCode Go. La base de conocimiento la armé gracias al scraper linkedin-markdownificator.
* **Stack:** Astro, TypeScript, Cloudflare Workers, Cloudflare Vectorize, Workers AI (embeddings bge-m3), OpenCode Go (DeepSeek V4.1 Flash), Vercel.
* **Link:** https://ramirocerda.com.ar

### Spec Refinery
Sistema multi-agente que convierte un ticket vago en una spec Gherkin con citas: interroga al PM ronda a ronda contra el corpus de la organización (ADRs, specs, catálogo) vía RAG, distingue un choque real de simple contexto y no deja pasar una respuesta vaga. Supervisor determinístico más especialistas y un writer, con checkpointing async y trazas en Arize Phoenix.
* **Stack:** Python 3.12, LangGraph, FastAPI, Streamlit, Chroma, Vertex AI, Arize Phoenix, Docker.
* **Link:** https://github.com/ramiro-c/spec-refinery

## Sitio Web y Arquitectura del Bot

* **Sitio:** https://ramirocerda.com.ar, desarrollado con Astro y TypeScript, desplegado en Vercel.
* **Botardo:** agente conversacional serverless que vive en un Cloudflare Worker junto a la web personal.
* **Pipeline RAG por pregunta:**
  1. Se detecta el idioma del último mensaje del visitante (español o inglés) de forma determinística.
  2. El mensaje se convierte en embedding con el modelo bge-m3 de Workers AI.
  3. Se recuperan los chunks más relevantes de la base de conocimiento desde Cloudflare Vectorize (top-k con umbral de similitud).
  4. Se genera la respuesta con DeepSeek V4.1 Flash vía la API de OpenCode Go, usando solo el contexto recuperado y el historial de los últimos 10 turnos.
* **Idioma:** responde en el mismo idioma del visitante: español rioplatense (voseo) o inglés.
* **Sin información:** si la pregunta no tiene contexto en la base, Botardo lo aclara con elegancia en el idioma del visitante, sin inventar contenido.
* **Seguridad:** la API key de OpenCode Go vive como secret del Worker, nunca en el repositorio.

### Botardo — Implementación
Agente conversacional con RAG embebido en mi sitio web personal. Implementé el pipeline completo en Cloudflare Workers: el mensaje del visitante se embeddea con bge-m3 (Workers AI), se recuperan los chunks más similares desde Cloudflare Vectorize (umbral de similitud más tope de 4 chunks) y se genera la respuesta con DeepSeek V4.1 Flash a través de OpenCode Go. El idioma (es/en) se detecta de forma determinística y, si no hay contexto recuperado, igual se llama al modelo: el prompt marca el contexto como vacío e instruye a DeepSeek a responder solo con lo recuperado y a decir con naturalidad que no tiene esa información, sin inventar. Incluye retry con backoff, CORS acotado a los orígenes del sitio y 32 pruebas con Vitest. La base de conocimiento se alimenta desde mi exportador linkedin-markdownificator.
* **Stack:** Astro, TypeScript, Cloudflare Workers, Cloudflare Vectorize, Workers AI (embeddings bge-m3), OpenCode Go (DeepSeek V4.1 Flash), Vitest.

### LactarIA — resultados del piloto
(In English: LactarIA pilot results — about 50 users, 22 answered the validation survey: 100% satisfaction, 77.3% reported less anxiety, 95.5% ease of use, 90% trusted the answers.)
App móvil de lactancia y crianza (oct–nov 2024) hecha para la tesis de dos puericultoras: chatbot con Gemini, preguntas frecuentes y contacto, publicada en Play Store en prueba cerrada. En el piloto participaron unas 50 usuarias y 22 respondieron la validación: 100% de satisfacción (8 a 10 sobre 10), 77,3% reportó menos ansiedad, 95,5% destacó la facilidad de uso y 90% confió en las respuestas.
* **Stack:** React Native, Expo, serverless, Gemini API, Vercel.

### AI Agents Hub
Monorepo de arquitecturas de agentes: planificación multi-paso (PlanReAct), extracción estructurada con Pydantic y ejecución nativa de código. Incluye dos apps full-stack (Career Coach y Customer Support) desplegadas en Cloud Run y Vertex AI Agent Engine.
* **Stack:** Python 3.13, Google ADK, LangGraph, FastAPI, React 19, Vertex AI, Cloud Run.
* **Repositorio (el mismo monorepo que el Soccer Analytics Agent):** https://github.com/ramiro-c/ai-agents-hub

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
(In English: certifications — Ramiro holds 10 Google Cloud AI Agents certifications, finished in June and July 2026. Keywords: certifications, certificates, credentials, when did he finish them.)
Completé el recorrido completo de Google Cloud en AI Agents: 10 certificaciones oficiales en dos tandas (jun y jul 2026), desde los fundamentos del Agent Development Kit hasta la orquestación multi-agente en Gemini Enterprise y el despliegue de arquitecturas en producción.
* **Junio 2026:** Engineer AI Agents with Agent Development Kit (ADK) · Optimize Agent Behavior · Add Agent Capabilities With Tools · Manage Agent Memory and State.
* **Julio 2026:** Build and Deploy Agents in Production · Deploy Your First Agent · Gen AI Agents: Transform Your Organization · Human-Centered AI · Orchestrate Multi-agent Workflows with Gemini Enterprise · Deploy Multi-Agent Architectures.
* **Otros cursos (además de las certificaciones de Google):** NestJS Zero to Hero (Udemy, mar 2022), SQL Básico–Intermedio (Udemy, abr 2022) y 8 cursos de LinkedIn Learning sobre IA generativa, Copilot, ética en IA y liderazgo (ene–mar 2025).

## Stack Técnico

* **Frontend & Mobile:** React (19), React Native, TypeScript, JavaScript, Expo, Zustand, React Query, Vue.js, Tailwind CSS (v4), Shadcn/ui, Leaflet, amCharts.
* **Datos:** PostgreSQL (tuning de planes con EXPLAIN ANALYZE, índices GIN y trigram, CLUSTER, pg_prewarm), MySQL, BigQuery, MongoDB, Redis, Drizzle ORM, Sequelize, vistas materializadas.
* **Backend, Cloud & Data:** Node.js, Express, NestJS, Python, FastAPI, Zod, AWS (S3, Lambda), MySQL, PostgreSQL, Google Cloud Platform (Vertex AI, Cloud Run), Cloudflare Workers (Edge Computing), Serverless, APIs REST, Pino Logger.
* **IA & Automatización:** Google ADK, LangGraph, Cloudflare Workers AI (embeddings bge-m3), Cloudflare Vectorize (RAG), OpenCode Go (DeepSeek V4.1 Flash), n8n, APIs de LLMs (Gemini, Anthropic), OpenRouter, Claude Code, Cursor (context management).
* **DevOps, Calidad & Testing:** CI/CD (GitHub Actions, Bitbucket Pipelines), Docker, Git (worktrees), Bash, Sentry, New Relic, Pytest, Jest, Vitest, Playwright, Bruno, SonarQube, Biome, Husky.
* **Arquitectura:** Repository Pattern, inyección de dependencias, DDD, arquitectura hexagonal, atomic design, container-presentational.
* **Metodologías & Procesos:** SCRUM, GitFlow, Code Reviews, Jira, Confluence.
* **Certificaciones:** Path completo de Google Cloud en AI Agents (10 certificaciones, jun–jul 2026) — ver sección Certificaciones.
* **Idiomas:** Español (Nativo) | Inglés (B2).

## Educación

(In English: Education — Information Systems Engineering degree at Universidad Tecnológica Nacional (UTN FRLP), 2018-2023, GPA 8.04; AI Engineering short course at Coderhouse, 2026. Keywords: studies, study, university, degree, education, GPA, career, academic background, teaching assistant.)
(En español: qué estudió Ramiro, estudios, carrera universitaria, título, facultad, formación académica, ayudante de cátedra, dio clases.)

* **Universidad Tecnológica Nacional - FRLP | Feb 2018 - May 2023**
  * **Ingeniería en Sistemas de Información** — Promedio: 8.04
  * **Ayudante de Cátedra** — Sistemas Operativos (2021): soporte práctico a dos comisiones de 30 estudiantes.
  * **Becario de investigación** — LINSI (1 año): arquitecturas con Docker, Linux, redes de servidores y Blockchain.

* **Coderhouse | Jul 2026 - Ago 2026**
  * **AI Engineering** — Curso de ingeniería en IA (6 clases + trabajo final). Entregables del curso: cliente unificado async de LLMs, pipeline de procesamiento validado (LangChain + Pydantic), RAG semántico local sobre apuntes (LangChain 1.x + Chroma) y RAG híbrido escalable con Pinecone (BM25 + embeddings locales + fusión RRF). Ver: https://www.coderhouse.com/ar/cursos/ai-engineering
`;
