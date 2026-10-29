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
pnpm dlx wrangler vectorize create botardo-kb --dimensions=1024 --metric=cosine

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
`ANALYTICS`, dataset `ramirocerda_chat_ANALYTICS`, see `writeUsage` in
`src/index.ts`). The binding is declared under `analytics_engine_datasets` in
`wrangler.jsonc`; until this fix it sat under an invalid `analytics_engine` key
(wrangler warned "Unexpected fields" and never bound it), so no data points
were written before the first deploy that includes the fix. The dataset name
is pinned in `wrangler.jsonc` and must equal `DATASET` in
`scripts/chat-stats.mjs` (a test checks it):

- `blob1` language, `blob2` status (`ok` / `rate_limited` / `model_error`),
  `blob3` first 80 chars of the question, `blob4` which decision model
  answered the router (`free` / `paid` / `none`; empty on older rows).
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
heuristics). Routing and the sufficiency check are decided by **Jev**
(TypeSafe's System One decision model) served by OpenCode at
`https://opencode.ai/inference/systemone/v1/systemone` (`src/decision.ts`).
The code validates every answer and enforces the limits.

### Decision API (System One, not OpenAI-compatible)

Request (`POST`, `Content-Type: application/json`):

```json
{
  "model": "jev-1.13-free",
  "state": { "conversation": [{ "role": "user", "content": "..." }], "latest_message": "..." },
  "questions": {
    "route": { "type": "choice", "instructions": "...", "criteria": { "search": "...", "smalltalk": "...", "off_topic": "..." } },
    "hire_intent": { "type": "noul", "instructions": "..." }
  }
}
```

Response:

```json
{
  "model": "jev-1.13-free",
  "answers": {
    "route": { "type": "choice", "choice": "search", "confidence": 0.82, "probabilities": { "search": 0.82 } },
    "hire_intent": { "type": "noul", "noul": 0.98 }
  },
  "usage": { "input_tokens": 558, "output_tokens": 3 }
}
```

- `choice` picks one of the `criteria` keys and returns a confidence; `noul`
  returns a probability in 0..1. Jev does **not** generate text, so there is no
  `messages`, `max_tokens`, `temperature` or `response_format`, and it cannot
  write a rewritten query (see below).
- Auth: the primary call (`DECISION_MODEL`, `jev-1.13-free`) is ALWAYS
  anonymous (verified: no key returns 200 with
  `usage.opencode.billing_source: "free"`; an invalid key returns 401). Only
  the paid fallback sends `Authorization: Bearer <OPENCODE_GO_API_KEY>`, the
  same secret Botardo already uses for generation (no new secret). The
  OpenCode docs say to use a Console API key on this endpoint; the Go docs
  say the Go key is copied from the Console too, and nothing in the docs or
  the OpenCode source says System One rejects it. **Not tested with the real
  key.** Jev is not in the Go model list, so the paid call is expected to bill
  the Console pay-as-you-go balance, and the billing docs say paid requests
  fail with `402` once that balance is zero.
- `DECISION_INTEGRATION_ID` (`opencode`) is OpenCode's client-side credential
  integration id. It is not a header or body field of the request; the worker
  only logs it.
- Errors (probed without a key): 400 `{"detail": ...}` for bad requests, 401
  for an invalid key, 401 `AuthError "Missing API key."` for `jev-1.13`
  without a key, and 400 `server_error "Upstream request failed: Model is
  unavailable."` for an unknown model (what a retired free model would get).
  Any non-2xx, timeout, network error, non-JSON body or answer that does not
  match its question (unknown choice, out-of-range number, missing answer) is a
  failure.

### Free then paid fallback

Applies to every decision request (router and judge), in `askDecision`:

1. Attempt 1: `DECISION_MODEL` (`jev-1.13-free`), no `Authorization` header.
2. If attempt 1 fails for ANY reason above, ONE retry with
   `model = DECISION_FALLBACK_MODEL` (`jev-1.13`) and
   `Authorization: Bearer <OPENCODE_GO_API_KEY>`, same `state` and `questions`.
   Skipped when `OPENCODE_GO_API_KEY` is unset or `DECISION_FALLBACK_MODEL` is
   `""`. No further retries.
3. If the retry also fails (or was skipped), the existing safe default:
   router searches the raw message with `offerContact: false`; judge keeps the
   first results.

Paid slug evidence (`jev-1.13`): OpenCode docs model table
(`opencode.ai/docs/zen`, source `console/models.mdx`: "Jev 1.13 | `jev-1.13` |
`https://opencode.ai/inference/systemone/v1/systemone`" and "Use
`jev-1.13-free` instead of `jev-1.13` to use the limited-time free model"), the
OpenCode console itself (`enterprise-spam.ts` calls this endpoint with
`jev-1.13`), and a live probe without a key: `jev-1.13` answers 401
"Missing API key." while an unknown model answers 400 "Model is unavailable".
The paid call itself was NOT exercised (no real key on the build box). If the
key is refused, `chat.route` / `chat.rag_judge` show `fallback: "failed"`,
`model_tier: "none"`, `primary_error` with the free failure and `via` /
`reason` with the paid failure (`http_401` for a rejected key, `http_402` for
an empty balance); set `DECISION_FALLBACK_MODEL=""` to stop retrying.

Latency budget: `DECISION_TIMEOUT_MS` (1500) is per attempt. Worst case per
step is 2 attempts = 3 s; a `search` message has 2 steps (router + judge), so
the worst-case decision time is 4 x 1.5 s = 6 s, on top of up to 2 embeddings,
2 Vectorize queries and 1 generation. Without `OPENCODE_GO_API_KEY` it stays at
2 x 1.5 s = 3 s. The measured free p95 is about 0.36 s, so the timeout is only
hit when the free model is degraded.

### Flow

1. **Router** (`src/router.ts`): ONE request per message with `route`
   (choice: search / smalltalk / off_topic), `hire_intent` (noul) and, only
   when there is history, `needs_history` (noul). Any failure falls back to
   `search`, `hire_intent=false` and the raw message as query. A
   smalltalk/off_topic route with confidence below `DECISION_MIN_CONFIDENCE`
   is searched instead (skipping the KB is the risky direction).
   - `off_topic`: fixed localized reply. No retrieval, no generation.
   - `smalltalk`: one short generation (identity prompt + a smalltalk
     instruction, no KB facts). No retrieval.
   - `search`: retrieval with the raw message, or, when `needs_history >= 0.5`,
     with the previous user turn + the message (composed in code, max 300
     chars). The answer is always generated for the ORIGINAL message + history.
2. **Retrieval with sufficiency judge** (`src/retrieval.ts`): when there is an
   alternate query (the other of raw / contextual), one request asks
   `sufficient` (noul) over the question and the retrieved chunks. The judge
   sees each chunk's whole text (`JUDGE_SNIPPET_CHARS`, a 4000-char safety cap,
   above the largest chunk in the base): with a 350-char window it answered
   "insufficient" on correct retrievals whose fact sat further down, which then
   triggered a re-search whose max-4 merge could evict the good chunk. If it is
   below 0.5, the worker searches once more with the alternate query and merges
   by chunk id keeping the best score. Without an alternate query (first turn)
   the judge is not called. Hard cap of 2 retrievals, enforced in code
   (`MAX_RETRIEVAL_ITERATIONS`, clamped to 2; `1` disables the judge). A judge
   failure keeps the first results. The similarity gate still decides the
   no-info reply.
3. **`offerContact`**: `hire_intent >= 0.5` is returned on EVERY 200 reply as
   `AskResponse.offerContact` (false when unknown: decision model off, router
   error, or before the router ran) and logged. Contract with the widget in
   PR #21. 429/500 error bodies are unchanged.

With `DECISION_MODEL=""` the router and the judge are skipped: the worker
searches the raw message once and applies the score gate, exactly like the
linear pipeline, and `offerContact` is always false.

Max calls per message (each Jev step counts 1, or 2 when the paid fallback
runs): `search` 1 router + at most 1 judge (Jev) + up to 2
embeddings + up to 2 Vectorize queries + up to 1 generation; `smalltalk` 1
router + 1 generation; `off_topic` 1 router.

Config (vars in `wrangler.jsonc`, defaults in `src/config.ts`):

| Name | Kind | Default | Notes |
| --- | --- | --- | --- |
| `DECISION_ENDPOINT` | var | `https://opencode.ai/inference/systemone/v1/systemone` | `""` turns adaptive off |
| `DECISION_MODEL` | var | `jev-1.13-free` | primary, anonymous; `""` turns adaptive off |
| `DECISION_FALLBACK_MODEL` | var | `jev-1.13` | paid retry with Bearer `OPENCODE_GO_API_KEY`; `""` disables the retry |
| `DECISION_INTEGRATION_ID` | var | `opencode` | not sent; logged on `chat.route` |
| `DECISION_TIMEOUT_MS` | var | `1500` | per attempt (worst case 6 s total, see above) |
| `DECISION_MIN_CONFIDENCE` | var | `0.5` | min confidence to skip the KB |
| `ADAPTIVE_RAG` | var | `1` | feature flag for the whole adaptive path (router, judge, rewrite, re-search); `0`/`false`/`off` runs the pre-adaptive behaviour (one search with the raw message, no decision call) |
| `DECISION_FREE_COOLDOWN_MS` | var | `900000` | after the free tier answers 429, skip it for this long (15 min); `0` never skips |
| `DECISION_FREE_DISABLED` | var | unset | `1`/`true` never calls the anonymous tier (needs a paid path); per-isolate breaker |
| `MAX_RETRIEVAL_ITERATIONS` | var | `2` | clamped to 1..2 |
| `OPENCODE_GO_API_KEY` | secret (existing) | | generation key; also sent as Bearer on the paid Jev fallback only, never on the free call |

Removed: every `OPENROUTER_*` var and the `OPENROUTER_API_KEY` secret (if it
was ever set: `pnpm dlx wrangler secret delete OPENROUTER_API_KEY`), plus the older
`ROUTER_MODEL`, `REWRITE_MODEL`, `ROUTER_LLM_ENABLED`, `ROUTER_TIMEOUT_MS`,
`REWRITE_TIMEOUT_MS`, `SUFFICIENCY_MIN_TOP_SCORE`, `SUFFICIENCY_MIN_CHUNKS`.
`max_tokens`, `response_format` and reasoning effort have no equivalent in
System One, so they are gone rather than renamed.

Risks: `jev-1.13-free` is a free, time-limited OpenCode model (it can be
withdrawn or rate limited; the paid fallback, if the key is set, or else the
safe default keeps the worker answering; each paid call is billed to the
Console account), and
free-tier traffic may be used by the provider, so only the visitor message,
the last 4 turns and short KB snippets are sent.

Log events: `chat.route` (route, via, `model_tier` free | paid | none, model
that answered, `primary_error` when the free call failed, `fallback`
not_needed | used | failed | skipped_no_key | skipped_no_model | free_skipped | off,
integration, route_confidence, hire_intent_p, needs_history_p, hire_intent,
offer_contact, rewritten), `chat.rag_judge` (verdict, p or reason,
`model_tier`, `primary_error`, `fallback`), `chat.rag_retrieved` (chunk_count,
latency_ms, iterations, and `queries`: the literal search strings in order, so a
miss can be told apart from a bad rewrite), `chat.rag_no_context`,
`chat.ai_done`.

Free-tier breaker: once the anonymous model answers 429, the isolate stops
calling it for `DECISION_FREE_COOLDOWN_MS` and goes straight to the paid
attempt, which is logged as `fallback: "free_skipped"`. Without it every router
and judge call pays a wasted anonymous round trip. The state is per isolate and
in memory: a cold start begins closed, which costs at most one wasted request.

### Evals (linear vs adaptive, by stage)

`evals/cases.json` holds 54 fixed cases (ES/EN: smalltalk, KB questions,
follow-ups with history, off-topic, hire intent and 10 unanswerable ones), each
with the expected route and expected `offerContact`. Unanswerable cases carry
`unanswerableKind`: `near_miss` (the KB has the relevant doc, listed in
`expectedChunks`, but not the fact asked: team size at LDP, predictor accuracy,
World Cup app users, final degree project) or `out_of_kb` (rate, kids, movie,
age, football team, phone). Those labels were checked against the indexed KB
(`scripts/knowledge-base.js` + notes via `kb-sources.json`), and
`evals/judge-fixtures.test.mjs` asserts every `expectedChunks` prefix exists in
it. The runner compares the frozen linear pipeline (`evals/linear-pipeline.ts`,
main before adaptive RAG, same behaviour as the adaptive pipeline with
`DECISION_MODEL=""`) against the adaptive one in the same report, split by stage:

| Stage | What it measures | How |
| --- | --- | --- |
| Router | route, `offerContact`, fallbacks, latency | Jev router answers vs case labels |
| 1. Retrieval | recall of expected chunks, hit (at least one), expected fact in the reply | chunk-id prefixes, substring facts |
| 2. Sufficiency (adaptive) | judge verdicts, agreement with `answerable`, re-search rate | the existing Jev sufficiency judge (`src/retrieval.ts`) |
| 3. Faithfulness | % of generated answers with at least one unsupported claim, plus per-claim detail in the JSON | claims extracted by the generation model, each judged by Jev `noul` against the chunks actually passed to generation |
| 4. Abstention | correct abstention on `answerable=false` (all, `near_miss`, out of KB), false abstention on `answerable=true` | canned `no_info` / `off_topic` replies count as abstentions; generated replies are judged by Jev `choice` (`abstains` / `answers`) |

Judges (`evals/stage-judges.ts`), no regex or keyword routing:

- Claim extraction needs a text model (Jev only answers typed questions): it
  goes through Botardo's own generation client (`OPENCODE_GO_ENDPOINT`,
  `OPENCODE_GO_API_KEY`, model `EVAL_JUDGE_MODEL` or `GENERATION_MODEL`,
  temperature 0) and returns atomic claims about Ramiro. Greetings, offers,
  statements about Botardo and "I don't have that" are not claims.
