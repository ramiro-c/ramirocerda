---
slug: botardo
kind: personal
status: live
featured: true
order: 1
tags: ["Cloudflare", "RAG", "TypeScript", "Workers AI"]
repo: https://github.com/ramiro-c/ramirocerda
es:
  title: "Botardo — Asistente IA con RAG"
  summary: "Agente conversacional con RAG embebido en la web: recuperación vectorial sobre Cloudflare Vectorize con embeddings bge-m3, generación con DeepSeek V4 Flash vía OpenCode Go, y detección determinística de idioma con fallback sin LLM para preguntas fuera de contexto."
  problem: "Mi web personal era estática y respondía igual a todos los visitantes. Quería que mi perfil fuera consultable de forma natural, con un asistente que responda con hechos de una base de conocimiento curada, sin alucinar ni inventar datos."
  what: "Diseñé Botardo sobre Cloudflare Workers: el mensaje del visitante se embeddea con bge-m3 (Workers AI), se recuperan los chunks más similares de la base en Vectorize (umbral de similitud más tope de 4 chunks) y se genera la respuesta con DeepSeek V4 Flash a través de OpenCode Go. El idioma (es/en) se detecta de forma determinística y, si no hay contexto recuperado, responde un fallback automático sin llamar al modelo. La knowledge base se alimenta desde mi exportador linkedin-markdownificator. Incluye retry con backoff, CORS acotado a los orígenes del sitio y 33 pruebas con Vitest."
  highlights:
    - "RAG completo en Cloudflare: Workers + Vectorize + embeddings bge-m3 (Workers AI)."
    - "Generación con DeepSeek V4 Flash vía OpenCode Go."
    - "Detección determinística de idioma (es/en) y fallback sin LLM cuando no hay contexto: cero costo en preguntas fuera de tema."
    - "Retry con backoff, CORS acotado y 33 pruebas con Vitest."
    - "Knowledge base curada y sincronizada desde linkedin-markdownificator."
  stack: ["Astro", "TypeScript", "Cloudflare Workers", "Cloudflare Vectorize", "Workers AI", "OpenCode Go", "DeepSeek V4 Flash", "Vitest"]
en:
  title: "Botardo — RAG-powered AI assistant"
  summary: "A RAG conversational agent embedded in the site: vector retrieval over Cloudflare Vectorize with bge-m3 embeddings, generation with DeepSeek V4 Flash via OpenCode Go, and deterministic language detection with a no-LLM fallback for out-of-context questions."
  problem: "My personal site was static and answered every visitor the same way. I wanted my profile to be naturally queryable, with an assistant that answers with facts from a curated knowledge base — without hallucinating or inventing data."
  what: "I built Botardo on Cloudflare Workers: the visitor's message is embedded with bge-m3 (Workers AI), the most similar chunks are retrieved from Vectorize (similarity threshold plus a 4-chunk cap), and the reply is generated with DeepSeek V4 Flash through OpenCode Go. Language (es/en) is detected deterministically, and when no context is retrieved the bot replies with an automatic fallback without calling the model. The knowledge base is fed by my linkedin-markdownificator exporter. Includes retry with backoff, CORS restricted to the site's origins, and 33 Vitest tests."
  highlights:
    - "Full RAG on Cloudflare: Workers + Vectorize + bge-m3 embeddings (Workers AI)."
    - "Generation with DeepSeek V4 Flash via OpenCode Go."
    - "Deterministic language detection (es/en) and a no-LLM fallback when no context is retrieved: zero cost for off-topic questions."
    - "Retry with backoff, restricted CORS, and 33 Vitest tests."
    - "Curated knowledge base synced from linkedin-markdownificator."
  stack: ["Astro", "TypeScript", "Cloudflare Workers", "Cloudflare Vectorize", "Workers AI", "OpenCode Go", "DeepSeek V4 Flash", "Vitest"]
---
