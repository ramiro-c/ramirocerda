---
slug: gastify
kind: personal
status: active
featured: true
order: 5
tags: ["SvelteKit", "Cloudflare", "AI"]
es:
  title: "Gastify — Finanzas con bot de Telegram"
  summary: "Tracker de finanzas personales con dos puertas de entrada: un dashboard PWA y un bot de Telegram que parsea mensajes en lenguaje natural ('gasté 5 lucas en el súper con débito') a transacciones estructuradas usando IA."
  problem: "Cargar gastos e ingresos a mano es tedioso y se abandona rápido; y cuando la data se reparte entre planillas por moneda, categoría y mes, se vuelve inmanejable."
  what: "Construí la app sobre SvelteKit, desplegada como Cloudflare Worker, con Drizzle ORM sobre Turso/libSQL. El bot de Telegram interpreta lenguaje natural en español vía OpenRouter y se vincula a la cuenta web con códigos de un solo uso. Auth con JWT en cookies httpOnly, PWA instalable con service worker, y todo el diseño documentado con OpenSpec y ADRs."
  highlights:
    - "Bot de Telegram que convierte 'gasté 5 lucas en el súper' en una transacción estructurada usando IA (OpenRouter)."
    - "Dashboard PWA instalable con desglose por moneda, categoría y mes."
    - "Vinculación web ↔ bot mediante códigos de un solo uso."
    - "Type-safety en tiempo de compilación: un módulo asserta que los tipos que infiere Drizzle coinciden con el dominio, evitando drift de schema."
    - "Desplegado en Cloudflare Workers, con auth JWT en cookies httpOnly."
  stack: ["SvelteKit", "Svelte 5", "TypeScript", "Cloudflare Workers", "Drizzle ORM", "Turso / libSQL", "OpenRouter"]
en:
  title: "Gastify — Finance tracking with a Telegram bot"
  summary: "A personal finance tracker with two entry points: a PWA dashboard and a Telegram bot that parses natural-language messages ('I spent 5k at the store on debit') into structured transactions using AI."
  problem: "Logging income and expenses by hand is tedious and quickly abandoned; and once the data is scattered across spreadsheets by currency, category, and month, it becomes unmanageable."
  what: "Built the app on SvelteKit, deployed as a Cloudflare Worker, with Drizzle ORM over Turso/libSQL. The Telegram bot parses natural-language Spanish via OpenRouter and links to the web account with one-time codes. Auth is JWT in httpOnly cookies, it's an installable PWA with a service worker, and the whole design is documented with OpenSpec and ADRs."
  highlights:
    - "A Telegram bot that turns 'I spent 5k at the store' into a structured transaction using AI (OpenRouter)."
    - "Installable PWA dashboard with per-currency, per-category, and monthly breakdowns."
    - "Web ↔ bot account linking via one-time codes."
    - "Compile-time type-safety: a module asserts that Drizzle's inferred types match the domain types, preventing schema drift."
    - "Deployed on Cloudflare Workers, with JWT auth in httpOnly cookies."
  stack: ["SvelteKit", "Svelte 5", "TypeScript", "Cloudflare Workers", "Drizzle ORM", "Turso / libSQL", "OpenRouter"]
---
