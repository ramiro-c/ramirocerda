# Project notes for AI agents

## Credentials & secrets

- Local credentials live in the root `.env` (gitignored): `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`. The chat worker's OpenCode Go key is in
  `workers/chat-worker/.dev.vars` (gitignored).
- `pnpm chat:populate` (populate-index.mjs) **auto-loads the root `.env`** — it
  needs NO credential input from the user. Do not ask for Cloudflare tokens or
  account IDs to run it; just run the script. Use `--dry-run` to preview chunks.
- `.env` / `.dev.vars` / any secrets must never be committed, printed, or pasted
  into prompts. Before any commit touching secrets, verify with
  `git check-ignore` and scan `git rev-list --all`.
- A credential audit (2026-08-23) confirmed no real token, account ID, or API key
  exists in git history or the working tree.

## Tooling gotchas

- Glob tools skip dotfiles. To find `.env` / `.dev.vars` use `ls -la` or
  `git check-ignore -v`.
- Wrangler auto-loads the root `.env`; `wrangler whoami` shows the account.

## Operations

- RAG KB populate: `pnpm chat:populate` from the repo root (see
  `workers/chat-worker/DEPLOY.md` for the full runbook).