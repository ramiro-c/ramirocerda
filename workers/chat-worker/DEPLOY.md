# Botardo chat worker — operations runbook

Real RAG + OpenCode Go generation (SDD change `botardo-rag-opencode-go`).

## Prerequisites

- Cloudflare account with Vectorize + Workers AI enabled (free tier OK).
- `wrangler` available (`pnpm dlx wrangler` works from this directory) and authenticated (`wrangler login`).
- Active OpenCode Go subscription with an API key. **The key is a Worker secret — it must never be committed to the repo.**
- **Credentials live in the gitignored root `.env`** (`CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`) and `workers/chat-worker/.dev.vars` (OpenCode Go key).
  `pnpm chat:populate` auto-loads the root `.env`, so no credential input is
  needed to run it — never share, print, or commit these files.

## One-time setup (already done on 2026-08-13)

```bash
# 1. Create the Vectorize index. IMMUTABLE: dimensions/metric cannot change later.
wrangler vectorize create botardo-kb --dimensions=1024 --metric=cosine

# 2. Populate the index from the KB (chunk -> bge-m3 embed -> upsert + prune).
#    Credentials come from the gitignored root `.env` (auto-loaded) — nothing to export.
pnpm chat:populate        # from the repo root
#    Preview without touching the index:
pnpm exec --filter ramirocerda-chat-worker populate -- --dry-run
```

Population writes `vectorize-manifest.json` (committed): the chunk-ID baseline used
to prune stale vectors on the next run. Re-run `pnpm chat:populate` after any KB change.

## Automatic population (CI)

`.github/workflows/chat-populate.yml` runs on every push to `main` that touches
KB content (`src/content/**`, `workers/chat-worker/scripts/**`,
`kb-sources.json`, the manifest, or the workflow itself):

1. `--check` asserts the committed manifest matches the current sources (fails fast, no network).
2. `pnpm chat:populate` equivalent (bare node) embeds + upserts + prunes.
3. If the manifest changed, a bot commit `chore(chat-worker): sync vectorize manifest [skip ci]` pushes it back.

Requires the repo secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`
(same token as the root `.env`). New note content only needs to be committed to
`src/content/notes/` — population is automatic.

Notes whose front matter sets `draft: true` are skipped: the index only holds
notes a visitor can open. A note that becomes a draft again has its vectors
pruned on the next populate run.

## Usage observability

The worker writes one Analytics Engine data point per question (binding
`ANALYTICS`, see `writeUsage` in `src/index.ts`):

- `blob1` language, `blob2` status (`ok` / `rate_limited` / `model_error`),
  `blob3` first 80 chars of the question.
- `double1` chunk count, `double2` top similarity score, `double3` retrieval ms,
  `double4` generation ms; `index1` conversation session id.
- Appended by adaptive RAG (append-only; older rows read them as 0): `double5`
  route code (0 `search`, 1 `smalltalk`, 2 `off_topic`), `double6` retrieval
  iterations (0 to 2), `double7` query rewritten by the router (0/1), `double8`
  router ms, `double9` offerContact (0/1), `double10` router status (0 LLM
  decision, 1 fallback after an error, 2 not configured), `double11` judge
  verdict (0 skipped, 1 sufficient, 2 insufficient, 3 error), `double12` judge ms.

Inspect with (credentials auto-loaded from the root `.env`):

```bash
pnpm chat:stats                 # questions/day, lang/status split, no-info rate, conversations, invocations
pnpm chat:stats -- --sql "SELECT toDate(timestamp) AS day, blob3 FROM events.analyticsEngine.ramirocerda_chat_ANALYTICS WHERE timestamp >= NOW() - INTERVAL '30' DAY ORDER BY timestamp DESC LIMIT 20"
```

Queries go to the **unified Analytics SQL API** (`POST /client/v4/analytics/sql`)
with the dataset addressed as `events.analyticsEngine.<dataset>`, using the
`Account | Account Analytics | Read` permission. The legacy Workers Analytics
Engine endpoint (`POST /accounts/<id>/analytics_engine/sql`) currently answers
HTTP 403 `Authorization error` for this account even with a valid token — a
platform-side issue, not a token problem, so do not re-create tokens over it.

Three quirks of that API worth knowing before writing your own `--sql`:

- Every statement needs a **lower time bound** (`WHERE timestamp >= ...`); the
  API rejects unbounded reads with HTTP 422.
- An **unknown dataset returns 0 rows silently** instead of failing, so "no rows"
  never proves the dataset is empty. The invocations section (GraphQL, also
  `Account Analytics Read`) is the independent cross-check.
- The dialect is **DataFusion, not ClickHouse**: `COUNT(DISTINCT x)` works, but
  ClickHouse-only forms such as `uniq(x)` or `sum(x = 0)` fail with HTTP 422 —
  use `sum(CASE WHEN x = 0 THEN 1 ELSE 0 END)`.

Data is sampled/retained per AE policy (~90 days).

## Adaptive RAG

Each message goes through a code-driven flow (no agent loop, no keyword
heuristics). Routing, query rewrite and the sufficiency check are decided by an
LLM through OpenRouter (`https://openrouter.ai/api/v1/chat/completions`,
`src/openrouter.ts`); the code only validates its JSON and enforces the limits.

