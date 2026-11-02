# Project notes for AI agents

## Credentials & secrets

- Local credentials live in the root `.env` (gitignored): `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN`. The chat worker's OpenCode Go key is in
  `workers/chat-worker/.dev.vars` (gitignored).
- `bun run chat:populate` (populate-index.mjs) **auto-loads the root `.env`** — it
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

- Lint (whole repo, site + worker + scripts): `bun run lint` (oxlint). Both the
  `correctness` and `suspicious` categories are errors, so any finding fails CI
  via `.github/workflows/lint.yml`. `unicorn/consistent-function-scoping` is
  deliberately off — see the comment in `.oxlintrc.json`.

- Format: `bun run format` writes, `bun run format:check` verifies. Prettier owns
  all layout (oxlint has no formatting rules). CI blocks on `format:check`, so run
  `bun run format` before pushing. Config lives in `.prettierrc.json`
  (`printWidth: 120`, `prettier-plugin-astro` for `.astro`).

- RAG KB populate: `bun run chat:populate` from the repo root (see
  `workers/chat-worker/DEPLOY.md` for the full runbook).