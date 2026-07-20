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

Uses **pnpm** (see `packageManager` in `package.json`).

- `pnpm install` — install dependencies
- `pnpm dev` — Astro dev server
- `pnpm build` — build into `dist/`
- `pnpm preview` — preview production build

## Botardo

UI in the Astro site; answer API in the Cloudflare Worker. Keep the Worker knowledge base in sync with portfolio content when making larger copy changes.

## Contact

- GitHub: [@ramiro-c](https://github.com/ramiro-c)
- LinkedIn: [linkedin.com/in/ramiro-cerdá](https://www.linkedin.com/in/ramiro-cerdá-619983177/)
- Email: rami992009@gmail.com
