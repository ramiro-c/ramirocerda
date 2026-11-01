---
slug: botardo
kind: personal
status: live
featured: true
track: "ai-systems"
order: 3
tags: ["Cloudflare", "RAG", "TypeScript", "Workers AI", "Jev", "Vectorize"]
repo: https://github.com/ramiro-c/ramirocerda
es:
  title: "Botardo — Asistente IA con RAG Adaptativo"
  summary: "Agente conversacional con RAG adaptativo embebido en la web: router con modelo de decisión Jev, retrieval vectorial sobre Cloudflare Vectorize con embeddings bge-m3, reranker cross-encoder opcional, juez de suficiencia y generación con DeepSeek V4.1 Flash vía OpenCode Go."
  problem: "Mi web personal era estática y respondía igual a todos los visitantes. Quería que mi perfil fuera consultable de forma natural, con un asistente que responda con hechos de una base de conocimiento curada, sin alucinar ni inventar datos."
  what: "Diseñé Botardo como un Cloudflare Worker con pipeline RAG adaptativo. Arquitectura: el widget de Astro envía la consulta al Worker. Se aplican CORS y rate limit por IP, detección determinística de idioma ES/EN y el router Jev (System One) clasifica el mensaje en search/smalltalk/off-topic, decide si necesita historial y extrae intención de contacto. Para smalltalk u off-topic responde sin retrieval. Para search: embedding con bge-m3 (Workers AI) + búsqueda en Vectorize (botardo-kb). Si RAG_RERANK_MODEL está habilitado, se aplica el reranker cross-encoder bge-reranker-base. Un juez de suficiencia (Jev) evalúa los chunks recuperados; si son insuficientes y hay una query contextual, se realiza una segunda búsqueda, se fusionan por chunk id (máximo 6 chunks) y se vuelve a evaluar. La generación se hace con DeepSeek V4.1 Flash vía OpenCode Go usando el mensaje original e historial. La respuesta incluye offerContact y se registra en Analytics Engine. La base de conocimiento se sincroniza dinámicamente desde src/content/notes y src/content/projects en ambos idiomas. Incluye fallback sin LLM fuera de contexto, CORS acotado, rate limiting por IP y gestión de secretos."
  highlights:
    - "RAG adaptativo: router + juez de suficiencia + hasta 2 búsquedas con fusión por chunk id."
    - "Retrieval con Workers AI (bge-m3) + Vectorize + reranker cross-encoder opcional (@cf/baai/bge-reranker-base)."
    - "Modelo de decisión Jev (free con fallback a paid) + generación DeepSeek V4.1 Flash vía OpenCode Go."
    - "Indexado dinámico de proyectos y notas en es/en desde el repo."
    - "Detección determinística de idioma, fallback sin LLM, CORS acotado, rate limiting y Analytics Engine."
    - "Tests con Vitest, typecheck, deploy automatizado con Wrangler y CI gates."
  stack: ["Astro", "TypeScript", "Cloudflare Workers", "Cloudflare Vectorize", "Workers AI", "OpenCode Go", "System One (Jev)", "DeepSeek V4.1 Flash", "Analytics Engine", "Vitest"]
en:
  title: "Botardo — Adaptive RAG AI Assistant"
  summary: "A RAG-powered conversational agent embedded in the site with an adaptive retrieval pipeline: Jev decision router, vector search over Cloudflare Vectorize with bge-m3 embeddings, optional cross-encoder reranker, sufficiency judge, and generation with DeepSeek V4.1 Flash via OpenCode Go."
  problem: "My personal site was static and answered every visitor the same way. I wanted my profile to be naturally queryable, with an assistant that answers with facts from a curated knowledge base — without hallucinating or inventing data."
  what: "I built Botardo as a Cloudflare Worker with an adaptive RAG pipeline. Architecture: the Astro widget sends the query to the Botardo Worker. CORS and per-IP rate limiting are applied, followed by deterministic language detection (ES/EN) and the Jev (System One) router, which classifies each message as search/smalltalk/off-topic, decides whether history is needed, and extracts hire intent plus a raw and contextual query. Smalltalk and off-topic are answered without retrieval. For search: bge-m3 embeddings (Workers AI) are used to query Vectorize (botardo-kb). If RAG_RERANK_MODEL is set, results are reranked with the bge-reranker-base cross-encoder. A Jev sufficiency judge evaluates the retrieved chunks; if insufficient and a contextual query exists, a second search is performed, results are merged by chunk id (capped at 6), and re-evaluated. Generation uses DeepSeek V4.1 Flash via OpenCode Go with the original message and history. The response includes offerContact and is logged to Analytics Engine. The knowledge base is auto-synced from src/content/notes and src/content/projects in both languages. Includes no-LLM fallback for out-of-context questions, origin-restricted CORS, per-IP rate limiting, and secret management."
  highlights:
    - "Adaptive RAG: router + sufficiency judge + up to 2 searches with dedup/merge by chunk id."
    - "Retrieval with Workers AI (bge-m3) + Vectorize + optional cross-encoder reranker (@cf/baai/bge-reranker-base)."
    - "Jev decision model (free with paid fallback) + DeepSeek V4.1 Flash generation via OpenCode Go."
    - "Dynamic indexing of projects and notes in es/en directly from the repo."
    - "Deterministic language detection, no-LLM fallback, restricted CORS, rate limiting and Analytics Engine."
    - "Vitest suite, typecheck, automated deploys with Wrangler and CI gates."
  stack: ["Astro", "TypeScript", "Cloudflare Workers", "Cloudflare Vectorize", "Workers AI", "OpenCode Go", "System One (Jev)", "DeepSeek V4.1 Flash", "Analytics Engine", "Vitest"]
---
