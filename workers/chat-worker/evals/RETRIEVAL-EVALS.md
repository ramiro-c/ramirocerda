# Evals de retrieval de Botardo

Estrategia para medir la calidad del retrieval de Botardo, qué significa cada métrica y próximos pasos. Doc interno: complementa el harness de `workers/chat-worker/evals/` (`run.ts`, `metrics.ts`, `cases.json`).

## Contexto: el pipeline hoy

Verificado contra el código (`src/router.ts`, `src/rag.ts`, `src/retrieval.ts`, `src/config.ts`, `wrangler.jsonc`):

1. **Router** (`src/router.ts`): una request al modelo de decisión Jev (`jev-1.13-free`, fallback `jev-1.13`) clasifica el mensaje en `search` / `smalltalk` / `off_topic`. Si la confianza es menor a `DECISION_MIN_CONFIDENCE` (0.5), busca igual. También arma la query de búsqueda y una query alternativa.
2. **Búsqueda densa** (`src/rag.ts`): embedding con `@cf/baai/bge-m3`, consulta al índice Vectorize `botardo-kb`. Con reranker activo trae `RAG_RERANK_CANDIDATES` candidatos (15 en `wrangler.jsonc`, 20 por defecto en código); `TOP_K` (5) solo aplica sin reranker.
3. **Rerank**: `@cf/baai/bge-reranker-base` reordena los candidatos y se quedan los primeros `MAX_CHUNKS` (6).
4. **Abstención**: `SIMILARITY_THRESHOLD` (0.30). Con reranker no filtra chunk por chunk: si ningún candidato denso lo supera, no hay chunks y Botardo responde que no tiene info.
5. **Juez de suficiencia** (`src/retrieval.ts`): Jev decide si los chunks alcanzan (umbral `JUDGE_SUFFICIENT_THRESHOLD`, 0.4). Si no alcanzan, hay **una** segunda búsqueda (máximo 2 por mensaje) con la **query alternativa del router**. Jev no genera texto, así que no hay una reescritura libre de la query. Los resultados se mergean por id y se recortan a 6 chunks.

Qué mide ya el harness (`evals/run.ts`, `evals/metrics.ts`): router, latencia y llamadas, recall de chunks (`chunkRecall` sobre prefijos de `expectedChunks`) y hit sobre los **chunks finales**, suficiencia, faithfulness y abstención (estas últimas con jueces Jev, `evals/stage-judges.ts`). Lo que falta es medir **cada etapa del retrieval por separado** (densa vs. rerank vs. contexto final) y métricas de ranking.

## Glosario

- **Recall@k / hit rate@k**: Recall@k es la fracción de los chunks correctos que aparecen en el top k. Hit rate@k es 1 si al menos uno correcto aparece en el top k, si no 0, promediado sobre las preguntas. Con 1 chunk correcto por pregunta son lo mismo.
- **Precision@k**: qué fracción del top k es relevante. Con 1-2 chunks correctos y k=5 el techo es bajo y dice poco.
- **MRR (Mean Reciprocal Rank)**: promedio de 1/posición del primer chunk correcto (1 si está primero, 0.5 si está segundo, 0 si no aparece). Mide qué tan arriba queda lo correcto.
- **nDCG@k**: como MRR pero con relevancia graduada (muy relevante, algo relevante…) y descuento por posición. Sin grados de relevancia se parece mucho a MRR.
- **Context precision / context recall (estilo RAGAS)**: un juez LLM evalúa si el contexto recuperado es relevante (precision) y si cubre lo que pide la respuesta de referencia (recall). Útil cuando no hay chunks etiquetados; más caro y ruidoso.
- **Faithfulness / groundedness**: si lo que afirma la respuesta generada está respaldado por los chunks que se le pasaron. Mide la generación, no el retrieval.

## Estrategia para Botardo

La KB es chica y casi todas las preguntas tienen 1-2 chunks correctos. No hace falta una batería de métricas: alcanza con pocos números bien elegidos.

Ya están en el harness y **no se duplican**: faithfulness, suficiencia y abstención (`evals/stage-judges.ts`), y `chunkRecall`/hit sobre los chunks finales. Como esos solo miran el contexto final, hoy no se distingue un error de embeddings de uno del reranker. Lo que falta medir, por etapa:

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

**Recall@6** (contexto final) solo para las preguntas multi-chunk, donde importa traer todas las piezas.

Descartadas por ahora:

- **nDCG**: sin relevancia graduada da casi lo mismo que MRR.
- **Precision@k en la etapa densa**: con 1-2 chunks correctos pesa poco; la precisión que importa es la del contexto final (punto 5).

## Golden set mínimo

- 30-50 preguntas versionadas en el repo (JSONL, o extendiendo `evals/cases.json`, que ya usa el mismo criterio de prefijos).
- Campos: pregunta, chunks esperados por **documento + sección** (prefijo de id, no id de vector con hash, para sobrevivir cambios de chunking), contestable sí/no.
- Mezcla aproximada:
  - ~40% datos puntuales del CV;
  - ~20% multi-chunk (proyectos);
  - ~20% paráfrasis y habla real (inglés, typos);
  - ~20% no contestables.
- Generación: un LLM propone 2 preguntas por chunk y Ramiro las cura. Sumar preguntas reales de los logs cuando las haya.
- Correrlo en el mismo harness de `evals/run.ts`, registrando cada etapa: candidatos densos de Vectorize (top 15), orden post-rerank y contexto final.

## Próximos pasos

- [ ] Armar el golden set (30 preguntas para empezar) con la mezcla de arriba.
- [ ] Definir el schema. Ejemplo (filas **de ejemplo**, no son casos reales):

```jsonl
{"id": "EJEMPLO-cv-trabajo", "question": "¿Dónde trabaja Ramiro?", "expectedChunks": ["kb-overview"], "answerable": true}
{"id": "EJEMPLO-no-contestable", "question": "¿Cuál es el color favorito de Ramiro?", "expectedChunks": [], "answerable": false}
```

- [ ] Extender el harness para guardar los ids por etapa (denso, post-rerank, final) y calcular hit@15 y hit@5 densos, MRR post-rerank, precisión del contexto final y Recall@6 en multi-chunk.
- [ ] Medir un baseline y guardarlo en `evals/results/`.
- [ ] Barrer `SIMILARITY_THRESHOLD` contra el mejor puntaje denso y calibrarlo con los dos errores de abstención.
- [ ] Decidir si la segunda búsqueda y el juez de suficiencia se quedan, según cuántas preguntas rescata la segunda búsqueda y cuántos "alcanza" falsos da el juez.
- [ ] Decidir si bajar `MAX_CHUNKS` según la precisión del contexto final.
