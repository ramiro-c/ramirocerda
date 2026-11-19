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
- **Disponibilidad**: Ramiro está abierto a nuevas oportunidades: proyectos freelance y roles Full-Stack Engineer / Applied AI donde pueda hacerse cargo del producto de punta a punta.

## Contacto
Cómo contactar a Ramiro Cerdá para proyectos, roles o consultas:
- **Email**: rami992009@gmail.com (canal preferido para charlar de roles Full-Stack Engineer / Applied AI)
- **LinkedIn**: https://www.linkedin.com/in/cerdaramiro/
- **GitHub**: https://github.com/ramiro-c
- **Web personal**: https://ramirocerda.com.ar
- **Contacto profesional**: para oportunidades o proyectos, el canal es el email o el formulario de la web, que agenda una charla de 20 minutos sin costo ni compromiso.

## Kano Studio — detalle técnico de la landing
Detalle técnico del trabajo con Kano Studio: design system con paleta de cuatro colores y tokens CSS, i18n con swap estático, pipeline propio de imágenes OG con sharp, fuentes self-hosted y remediación de accesibilidad a WCAG 2.2 AA a partir de una auditoría con bloqueantes de contraste. Stack: Astro, TypeScript, sharp.

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
(In English: other LDP work — squad planner module, transfer marketplace, technical debt audit, frontend security audit, QA automation, AI chat frontend, admin panel migration to Vite.)
* **Planificador de plantillas (módulo nuevo end-to-end):** clubes y agentes arman alineaciones hipotéticas con jugadores del mercado. Diseñó el modelo de datos, la API (equipos, etiquetas, membresías, límites por plan) y la interfaz: cancha con formaciones, drag & drop, filtros y borradores, con tests E2E propios.
* **Marketplace de transferencias:** ownership end-to-end del módulo donde clubes y agentes publican, ofertan y cierran operaciones por jugadores: compatibilidad por rol, flujo de ofertas, firma de contrato, notificaciones por email y seguimiento de la transferencia.
* **Features core adicionales:** desarrollé junto al equipo otros módulos centrales de la plataforma: la Comparativa (panel multi-entidad para comparar jugadores, clubes y ligas) y el scouting propio (listas, shadow teams y dashboards).
* **Auditoría de deuda técnica del backend (iniciativa propia):** análisis de ~400 endpoints con 14 hallazgos priorizados por impacto y esfuerzo y un roadmap por sprints. La arquitectura objetivo (Repository Pattern, inyección de dependencias y Zod) se validó con una prueba de concepto de 17 tests en 3 capas.
* **Auditoría de seguridad del frontend:** 10 hallazgos verificados y corregidos en 4 módulos.
* **QA Automation:** más de 60 casos de API en Bruno, E2E con Playwright sobre varios entornos y 3 roles de usuario, y pipelines con reporte a Slack.
* **Bots propios de monitoreo y seguimiento (grokbot, sep 2026):** creé bots que monitorean New Relic y Sentry, generan reportes automáticos y levantan issues, entre otras automatizaciones internas del equipo.
* **Asistente conversacional con IA:** la capa frontend completa del chat embebido en el producto.
* **Panel de administración interno:** migración de Create React App a Vite (React 19, deploys a S3 y CloudFront).
* **Automatización:** flujos de n8n integrados con APIs externas como WhatsApp Business.
* **Observabilidad:** Service Levels y alertas en New Relic, digest semanal a Slack y Sentry en el frontend.
* **Gobierno de costos en GCP:** junto al equipo aplicó políticas en Google Cloud orientadas a bajar los gastos de la nube.

