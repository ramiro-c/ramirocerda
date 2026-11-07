# Golden set (borradores)

- **`seed-from-cases.jsonl`**: copias mínimas de filas ya presentes en `evals/cases.json` (mismo `id` y `expectedChunks`), para documentar el schema sin inventar hechos.
- **Borradores LLM**: nombra archivos `DRAFT-*.jsonl` o incluye `"label": "LLM_DRAFT"` en cada línea hasta que Ramiro cura y las fusiona a `cases.json`.

Schema alineado con `EvalCase` / `cases.json`:

```json
{"id": "unique-id", "question": "...", "expectedChunks": ["kb-prefix"], "answerable": true, "label": "LLM_DRAFT"}
```

Los prefijos de `expectedChunks` deben verificarse contra el KB indexado o fixtures del repo antes de marcar como golden.
