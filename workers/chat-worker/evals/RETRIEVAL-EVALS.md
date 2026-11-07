# Evals de retrieval de Botardo

Estrategia para medir la calidad del retrieval de Botardo, qué significa cada métrica y próximos pasos. Doc interno: complementa el harness de `workers/chat-worker/evals/` (`run.ts`, `metrics.ts`, `cases.json`).

## Cómo correr el eval (métricas por etapa)

En `workers/chat-worker`, con credenciales de **solo lectura** (Cloudflare account + token con AI + Vectorize query, y `OPENCODE_GO_API_KEY` para generación/jueces), desde la raíz del monorepo:

```bash
pnpm chat:eval
```

Equivale a `pnpm run --filter ramirocerda-chat-worker eval` (tsx → `evals/run.ts`). Opciones ya documentadas en el header de `run.ts`: `--cases`, `--only`, `--pipelines`, `--no-judge`, `--out` (por defecto `evals/results`).

**Modo real** (default): el pipeline adaptativo activa `collectRetrievalDiagnostics` y el harness registra, por cada consulta a Vectorize, ids ordenados en **denso** (resultado de Vectorize), **post-rerank** (hasta 6 tras `bge-reranker-base`) y **final** (mismos que post-rerank salvo merge tras 2.ª búsqueda). El informe markdown y el JSON incluyen las nuevas filas de la tabla (sección “1. Retrieval”).

**Sin credenciales Cloudflare**: `pnpm eval:offline` o `pnpm eval:decision-only` — las métricas de etapa densas/rerank/rescate aparecen como “sin diagnósticos” o `n/a`; sirven para probar el cableado sin Vectorize.

Los artefactos van a `evals/results/<ISO-stamp>-<modo>.md` y `.json` (directorio **gitignored**, creado al correr el eval).

## Contexto: el pipeline hoy

Verificado contra el código (`src/router.ts`, `src/rag.ts`, `src/retrieval.ts`, `src/config.ts`, `wrangler.jsonc`):

1. **Router** (`src/router.ts`): una request al modelo de decisión Jev (`jev-1.13-free`, fallback `jev-1.13`) clasifica el mensaje en `search` / `smalltalk` / `off_topic`. Si la confianza es menor a `DECISION_MIN_CONFIDENCE` (0.5), busca igual. También arma la query de búsqueda y una query alternativa.
2. **Búsqueda densa** (`src/rag.ts`): embedding con `@cf/baai/bge-m3`, consulta al índice Vectorize `botardo-kb`. Con reranker activo trae `RAG_RERANK_CANDIDATES` candidatos (15 en `wrangler.jsonc`, 20 por defecto en código); `TOP_K` (5) solo aplica sin reranker.
3. **Rerank**: `@cf/baai/bge-reranker-base` reordena los candidatos y se quedan los primeros `MAX_CHUNKS` (6).
4. **Abstención**: `SIMILARITY_THRESHOLD` (0.30). Con reranker no filtra chunk por chunk: si ningún candidato denso lo supera, no hay chunks y Botardo responde que no tiene info.
5. **Juez de suficiencia** (`src/retrieval.ts`): Jev decide si los chunks alcanzan (umbral `JUDGE_SUFFICIENT_THRESHOLD`, 0.4). Si no alcanzan, hay **una** segunda búsqueda (máximo 2 por mensaje) con la **query alternativa del router**. Jev no genera texto, así que no hay una reescritura libre de la query. Los resultados se mergean por id y se recortan a 6 chunks.

### Instrumentación (hook de eval)

`retrieveChunks` acepta opcionalmente `accumulate: RetrievalDiagnostics[]` para no bifurcar el camino de producción. En eval real, `runAdaptivePipeline({ collectRetrievalDiagnostics: true })` desactiva el prefetch paralelo del mensaje crudo para que cada búsqueda adjunte exactamente una fila de diagnóstico. El JSON del run incluye `denseIdsOrdered`, `postRerankIds` y `finalChunkIds` (y en adaptativo, `firstSearchChunkIds` + `retrievalIterations`).

**Nota sobre la 2.ª búsqueda**: las métricas **hit@k denso** y **MRR post-rerank** usan la **primera** búsqueda (`retrievalDiagnostics[0]`) para ser comparables con “una pasada” de retrieval. El **rescate** compara el merge final con el contexto solo del primer search.

## Qué mide el harness ahora

Además de router, latencia, `chunkRecall`/hit sobre chunks **finales**, suficiencia, faithfulness y abstención:

| Métrica (tabla del reporte) | Definición |
| --- | --- |
| Hit@k denso | `hit@min(15, candidatos)` sobre `denseIdsOrdered` del primer search vs prefijos `expectedChunks`. |
| Hit@5 denso | Igual con k=5 sobre el orden denso. |
| MRR post-rerank | MRR sobre `postRerankIds` (hasta 6) del primer search. |
| Precisión contexto final | Fracción de ids en el contexto final (hasta 6) que matchean algún prefijo esperado. |
| Rescate 2.ª búsqueda | Casos con 2 búsquedas donde el primer contexto **no** tenía ningún chunk esperado y el merge **sí** (miss → hit). |
| Juez falso-suficiente | `verdict === sufficient` pero ningún chunk esperado en el contexto final (umbral del juez 0.4 sin duplicar lógica en stage-judges). |

## Glosario