- Claim support: one Jev `noul` per claim, state `{ snippets, claim }` with the
  full text of the chunks passed to generation; `p >= 0.5` is supported. With no
  chunks (smalltalk) nothing can support a claim, so any claim fails without a
  call. Facts that only come from `IDENTITY_PROMPT` count as unsupported on purpose.
- Abstention: Jev `choice` over `{ question, reply }`.
- Jev runs as `jev-1.13-free` without a key, then one paid `jev-1.13` retry with
  `OPENCODE_GO_API_KEY` when there is one. The judge config is independent of
  `DECISION_MODEL` (override with `EVAL_JEV_MODEL`, `EVAL_JEV_ENDPOINT`,
  `EVAL_JEV_FALLBACK_MODEL`, `EVAL_JEV_TIMEOUT_MS`, default 10000 ms), so the
  "before" and "after" runs are graded by the same judges. Judge calls are not
  counted as pipeline cost.

```bash
# Full before/after with every stage (needs CF + OpenCode Go credentials, read-only):
CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... OPENCODE_GO_API_KEY=... pnpm chat:eval
# Optional cross-check: the adaptive pipeline with the decision model off must match the linear column
DECISION_MODEL= pnpm --filter ramirocerda-chat-worker eval -- --pipelines adaptive
pnpm --filter ramirocerda-chat-worker eval -- --no-judge     # skip faithfulness (the only judge that spends generation tokens)

# No credentials:
pnpm --filter ramirocerda-chat-worker eval:judges            # REAL Jev judges on FIXTURES (judge-fixtures.json), validates the judges
pnpm --filter ramirocerda-chat-worker eval:decision          # REAL Jev router, stubbed KB/generation
pnpm --filter ramirocerda-chat-worker eval:offline           # MOCKED decision model, call counts only
```

