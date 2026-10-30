# Botardo KB retrieval — measured fixes

Objective: close the retrieval failures of `feat/botardo-adaptive-rag`'s eval (9 of 28 expected-chunk misses) with fixes chosen by measurement, not by hypothesis.
Branch: `feat/botardo-adaptive-rag`. Delivery: ask-on-risk. Test runner: `npx vitest run` (workers/chat-worker), then the full real eval for behavior. Feature document mirror: Engram topic `evals/botardo-kb-retrieval` (project `ramirocerda`).

## Specs

S1 (user, verbatim): "vamos con todos, dale" — implement the three candidate KB fixes (magnet-chunk filter, educación enrichment, notes dedup).
S2 (measured, offline simulation over the 28 expectedChunks cases, `/var/folders/l4/p94cgdcx25j8n538_dczdghw0000gn/T/opencode/kb-magnet-measure.mjs` + cache `kb-magnet-cache.json`): dominadores del top-4 en 28 casos: portafolio 12/28, overview 11/28, full-stack 9/28, sitio-web 7/28. Excluir portafolio solo: 20/28 (+1 fu-en-embeddings, reproduce el set de lineal); excluir además overview: 18/28 y rompe kb-es-contacto y kb-en-languages (ambas esperan overview legítimamente; overview contiene email y roles). Excluir 3-4 dominadores: 16/28 y 14/28. VERDICT: dead end, NO implementado.
S3 (measured, mismo script): dedupe slug es/en de notas (queda mejor score) = 19/28, sin ningún efecto en top-4. VERDICT: dead end, NO implementado.
S4 (measured, ranking cacheado sin tocar el índice): MAX_CHUNKS=4 → 19/28; top-5 → 21/28 (recupera kb-es-factory-note(rank 5) + 1); top-6 → 22/28 (+hi-es-contacto-proyecto, overview rank 6); top-8 → 22/28 (nada más). Costo: ~2 chunks extra al prompt de generación (~300-500 tokens/query). IMPLEMENTAR MAX_CHUNKS=6.
S5 (measured, `/var/folders/l4/.../kb-enrich-measure.mjs`): enriquecer kb-educacion con línea de temas (estudios, carrera, título, universidad, facultad) sube cos 0.285→0.319 (heading-tag 0.314); el floor del top-4 de esa query es ~0.40. NO ALCANZA. El gap léxico estudió↔Educación solo se cierra con recuperación híbrida (BM25 + vector) reindexando. PENDING USER DECISION. Los follow-ups ambiguos (fu-es-antes "¿Y antes de eso qué hacía?", fu-en-stack-that "What stack did he use for that one?") son anáfora sin antecedente en la query cruda: la query contextual es la correcta para ese tipo de caso.
S6 (measured text): `scripts/knowledge-base.js` Overview contiene "En LDP (Libro de Pases) trabaja como Tech Lead hands-on": las etiquetas kb-es-trabajo-actual / kb-en-where-work (expected full-stack rank >10 pero overview@0.53/0.52 responde) y fu-en-embeddings (retrieva el chunk más específico kb-botardo-implementacion, más fiel que el genérico esperado) están sobre-especificadas: se AGREGA el chunk que contiene el dato, se conserva el ideal.
S7: eval cases.json queda como seed data; no cambia semantics de ningún otro caso.

## Tasks

| ID | Linked | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2 | measured-only | done (dead end documented) | — |
| T2 | S3 | measured-only | done (dead end documented) | — |
| T3 | S4 | inline | done (MAX_CHUNKS 6) | 0f88883 |
| T4 | S6 | inline (eval fixtures) | done (3 labels corrected) | 0f88883 |
| T5 | S5 | inline | done (rerank cross-encoder en vez de BM25, probe decidio; KB en ingles) | 3936d1a, e24edaf, e19227d |

## Log

- L1 (2026-10-29, verbatim): "que pasa entonces con los kb? hay errores?" y "vamos con todos, dale" — esta feature.
- L2: probes offline fuera del repo, solo lectura (kb-magnet-measure, kb-enrich-measure). Baseline de comparación: eval real /tmp + report `evals/results/2026-10-29T18-34-18-935Z-real.md` (recall lineal 0.71 vs adaptativo 0.71).

- L3 (2026-10-30): S5 se resolvio con cross-encoder (`RAG_RERANK_MODEL` @cf/baai/bge-reranker-base, top-20 -> rerank -> top-6) en vez de BM25/hybrid: el probe (rerank-probe.mjs) mostro que el cross-encoder rescata kb-educacion del rank 15 al 5 con el question '¿Qué estudió Ramiro?' y 'What stack...' 18->2, sin repoblar infra nueva; BM25 no arreglaria el gap lexical estudió<->Educacion. Ademas linea en ingles en el chunk kb-educacion (probe: margen maximo 1.24e-3 con chunk en ingles) + repopulate (54 upserts, 1 prune).
- L4 (2026-10-30): eval real post-rerank `evals/results/2026-10-30T02-52-58-902Z-real.md`: **el flagship bug se arregla end-to-end** — kb-es-estudios adaptativo trae kb-educacion (rank 5) y ya NO abstiene (linear sigue fallando: dense-only). Recall 0.77 lin vs **0.84 ad** (primera vez que adaptativo claramente supera su baseline congelado); hits 23/28 vs 25/28; respuesta con dato 19/24 vs 21/24; falsa abstencion 3/24 en ambos; offerContact 51/52; router fallbacks 0/54; rerank 0.78/consulta. Costo: latencia p50 p50 4917 vs 4278 lin (el rerank suma ~0.5-2.5s por busqueda, como medido en el probe). Claims sin soporte: 13% lin vs 20% ad (ruidoso entre corridas, 18% la anterior). Commits: 3936d1a (rerank), e24edaf (counters eval), e19227d (KB + manifest + repopulate). Incidente: un populate real se ejecuto antes de tiempo por --help no manejado (54 upserts a mitad del primer eval de medicion -> eval abortado y relanzado limpio).