- **Recall@k / hit rate@k**: Recall@k es la fracción de los chunks correctos que aparecen en el top k. Hit rate@k es 1 si al menos uno correcto aparece en el top k, si no 0, promediado sobre las preguntas. Con 1 chunk correcto por pregunta son lo mismo.
- **Precision@k**: qué fracción del top k es relevante. Con 1-2 chunks correctos y k=5 el techo es bajo y dice poco.
- **MRR (Mean Reciprocal Rank)**: promedio de 1/posición del primer chunk correcto (1 si está primero, 0.5 si está segundo, 0 si no aparece). Mide qué tan arriba queda lo correcto.
- **nDCG@k**: como MRR pero con relevancia graduada (muy relevante, algo relevante…) y descuento por posición. Sin grados de relevancia se parece mucho a MRR.
- **Context precision / context recall (estilo RAGAS)**: un juez LLM evalúa si el contexto recuperado es relevante (precision) y si cubre lo que pide la respuesta de referencia (recall). Útil cuando no hay chunks etiquetados; más caro y ruidoso.
- **Faithfulness / groundedness**: si lo que afirma la respuesta generada está respaldado por los chunks que se le pasaron. Mide la generación, no el retrieval.

## Estrategia para Botardo

La KB es chica y casi todas las preguntas tienen 1-2 chunks correctos. No hace falta una batería de métricas: alcanza con pocos números bien elegidos.

Ya están en el harness y **no se duplican**: faithfulness, suficiencia y abstención (`evals/stage-judges.ts`), y `chunkRecall`/hit sobre los chunks finales. Las métricas por etapa anteriores cubren **denso vs. rerank vs. contexto final** y el comportamiento del **juez + 2.ª búsqueda**.

1. **Etapa densa (antes del rerank)**:
   - **hit@15** sobre los candidatos de Vectorize (`RAG_RERANK_CANDIDATES`, 15 en `wrangler.jsonc`): si el chunk correcto no está ahí, el reranker no lo puede rescatar. Mide embeddings + chunking.
   - **hit@5 denso**: compararlo con el resultado post-rerank muestra cuánto aporta el reranker frente a quedarse con el top 5 de embeddings.
2. **MRR post-rerank** sobre los `MAX_CHUNKS` (6) que quedan después de `bge-reranker-base`: qué tan arriba queda el chunk correcto.
3. **Umbral de abstención**: barrer `SIMILARITY_THRESHOLD` (hoy 0.30) contra el mejor puntaje denso de cada pregunta y mirar los dos errores por separado. Sirve para calibrar el umbral:
   - contestar cuando la info no está;
   - abstenerse cuando la info está en la KB.
4. **Segunda búsqueda y juez**:
   - cuántas preguntas rescata la segunda búsqueda con la query alternativa del router (pasan de fallar a acertar); si casi ninguna, es latencia para sacar;
   - cuántas veces el juez de suficiencia (umbral `JUDGE_SUFFICIENT_THRESHOLD`, 0.4) dice "alcanza" sin que esté el chunk correcto.
5. **Precisión del contexto final**: cuántos de los 6 chunks finales son relevantes. Si la mayoría sobra, considerar bajar `MAX_CHUNKS`.

**Recall@6** (contexto final) solo para las preguntas multi-chunk, donde importa traer todas las piezas (se puede derivar del `chunkRecall` existente sobre los 6 finales).

Descartadas por ahora:

- **nDCG**: sin relevancia graduada da casi lo mismo que MRR.
- **Precision@k en la etapa densa**: con 1-2 chunks correctos pesa poco; la precisión que importa es la del contexto final (punto 5).

## Golden set mínimo

- 30-50 preguntas versionadas en el repo (JSONL, o extendiendo `evals/cases.json`, que ya usa el mismo criterio de prefijos).
- Campos: pregunta, chunks esperados por **documento + sección** (prefijo de id, no id de vector con hash, para sobrevivir cambios de chunking), contestable sí/no.
- Borradores generados por LLM: poner bajo `evals/golden/` con prefijo `DRAFT-` o campo `"label": "LLM_DRAFT"` y curar antes de fusionar a `cases.json` (ver `evals/golden/README.md`).
- Mezcla aproximada:
  - ~40% datos puntuales del CV;
  - ~20% multi-chunk (proyectos);
  - ~20% paráfrasis y habla real (inglés, typos);
  - ~20% no contestables.
- Correrlo en el mismo harness de `evals/run.ts`, registrando cada etapa: candidatos densos de Vectorize (top 15), orden post-rerank y contexto final.

## Próximos pasos

- [ ] Armar el golden set (30 preguntas para empezar) con la mezcla de arriba — **Ramiro**.
- [x] Definir el schema. Ejemplo (filas **de ejemplo**, no son casos reales):

```jsonl
{"id": "EJEMPLO-cv-trabajo", "question": "¿Dónde trabaja Ramiro?", "expectedChunks": ["kb-overview"], "answerable": true}
{"id": "EJEMPLO-no-contestable", "question": "¿Cuál es el color favorito de Ramiro?", "expectedChunks": [], "answerable": false}
```

- [x] Extender el harness para guardar los ids por etapa (denso, post-rerank, final) y calcular hit@15 y hit@5 densos, MRR post-rerank, precisión del contexto final; Recall@6 multi-chunk = `chunkRecall` sobre hasta 6 finales (ya existente).
- [ ] Medir un baseline y guardarlo en `evals/results/` — **requiere credenciales** (ver sección “Cómo correr”); el repo no incluye el baseline.
- [ ] Barrer `SIMILARITY_THRESHOLD` contra el mejor puntaje denso y calibrarlo con los dos errores de abstención — **Ramiro / trabajo futuro** (no automatizado en el harness).
- [ ] Decidir si la segunda búsqueda y el juez de suficiencia se quedan, según cuántas preguntas rescata la segunda búsqueda y cuántos "alcanza" falsos da el juez.
- [ ] Decidir si bajar `MAX_CHUNKS` según la precisión del contexto final.
