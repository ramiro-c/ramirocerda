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

## Leads and funnel events (D1 + Turnstile + Resend)

`POST /lead` stores contact form leads; `POST /event` stores first party funnel
events (`visit`, `cta_click`; `lead_submitted` is written by `/lead`). Both share
CORS and `CHAT_RATE_LIMITER` with `/ask` (keys `lead:<ip>` and `event:<ip>`).
All free tier: D1 (5 GB, 100k writes/day), Turnstile (free), Resend (3,000
emails/month, 100/day).

Safe by default: until the D1 binding exists, `/lead` answers 503 (the site
shows the email fallback) and `/event` answers 204 without storing anything.

One time setup, in this order:

```bash
cd workers/chat-worker

# 1. D1 database. Copy the printed database_id.
pnpm exec wrangler d1 create ramirocerda-leads
# 2. Uncomment "d1_databases" in wrangler.jsonc (binding LEADS_DB) and paste the id.
# 3. Create the tables (migrations/0001_create_leads.sql, 0002_create_events.sql).
pnpm exec wrangler d1 migrations apply ramirocerda-leads --remote

# 4. Turnstile: Cloudflare dashboard > Turnstile > Add widget, hostnames
#    ramirocerda.com.ar (+ www, + the Vercel preview host if wanted), mode Managed.
#    Site key (public)  -> Vercel env PUBLIC_TURNSTILE_SITE_KEY (Production + Preview).
#    Secret key         -> worker secret:
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY

# 5. Resend: create an API key (Sending access) and store it.
pnpm exec wrangler secret put RESEND_API_KEY
#    LEAD_FROM defaults to onboarding@resend.dev, which only delivers to the
#    Resend account owner. To send from your own domain (and to enable the
#    visitor confirmation), verify ramirocerda.com.ar in Resend (DNS records),
#    then set LEAD_FROM="Ramiro Cerdá <contacto@ramirocerda.com.ar>" and
#    LEAD_CONFIRMATION_ENABLED="true" in wrangler.jsonc.

# 6. Deploy the worker, then redeploy the site (Vercel picks up the new env var).
pnpm exec wrangler deploy
```

Vars (wrangler.jsonc): `LEAD_NOTIFY_TO`, `LEAD_FROM`, `LEAD_CONFIRMATION_ENABLED`.
Secrets: `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`. Site env (Vercel, public):
`PUBLIC_TURNSTILE_SITE_KEY`, optional `PUBLIC_CAL_URL`, optional
`PUBLIC_WHATSAPP_URL` (empty hides the WhatsApp link).

Local dev: `.dev.vars` (gitignored) can hold Cloudflare's test secret
`1x0000000000000000000000000000000AA` (always passes); `astro dev` uses the
matching test site key automatically. Use `wrangler d1 migrations apply
ramirocerda-leads --local` for a local database.

### Funnel queries

```bash
pnpm exec wrangler d1 execute ramirocerda-leads --remote --file=queries/funnel.sql
```

Prints clicks per CTA and placement, leads per origin (form vs botardo),
conversion new vs returning visitors, and primary CTA click through per
placement, for the last 30 days. Read latest leads:

```bash
pnpm exec wrangler d1 execute ramirocerda-leads --remote \
  --command "SELECT created_at, origin, name, email FROM leads ORDER BY created_at DESC LIMIT 20"
```

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
