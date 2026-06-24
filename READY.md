# Chat Island — Deployment Instructions

## Overview

The Chat Island feature adds a floating chat widget to the portfolio site. A Cloudflare Worker with Workers AI answers questions about the professional profile.

## Files Changed

| File | Action |
|------|--------|
| `knowledge-base.md` | Created — curated professional profile |
| `workers/chat-worker/wrangler.jsonc` | Created — Worker config |
| `workers/chat-worker/src/knowledge-base.ts` | Created — KB embedded as TS const |
| `workers/chat-worker/src/index.ts` | Created — POST /ask handler |
| `index.html` | Modified — injected chat CSS, HTML, JS |

## Step 1: Deploy the Worker

```bash
# Navigate to the Worker directory
cd workers/chat-worker

# Deploy to Cloudflare
npx wrangler deploy

# Note the deployed URL (e.g., https://ramirocerda-chat.ramirocerda.workers.dev)
```

## Step 2: Update the Worker URL in index.html

If the Worker URL differs from the default, edit the `WORKER_URL` constant in `index.html`:

```js
const WORKER_URL = "https://ramirocerda-chat.ramirocerda.workers.dev";
```

Search for `WORKER_URL` in the chat JS section near the end of the file.

## Step 3: Test the Worker

```bash
# Test with a professional question
curl -X POST https://ramirocerda-chat.ramirocerda.workers.dev/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuál es tu experiencia con React?"}'

# Expected: 200 with { "reply": "..." } in Spanish

# Test non-professional question (should decline)
curl -X POST https://ramirocerda-chat.ramirocerda.workers.dev/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "¿Cuál es tu opinión política?"}'

# Expected: 200 with polite decline in Spanish

# Test English question (should reply in Spanish)
curl -X POST https://ramirocerda-chat.ramirocerda.workers.dev/ask \
  -H "Content-Type: application/json" \
  -d '{"message": "What technologies do you use?"}'

# Expected: 200 with Spanish reply
```

## Step 4: Test in Browser

Open `index.html` in your browser and verify:

1. **Floating island** — visible bottom-right, pulses animation
2. **Open modal** — click the island, modal slides up
3. **Close modal** — click ✕, modal closes, island reappears
4. **Send message** — type a question and press Enter or click Send
5. **Loading state** — typing indicator shows during request
6. **Receive reply** — assistant bubble appears in Spanish
7. **Empty input** — click Send with empty input, input shakes
8. **Error state** — if Worker is unreachable, error with "Reintentar" shows
9. **Mobile responsive** — modal goes full-width on small screens
10. **Non-professional question** — polite decline in Spanish

## Step 5: Deploy to Vercel

Commit and push changes. Vercel auto-deploys from the `main` branch.

## Rollback

- **Revert Worker**: `npx wrangler delete ramirocerda-chat`
- **Revert frontend**: Restore `index.html` from git: `git checkout HEAD~1 -- index.html` then commit

## Architecture Notes

- Worker URL: `https://ramirocerda-chat.ramirocerda.workers.dev` (update after deploy)
- CORS: only `https://ramirocerda.vercel.app` is allowed
- Model: `@cf/meta/llama-3.2-3b-instruct` via Workers AI
- Rate limits: Workers AI free tier handles ~100 requests/day
- Knowledge base: embedded at build time in Worker source