Real mode needs `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Workers AI +
Vectorize read) and `OPENCODE_GO_API_KEY` (generation, claim extraction and the
paid Jev fallback), taken from the environment or the gitignored root `.env` and
`.dev.vars`. `DECISION_*` env vars override the `wrangler.jsonc` values. It only
calls `ai/run`, the Vectorize `query` endpoint (no writes), the System One
endpoint and the generation endpoint. The stage judges only run in real mode:
in decision and offline modes the replies are stubs, so retrieval, sufficiency,
faithfulness and abstention rows read `pending`. Decision mode calls the real Jev
endpoint (anonymous) with no-match Vectorize and stubbed generation: route,
`offerContact`, fallbacks, router latency and decision tokens are real. Offline
mode replaces Jev with an oracle mock: only call counts are meaningful.
`eval:judges` needs no credential at all (the paid retry only if
`OPENCODE_GO_API_KEY` is already exported): its numbers are judge agreement on
hand-written fixtures over verbatim KB excerpts, labeled FIXTURE, never Botardo
quality. Results are written to `evals/results/` (gitignored).

## Secret (step 2.6 — requires the real OpenCode Go key, run manually)

```bash
pnpm dlx wrangler secret put OPENCODE_GO_API_KEY
# paste the OpenCode Go API key at the prompt. It is stored encrypted in
# Cloudflare and never appears in the repo. Production reads it from the
# environment; local dev reads it from workers/chat-worker/.dev.vars (gitignored).
```

## Deploy sequence (order matters)

1. Set the secret (below) and populate the index (above) BEFORE the first deploy.
2. `pnpm dlx wrangler deploy` — committed config ships with `RAG_ENABLED="true"`; the RAG
   pipeline is the only path since the legacy static-KB + llama branch was
   removed (commit "chore(chat-worker): remove legacy kb path").
3. `RAG_ENABLED` is now a **vestigial flag**: kept in config while its removal
   is a documented follow-up; it no longer switches behavior. If it is ever
   flipped, the pipeline still runs the RAG path. Rollback to the pre-cleanup
   state is a git revert of the removal commit, not a flag flip.

## Local probes

wrangler is not a dependency of this repo: use `pnpm dlx wrangler` (or a global
install). Every `wrangler dev` needs Cloudflare auth first (`pnpm dlx wrangler
login`, or `CLOUDFLARE_API_TOKEN` in a non-interactive shell), because:

- `env.AI` always runs remotely (Workers AI has no local emulation);
- `env.VECTORIZE` is "not supported" in local mode unless the binding is remote.

So the documented mode is `--remote` (whole worker on Cloudflare's preview,
real AI + Vectorize). Plain `wrangler dev` (local workerd) also needs the
login for AI and has no Vectorize, so retrieval cannot work there. Copy
`.dev.vars.example` to `.dev.vars` and fill `OPENCODE_GO_API_KEY` first
(without it `/ask` answers 500 `MODEL_ERROR`).

```bash
cd workers/chat-worker
cp .dev.vars.example .dev.vars            # then fill OPENCODE_GO_API_KEY
pnpm dlx wrangler login                   # once per machine
pnpm dlx wrangler dev --remote --port 8787
```

The worker only answers allowed origins (`ALLOWED_ORIGINS` in `src/index.ts`).
`curl` sends no `Origin` header, so without one every request is `403`. Use the
local site origin:

```bash
curl -s http://localhost:8787/ask \
  -H 'Origin: http://localhost:4321' -H 'Content-Type: application/json' \
  -d '{"message":"¿Dónde trabaja Ramiro?","sessionId":"local-1"}'
# 200 {"reply":"...","offerContact":false}
# follow-up: add "history":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]
```

Each request logs JSON lines in the wrangler terminal: `chat.route` (route,
via, model_tier, fallback, primary_error, hire_intent, offer_contact),
`chat.rag_judge`, `chat.rag_retrieved`, `chat.ai_done`.

Local Analytics Engine writes are discarded (no `remote: true` on the
binding), so `pnpm chat:stats` only shows deployed traffic.

### Testing the widget against the local worker

The site calls the deployed worker by default. To point the widget at a local
worker, run the site with the override (CORS already allows `http://localhost:4321`,
the `astro dev` default port; another port is rejected with `403`):

```bash
cd workers/chat-worker && pnpm dlx wrangler dev --remote --port 8787   # terminal 1
PUBLIC_BOTARDO_WORKER_URL=http://localhost:8787 pnpm dev               # terminal 2, repo root
```

`PUBLIC_BOTARDO_WORKER_URL` can also live in the root `.env` (see `.env.example`).

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
