# Ramiro Cerda portfolio

This repository now contains the Astro portfolio site, not the old single-file CV monolith.

## Overview

- Astro static site generator with localized routes for Spanish and English.
- Main public routes live under `/es` and `/en`.
- Content is driven by Astro content collections for projects and notes.
- Botardo is the floating AI helper, powered by a Cloudflare Worker in `workers/chat-worker`.
- The design direction is documented in `docs/superpowers/specs/2026-07-10-portfolio-redesign-design.md`.

## Structure

- `src/pages/[lang]/` - localized pages for the portfolio
- `src/components/Botardo.astro` - Botardo widget and client behavior
- `src/content/projects` - project entries used on the site
- `src/content/notes` - notes collection, ready for future posts
- `workers/chat-worker` - Botardo Worker backend
- `archive/index.html` - archived legacy CV homepage

## Scripts

Uses **pnpm** (see `packageManager` in `package.json`).

- `pnpm install` - install dependencies
- `pnpm dev` - start the Astro dev server
- `pnpm build` - build the static site into `dist/`
- `pnpm preview` - preview a production build locally

## Botardo

Botardo is the conversational layer for deeper professional questions. The UI lives in the Astro site, while the answer API stays in the Cloudflare Worker. Keep the Worker knowledge base in sync with the portfolio content when making larger copy changes.

## Contact

- GitHub: [@ramiro-c](https://github.com/ramiro-c)
- LinkedIn: [linkedin.com/in/ramiro-cerdá](https://www.linkedin.com/in/ramiro-cerdá-619983177/)
- Email: rami992009@gmail.com