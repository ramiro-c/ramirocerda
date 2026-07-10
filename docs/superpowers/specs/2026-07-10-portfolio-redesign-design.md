# Portfolio redesign — ramirocerda

**Date:** 2026-07-10  
**Status:** Approved  
**Repo:** `ramirocerda`  
**Constraint:** Free hosting on Vercel; keep Botardo (Cloudflare Worker)

## Goal

Replace the current single-page CV (`index.html`) with a personal brand / portfolio site that:

- Presents Ramiro as a builder (not a résumé dump)
- Showcases projects with room for case studies
- Includes a notes/blog system (empty at launch)
- Works for recruiters who need a quick professional scan
- Supports Spanish and English
- Keeps Botardo as the deep professional Q&A surface

## Non-goals (v1)

- Seed blog posts
- Dark theme / keeping the current Inter + gold look
- Full CV sections on the site (skills grids, certifications list, dense job bullets)
- Changing Botardo’s knowledge domain (still professional profile only)
- Paid hosting or moving off Vercel for the site

## Stack

| Piece | Choice |
|-------|--------|
| Site | Astro (static SSG) |
| Host | Vercel (free) |
| i18n | `es` + `en` via Astro localized routes |
| Content | Astro content collections: `projects`, `notes` (MD/MDX) |
| Chat | Existing Cloudflare Worker (`workers/chat-worker`) + restyled client widget |
| Analytics | Keep Vercel Insights if already wired |

**Why Astro:** static output fits Vercel free tier, first-class content collections for projects/notes, clean i18n routing, minimal JS except Botardo island.

## Information architecture

```
/                    → redirect to locale (Accept-Language, default `es`)
/[lang]/             home
/[lang]/about        trajectory (light)
/[lang]/work         project index
/[lang]/work/[slug]  case study
/[lang]/notes        notes index (empty state at launch)
/[lang]/notes/[slug] note post (when content exists)
```

`lang` ∈ `{ es, en }`.

Nav (all pages): brand `ramirocerda` · About · Work · Notes · language toggle · Botardo floating widget.

## Page designs

### Home

One composition (not a dashboard). First viewport:

1. Brand / name as hero-level signal
2. One thesis headline
3. One short supporting sentence
4. CTA group: Work + open Botardo
5. No stats, skill pills, timeline, or certs

Below the fold:

- Featured work (2–3 projects): typographic list with coral accent rule, title + one-liner + link
- Notes teaser: empty state (“Pronto notas” / “Notes coming soon”) or hide until first post exists
- Minimal footer (credit + location)

### About

Light professional page for recruiters who scroll ~30s:

- Short bio
- Key roles as bullets (LDP trajectory + earlier roles), not the current dense CV copy
- Education in one line
- Links: LinkedIn, GitHub, email

No skills grids, no certifications section. Detail lives in Botardo (+ LinkedIn).

### Work

- Index: typographic list (title, one-liner, minimal tags, coral left border)
- Case study template: problem → what you did → stack → links (repo/demo when available)

**Initial projects** (migrate from current `index.html`):

1. AI Agents Hub  
2. Mundial 2026  
3. linkedin-markdownificator  
4. Knowledge Vault  
5. LactarIA  
6. Rutinify  

Featured on home (fixed for v1): Mundial 2026, AI Agents Hub, Knowledge Vault.

### Notes

- Content collection ready for a mix of technical notes and personal-brand writing
- Launch with **zero posts** and a clear empty state
- No placeholder fake articles

## Visual system — “Señal”

| Token | Value |
|-------|--------|
| Background | `#F7F5F1` |
| Text | `#111111` |
| Muted | `#444444` / `#666666` |
| Accent | `#E4572E` (coral) |
| Hairline | `#111111` borders |
| Radius | 0–2px (almost none) |
| Display type | Heavy sans, tight tracking; hero may use uppercase |
| Body | Readable sans |
| Meta / captions | Monospace |
| Shadows | None as default |

Motion (2–3 intentional moments): hero entrance, project hover, Botardo open. Honor `prefers-reduced-motion`.

Avoid: dark neon cyberpunk, purple gradients, cream+terracotta serif default, broadsheet dense columns, Inter-as-default without a deliberate pair.

## Botardo

**Keep:** Cloudflare Worker, `/ask` API, knowledge base as source of truth for professional detail, floating widget UX.

**Change:**

1. **Language:** Reply in the language of the user’s message (at least Spanish and English). Do **not** force rioplatense Spanish for every reply. When answering in Spanish, rioplatense tone remains fine; when answering in English, use clear professional English. Update `SYSTEM_PROMPT` in `workers/chat-worker/src/index.ts` accordingly (remove “ALWAYS reply in Spanish” rule).
2. **Visual (hard requirement):** Botardo’s UI must use the same Señal design system as the site — background `#F7F5F1`, text `#111`, coral `#E4572E`, hairline black borders, near-zero radius, display/body/mono roles as above. No leftover dark-theme chat chrome from the current `index.html`. Open/close motion should feel consistent with the rest of the site.
3. **KB:** Refresh copy if About/home messaging drifts, without removing professional depth.

CORS / `ALLOWED_ORIGIN` must allow the Vercel production URL (and preview if needed).

## Content & i18n strategy

- UI strings: dictionaries per locale (`es` / `en`)
- Projects and notes: either locale-suffixed entries or `locale` in frontmatter; every shipped project has ES + EN fields at launch
- Default locale: `es`
- Language toggle switches path prefix and preserves the current page when a translation exists

## Migration plan (high level)

1. Scaffold Astro app in-repo (replace root `index.html` as the site entry; archive or remove old monolith after cutover)
2. Implement layout, tokens, i18n routing, nav, language toggle
3. Build Home, About, Work index + case studies from migrated project content
4. Build Notes index empty state + collection schema
5. Port Botardo client widget; update Worker language rule; verify CORS
6. Deploy to Vercel; smoke-test ES/EN + Botardo ES/EN
7. Update README to reflect portfolio (not CV) structure

## Success criteria

- Site does not read as a CV on first viewport
- Recruiter can reach About and understand trajectory in under a minute
- Projects are browsable with individual pages
- Notes section exists and is empty without looking broken
- ES and EN cover all primary pages
- Botardo answers in the language of the question
- Remains free on Vercel; Worker stays on Cloudflare

## Out of scope follow-ups (explicit)

- Additional locales beyond ES/EN
- CMS / admin for posts
- Forcing Botardo UI chrome to switch with site locale (reply language follows the message, not the path)
