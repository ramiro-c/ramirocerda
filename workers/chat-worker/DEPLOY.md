# Botardo chat worker — operations runbook

Real RAG + OpenCode Go generation (SDD change `botardo-rag-opencode-go`).

## Prerequisites

- Cloudflare account with Vectorize + Workers AI enabled (free tier OK).
- `wrangler` available (`pnpm dlx wrangler` works from this directory) and authenticated (`wrangler login`).
- Active OpenCode Go subscription with an API key. **The key is a Worker secret — it must never be committed to the repo.**

## One-time setup (already done on 2026-08-13)

```bash
# 1. Create the Vectorize index. IMMUTABLE: dimensions/metric cannot change later.
wrangler vectorize create botardo-kb --dimensions=1024 --metric=cosine

# 2. Populate the index from the KB (chunk -> bge-m3 embed -> upsert + prune).
#    Requires an API token (Cloudflare dashboard > My Profile > API Tokens).
#    CLOUDFLARE_API_TOKEN works; the wrangler OAuth token only authorizes some endpoints.
pnpm chat:populate        # from the repo root
#    Preview without touching the index:
pnpm exec --filter ramirocerda-chat-worker populate -- --dry-run
```

Population writes `vectorize-manifest.json` (committed): the chunk-ID baseline used
to prune stale vectors on the next run. Re-run `pnpm chat:populate` after any KB change.

## Secret (step 2.6 — requires the real OpenCode Go key, run manually)

```bash
wrangler secret put OPENCODE_GO_API_KEY
# paste the OpenCode Go API key at the prompt. It is stored encrypted in
# Cloudflare and never appears in the repo. Production reads it from the
# environment; local dev reads it from workers/chat-worker/.dev.vars (gitignored).
```

## Deploy sequence (order matters)

1. Set the secret (below) and populate the index (above) BEFORE the first deploy.
2. `wrangler deploy` — committed config ships with `RAG_ENABLED="true"`; the RAG
   pipeline is the only path since the legacy static-KB + llama branch was
   removed (commit "chore(chat-worker): remove legacy kb path").
3. `RAG_ENABLED` is now a **vestigial flag**: kept in config while its removal
   is a documented follow-up; it no longer switches behavior. If it is ever
   flipped, the pipeline still runs the RAG path. Rollback to the pre-cleanup
   state is a git revert of the removal commit, not a flag flip.

## Local probes

```bash
wrangler dev --remote --port 8787        # remote mode: real AI + Vectorize bindings
```

### RAG path (RAG_ENABLED=true, after secret set)

| Probe (AE) | Command body (`message`) | Expected |
|------------|--------------------------|----------|
| AE3 EN | `"What is the capital of France?"` | `200` EN no-info fallback, no LLM call (verified) |
| AE3 ES | `"¿Cuál es el sentido de la vida?"` | `200` ES no-info fallback (verified at threshold 0.30 only when retrieval scores < threshold; weak-match cases fall back via prompt rule 4) |
| AE4 | `"¿Dónde trabajás?"` | `200` answer grounded in the retrieved chunk |
| AE1 | `"What projects has Ramiro built?"` | `200` answer in English |
| AE2 | `"¿Qué proyectos hizo Ramiro?"` | `200` rioplatense voseo Spanish |
| R6 | 12-turn `history` array + a question | only the last 10 turns injected (unit-tested; log shows `history_turns: 12`) |
| R7 | GET / bad origin / empty message / preflight | `405` / `403` / `400` / `204` — same gate code as legacy |
| R7 429 | generation endpoint throttled | `429` `RATE_LIMITED` (unit-tested; needs real key to trigger) |
| R7 500 | invalid/absent API key | `500` `MODEL_ERROR` (verified with placeholder key) |

### Threshold tuning (task 3.4 — data gathered 2026-08-13)

`SIMILARITY_THRESHOLD` defaults to `0.30` (design D3). Empirical cosine scores:

- Noise queries (should be rejected): max top-score **0.405** ("Tell me a joke"),
  others 0.28–0.37. At 0.30, 7/8 noise probes pass the gate.
- Relevant queries (should pass): min top-score **0.441** ("¿Qué proyectos hizo
  Ramiro?"), most 0.48–0.57. Project chunks score 0.38–0.45.

There is **no clean global threshold**: raising to ~0.42 rejects all sampled noise
but also drops the project chunks (0.38–0.45) that answer AE1/AE2. Recommended:
keep `0.30` and rely on the prompt-level no-info rule (secondary layer) for
weak-match cases; if verify with the real model shows AE3 misfires, raise toward
`0.40`–`0.42` and accept weaker project-list recall, or revisit topK/chunking.
