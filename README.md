# Ramiro Cerda portfolio

Astro portfolio site with localized Spanish/English routes.

## Overview

- Astro static site; main public routes under `/es` and `/en`.
- Content via Astro collections for projects and notes.
- Botardo is the floating AI helper, powered by a Cloudflare Worker in `workers/chat-worker`.

## Structure

- `src/pages/[lang]/` — localized pages
- `src/components/Botardo.astro` — Botardo widget
- `src/content/projects` — project entries
- `src/content/notes` — notes collection
- `workers/chat-worker` — Botardo Worker backend

## Scripts

Uses **Bun** (`bun.lock`; workspace list in `package.json`).

- `bun install` — install dependencies
- `bun run dev` — Astro dev server
- `bun run build` — build into `dist/`
- `bun run preview` — preview production build
- `bun run lint` — oxlint across site, worker and scripts (blocking)
- `bun run format` — Prettier across the repo; `bun run format:check` verifies

## Botardo

UI in the Astro site; answer API in the Cloudflare Worker. Keep the Worker knowledge base in sync with portfolio content when making larger copy changes.

## Contact

- GitHub: [@ramiro-c](https://github.com/ramiro-c)
- LinkedIn: [linkedin.com/in/cerdaramiro](https://www.linkedin.com/in/cerdaramiro/)
- Email: rami992009@gmail.com