#### Desarrollador Mobile / Front-end SSR (React Native y React) | Jun 2022 - Abr 2025
(Etapas: React Native Developer de jun 2022 a dic 2023 y Full-Stack Developer de ene 2024 a mar 2025.)
* **Primera migración a TypeScript:** pasó la app móvil legacy de JavaScript a TypeScript, la primera vez que se usó TS en el proyecto.
* **Mentoría de 2 pasantes que venían de un bootcamp** (de 1 y 3 meses).
* **Frontend a escala con mentalidad de producto/MVP:** entregué features transversales en web y mobile con foco en lanzamientos rápidos y adaptabilidad al negocio.
* **Modularización del ecosistema:** lideré propuestas técnicas aprobadas para estandarizar el frontend (Zustand, React Query, ESLint, Prettier) y armé pipelines en Bitbucket (Vitest, SonarQube, Husky).
* **Mobile engineering:** reestructuré el state management global con Zustand (corrigiendo fugas de rendimiento), migré componentes clave a TypeScript y coordiné el refactor del Design System mobile.
* **Mentoría:** onboarding y formación de devs junior (incluidas demos técnicas de React Query); acompañamiento hasta completar su período de prueba.

### EXPERIENCIA PREVIA | Desarrollador Full-stack Jr. | 2020 - 2021
#### DevGAM, Secretaría de TIC (UTN FRLP) y New Logic
En DevGAM (dic 2020 – dic 2021) hizo sistemas de gestión de stock, contables, de turnos y clientes para frigoríficos, gimnasios, fletes, restaurantes y supermercados. En la Secretaría de TIC de la UTN FRLP (ene 2020 – sep 2021) hizo el sistema de trámites universitarios con Laravel, Vue, React y Strapi. En New Logic (2020) hizo un blog con marketplace en React sobre Google Cloud Platform.
En resumen: desarrollo full-stack para sistemas de administración comercial, gestión de stock, administración contable, gestión de turnos/clientes, trámites universitarios y plataformas web (marketplace y portal de noticias). Motor CMS propietario en PHP, optimización de bases de datos MySQL e implementación de frontends en React y Vue sobre Google Cloud Platform.

## LactarIA — resultados del piloto
(In English: LactarIA pilot results — about 50 users, 22 answered the validation survey: 100% satisfaction, 77.3% reported less anxiety, 95.5% ease of use, 90% trusted the answers.)
App móvil de lactancia y crianza (oct–nov 2024) hecha para la tesis de dos puericultoras: chatbot con Gemini, preguntas frecuentes y contacto, publicada en Play Store en prueba cerrada. En el piloto participaron unas 50 usuarias y 22 respondieron la validación: 100% de satisfacción (8 a 10 sobre 10), 77,3% reportó menos ansiedad, 95,5% destacó la facilidad de uso y 90% confió en las respuestas.
* **Stack:** React Native, Expo, serverless, Gemini API, Vercel.

## Certificaciones

### Google Cloud — AI Agents Path (completo, jun–jul 2026)
(In English: certifications — Ramiro holds 10 Google Cloud AI Agents certifications, finished in June and July 2026. Keywords: certifications, certificates, credentials, when did he finish them.)
Completé el recorrido completo de Google Cloud en AI Agents: 10 certificaciones oficiales en dos tandas (jun y jul 2026), desde los fundamentos del Agent Development Kit hasta la orquestación multi-agente en Gemini Enterprise y el despliegue de arquitecturas en producción.
* **Junio 2026:** Engineer AI Agents with Agent Development Kit (ADK) · Optimize Agent Behavior · Add Agent Capabilities With Tools · Manage Agent Memory and State.
* **Julio 2026:** Build and Deploy Agents in Production · Deploy Your First Agent · Gen AI Agents: Transform Your Organization · Human-Centered AI · Orchestrate Multi-agent Workflows with Gemini Enterprise · Deploy Multi-Agent Architectures.
* **Otros cursos (además de las certificaciones de Google):** NestJS Zero to Hero (Udemy, mar 2022), SQL Básico–Intermedio (Udemy, abr 2022) y 8 cursos de LinkedIn Learning sobre IA generativa, Copilot, ética en IA y liderazgo (ene–mar 2025).

## Stack Técnico

* **Datos:** PostgreSQL (tuning de planes con EXPLAIN ANALYZE, índices GIN y trigram, CLUSTER, pg_prewarm), MySQL, BigQuery, MongoDB, Redis, Drizzle ORM, Sequelize, vistas materializadas.
* **Arquitectura:** Repository Pattern, inyección de dependencias, DDD, arquitectura hexagonal, atomic design, container-presentational.
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
