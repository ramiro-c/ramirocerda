---
slug: mini-projects
kind: personal
status: wip
featured: false
order: 10
repo: https://github.com/ramiro-c/mini-projects
tags: ["Backend", "RabbitMQ", "TypeScript"]
es:
  title: "mini-projects — Lab de patrones backend"
  summary: "Laboratorio incremental de patrones de backend y sistemas distribuidos: un proyecto numerado por vez, cada uno spec-driven, de fundamentos de diseño a microservicios event-driven con observabilidad completa."
  problem: "Los patrones de diseño y los sistemas distribuidos se entienden de verdad implementándolos, no leyéndolos. Faltaba un espacio ordenado para construirlos de a uno, sin mezclar todo en un repo caótico."
  what: "Proyecto 01 (completo): una interfaz uniforme EmailSender sobre proveedores SMTP/File/Null, con decoradores de logging, retry y circuit-breaker, más una máquina de estados Closed → Open → Half-Open. Proyecto 02 (en curso): microservicios de órdenes event-driven con RabbitMQ, sagas y observabilidad completa (Prometheus, Grafana, tracing con Jaeger). Todo sobre Bun + TypeScript + Fastify, con Zod, Vitest y Biome, y Docker Compose para dev local."
  highlights:
    - "Patrones Adapter + Decorator + máquina de estados de circuit-breaker (proyecto 01, completo)."
    - "Microservicios de órdenes event-driven con RabbitMQ y sagas (proyecto 02, en curso)."
    - "Observabilidad de extremo a extremo: métricas con Prometheus/Grafana y tracing con Jaeger."
    - "Cada proyecto spec-driven, con Docker Compose para levantar el entorno local."
  stack: ["Bun", "TypeScript", "Fastify", "Zod", "RabbitMQ", "Prometheus", "Grafana", "Jaeger", "Docker"]
en:
  title: "mini-projects — Backend patterns lab"
  summary: "An incremental lab of backend and distributed-systems patterns: one numbered project at a time, each spec-driven, from design fundamentals to event-driven microservices with full observability."
  problem: "Design patterns and distributed systems are learned by building them, not by reading about them. What was missing was a structured space to build them one at a time, without mixing everything into one chaotic repo."
  what: "Project 01 (complete): a uniform EmailSender interface over SMTP/File/Null providers, with logging, retry, and circuit-breaker decorators, plus a Closed → Open → Half-Open state machine. Project 02 (in progress): event-driven order microservices with RabbitMQ, sagas, and full observability (Prometheus, Grafana, Jaeger tracing). All on Bun + TypeScript + Fastify, with Zod, Vitest, and Biome, and Docker Compose for local dev."
  highlights:
    - "Adapter + Decorator + circuit-breaker state machine patterns (project 01, complete)."
    - "Event-driven order microservices with RabbitMQ and sagas (project 02, in progress)."
    - "End-to-end observability: Prometheus/Grafana metrics and Jaeger tracing."
    - "Every project is spec-driven, with Docker Compose to spin up the local environment."
  stack: ["Bun", "TypeScript", "Fastify", "Zod", "RabbitMQ", "Prometheus", "Grafana", "Jaeger", "Docker"]
---
