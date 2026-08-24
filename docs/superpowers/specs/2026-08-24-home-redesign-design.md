# Home Redesign — Prototipo D (narrative-first)

**Date:** 2026-08-24
**Status:** Approved direction (user picked prototype D)
**Scope:** Home pages only (`/` and `/en/`)

## Goal

Make the home page feel fuller and more visually interesting by adopting a
narrative-first layout: poster hero → about/stack band → 2-column project card
grid. Direction validated with throwaway HTML prototypes in `prototypes/`
(deleted after implementation).

## Non-goals

- `/work/` and `/en/work/` keep the current list style (shared component gets a
  variant prop instead of a restyle).
- Botardo chat widget, header, footer, global tokens: untouched.
- No CMS/content-collection changes; new copy is static i18n strings.

## Layout

### 1. Poster hero

- Brand line (mono, unchanged).
- Display headline split across two lines: first part in `--text`, last word in
  `--accent`. Implemented by splitting `t('home.thesis')` on its last space.
  Size bumped to roughly `clamp(3rem, 10vw, 6.5rem)`; keeps uppercase,
  `-0.04em` tracking, `line-height 1.05`.
- Thick rule closing the poster: `border-bottom: 3px solid var(--border)`.
- Row under the headline: support paragraph left (`max-width ~34rem`) |
  CTAs right (existing three buttons: email solid, proyectos, botardo via
  `[data-open-botardo]`). Stacks on mobile.
- Status chip below the row: inline-flex, `1px solid var(--border)`,
  `var(--radius)` corners, accent dot (`aria-hidden`) + status text +
  location string.
- Existing rise animation stays, still guarded by `prefers-reduced-motion`.

### 2. Intro band

Two-column band under the hero, closed by a `1px` bottom hairline:

- Left column: mono label ("Sobre mí"), short 2-line bio paragraph, text link
  "Sobre mí →" pointing at the localized about path.
- Right column: mono label ("Stack") + wrapped chips row. Chips reuse the
  existing `.tag` look (mono, bordered). The chip list is a static array in the
  page frontmatter (language-neutral tech names).

### 3. Projects section

- Section label unchanged (`01 / PROYECTOS` / `01 / WORK`).
- `ProjectList.astro` gains an optional `variant?: 'list' | 'grid'` prop
  (default `'list'`). Home passes `variant="grid"`; `/work/` passes nothing.
- Grid styles scoped to the variant class:
  - `repeat(2, 1fr)`, gap ~1rem.
  - Cards: `1.5px solid var(--border)` box, padding ~1.25rem, no left accent
    bar; hover lifts `translateY(-2px)` with hard shadow `3px 3px 0 var(--accent)`.
  - Summaries clamp to 3 lines (`-webkit-line-clamp`).
- "Ver todos →" link unchanged after the grid.

### Responsive

Single breakpoint at `768px` (matches the site's only existing breakpoint):
hero row stacks, intro band stacks, project grid collapses to one column.

### Container width

Keep the existing `.site-shell` at `min(920px, …)`. Widening only the home page
would cause a visible width jump when navigating between pages; the poster
effect comes from typography, not extra width.

## i18n additions (`src/i18n/ui.ts`)

| Key | es | en |
| --- | --- | --- |
| `home.aboutLabel` | `Sobre mí` | `About me` |
| `home.aboutText` | `Ingeniero full-stack en Buenos Aires. Construyo productos web rápidos y observables, y llevo agentes de IA de la idea a producción: arquitectura, código y deploy.` | `Full-stack engineer based in Buenos Aires. I build fast, observable web products and take AI agents from idea to production: architecture, code, and deploy.` |
| `home.stackLabel` | `Stack` | `Stack` |
| `home.statusAvailable` | `Disponible para proyectos` | `Available for projects` |
| `home.location` | `Buenos Aires · UTC-3` | `Buenos Aires · UTC-3` |

Bio copy above is final unless you want different wording.

## Files changed

- `src/pages/index.astro` — new hero/band markup + styles, pass `variant="grid"`.
- `src/pages/en/index.astro` — same changes for English.
- `src/components/ProjectList.astro` — `variant` prop + grid styles.
- `src/i18n/ui.ts` — five new keys above.

## Verification

- `pnpm build` passes.
- `/` and `/en/` render the new layout; `/work/` and `/en/work/` markup is
  byte-identical to before (spot-check rendered HTML).
- At 375px everything is single-column; no horizontal overflow.
- Keyboard focus states intact (global focus-visible already covers links/buttons).
- Delete `prototypes/` once the user confirms the result.