1. **Router** (`src/router.ts`): ONE OpenRouter call per message returns
   `{"route": "search" | "smalltalk" | "off_topic", "hire_intent": boolean, "query": "standalone query"}`
   (temperature 0, `response_format` json_schema, low `max_tokens`, timeout).
   The output is validated strictly; any error (timeout, HTTP error, invalid
   JSON, unknown label, wrong types) falls back to `search`, `hire_intent=false`
   and the raw message as query.
   - `off_topic`: fixed localized reply. No retrieval, no generation.
   - `smalltalk`: one short generation (identity prompt + a smalltalk
     instruction, no KB facts). No retrieval.
   - `search`: retrieval with the router's standalone `query` (which already
     resolves follow-ups with the history); the answer is generated for the
     ORIGINAL message.
2. **Retrieval with sufficiency judge** (`src/retrieval.ts`): after the first
   search, one OpenRouter call returns `{"sufficient": boolean, "reformulated_query": string}`.
   If insufficient, the worker searches once more with `reformulated_query` and
   merges by chunk id keeping the best score. Hard cap of 2 retrievals, enforced
   in code (`MAX_RETRIEVAL_ITERATIONS`, clamped to 2; `1` disables the judge).
   A judge failure keeps the first results. The similarity gate still decides
   the no-info reply.
3. **`offerContact`**: the router's `hire_intent` is returned on EVERY 200 reply
   as `AskResponse.offerContact` (false when unknown: not configured, router
   error, or before the router ran) and logged. Contract with the widget in
   PR #21. 429/500 error bodies are unchanged.

Without `OPENROUTER_API_KEY` or `OPENROUTER_MODEL` the router and the judge are
skipped: the worker searches the raw message once and applies the score gate,
exactly like the linear pipeline, and `offerContact` is always false.

Max calls per message: `search` 1 router + 1 judge (OpenRouter) + up to 2
embeddings + up to 2 Vectorize queries + up to 1 generation; `smalltalk` 1
router + 1 generation; `off_topic` 1 router.

Config:

- Secret `OPENROUTER_API_KEY`: `wrangler secret put OPENROUTER_API_KEY`
  (local dev: `workers/chat-worker/.dev.vars`).
- Var `OPENROUTER_MODEL`: OpenRouter model slug. Intentionally EMPTY in
  `wrangler.jsonc` (no guessed default): adaptive routing is off until it is set.
  The model must support `response_format` json_schema (or set
  `OPENROUTER_RESPONSE_FORMAT`).
- Optional vars (defaults in `src/config.ts`): `OPENROUTER_TIMEOUT_MS` (2500),
  `OPENROUTER_MAX_TOKENS` (256), `OPENROUTER_RESPONSE_FORMAT` (`json_schema`,
  `json_object` or `none`), `OPENROUTER_REASONING_EFFORT` (empty; for reasoning
  models, e.g. `minimal`, so reasoning does not eat `max_tokens`),
  `OPENROUTER_ENDPOINT`, `MAX_RETRIEVAL_ITERATIONS` (2).
- Removed: `ROUTER_MODEL`, `REWRITE_MODEL`, `ROUTER_LLM_ENABLED`,
  `ROUTER_TIMEOUT_MS`, `REWRITE_TIMEOUT_MS`, `SUFFICIENCY_MIN_TOP_SCORE`,
  `SUFFICIENCY_MIN_CHUNKS` (and the llama-3.2-3b Workers AI fallback).

Log events: `chat.route` (route, via, hire_intent, offer_contact, rewritten),
`chat.rag_judge`, `chat.rag_retrieved`, `chat.rag_no_context`, `chat.ai_done`.

### Evals (linear vs adaptive)

`evals/cases.json` holds 48 fixed cases (ES/EN: smalltalk, KB questions,
follow-ups with history, off-topic, unanswerable, hire intent), each with the
expected route and expected `offerContact`. The runner compares the frozen
linear pipeline (`evals/linear-pipeline.ts`, main before adaptive RAG) against
the adaptive one and prints a markdown table, including routing accuracy,
`offerContact` (hire_intent) accuracy and router fallback rate.

```bash
OPENROUTER_MODEL=<slug> pnpm chat:eval                      # real backends, read-only
pnpm --filter ramirocerda-chat-worker eval:offline          # MOCKED OpenRouter, call counts only
pnpm --filter ramirocerda-chat-worker eval -- --no-judge    # skip the faithfulness judge
```

Real mode needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Workers AI +
Vectorize read), `OPENCODE_GO_API_KEY`, `OPENROUTER_API_KEY` and
`OPENROUTER_MODEL`, taken from the environment or the gitignored root `.env`
and `.dev.vars`. It only calls `ai/run`, the Vectorize `query` endpoint (no
writes), OpenRouter and the generation endpoint. Offline mode replaces
OpenRouter with an oracle mock that echoes the expected labels: its routing
numbers say nothing about router quality, only call counts are meaningful.
Results are written to `evals/results/` (gitignored).

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

### Testing the widget against the local worker

The site calls the deployed worker by default. To point the widget at a local
worker, run the site with the override (CORS already allows `http://localhost:4321`):

```bash
cd workers/chat-worker && wrangler dev --remote --port 8787   # terminal 1
PUBLIC_BOTARDO_WORKER_URL=http://localhost:8787 pnpm dev      # terminal 2, repo root
```

Note the widget still reads `url` / `urlAlt` from Vectorize metadata, so note
links only appear after `pnpm chat:populate` pushes the new metadata.

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
