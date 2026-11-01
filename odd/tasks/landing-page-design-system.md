# Landing page design system migration

Objective: adopt the `landing-page-design` skill visual system (Part B) site wide, replacing the brutalist layer (Archivo Black, uppercase display, 3px borders, 2px radius, arbitrary font sizes).
Branch: `feat/leads-and-returning-visitors`. Test runner: `pnpm build` (Astro build is the only check; no unit test runner).
Skill source: `.agents/skills/landing-page-design/SKILL.md` (installed from elayadesign/ai-design-skills).

## Specs

- S1 Typeface: one primary typeface, Geist. Geist Mono only for code, data, or numeric UI. No italic, no weight above 700. Archivo, Archivo Black and IBM Plex Mono are removed.
- S2 Type scale: every rendered font size lands on a Tailwind step (12/14/16/18/20/24/30/36/48/60/72/96) with its paired line height. No arbitrary values, no clamp() spanning off scale values.
- S3 Text styles: each text element uses a named style class from the skill table (`heading-1..6`, `title-1..5`, `body-1..6`, `button-lg|md|sm|xsm`, `caption-1..5`). Defined once in `src/styles/global.css`.
- S4 Spacing: only the skill spacing table values (0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96). Main buttons: 8px vertical, 12px horizontal padding.
- S5 Radius: only Tailwind radius values. Nested shapes follow `inner = outer - gap` when the gap is under 32px and the result is above 2.
- S6 Borders and backgrounds: no single sided card borders. No background gradients. Backgrounds are flat.
- S7 Hero: heading uses a left to right text gradient (`#000000` to `#666666` on the light theme), heading and subheading capped at 680px, line breaks at meaningful points.
- S8 Icons: Phosphor, Solar or Iconamoon. No Material icons.
- S9 Motion: base curve `cubic-bezier(0.22, 1, 0.36, 1)`, 500ms for layout and position, 300ms for color and opacity, never under 200ms. Only `transform` and `opacity` animate. `prefers-reduced-motion` degrades to opacity.
- S10 Navigation: floating compact bar off the top edge, centered, sized to content, translucent surface with backdrop blur. Animated toggle between open and close. Mobile menu is a full height panel with links arriving in reading order, 60ms apart, capped at 400ms.
- S11 Copy: sentence case for headings and buttons, no hyphens inside sentences, no orphaned words (`text-wrap: balance` headings, `pretty` body). No banned filler words.
- S12 Ship requirements kept: skip link, focus rings, 404, legal links, alt text, meta tags, 390px with no horizontal overflow.
- S13 Scope: whole site (global.css, all components, all pages, ES and EN).

## Tasks

| ID | Task | Specs | Route | Status |
|---|---|---|---|---|
| T1 | Rewrite the token and text style layer in `src/styles/global.css` | S1-S6, S9 | inline | pending |
| T2 | Load Geist and Geist Mono in `BaseLayout.astro`, update theme color | S1 | inline | pending |
| T3 | Floating pill navigation with animated toggle and full height mobile panel | S10 | inline | pending |
| T4 | Hero, sections and tagline of `HomeLanding.astro` | S2-S7, S11 | inline | pending |
| T5 | Shared chrome: `PrimaryCta`, `SiteFooter`, `LanguageToggle` | S3, S4 | inline | pending |
| T6 | Overlays: `Botardo`, `ContactDialog`, `BottomDock`, `PrivacyNotice` | S3-S5 | delegated | pending |
| T7 | Content components: `HomeHub`, `AboutDossier`, `WorkflowSplit` | S3-S5 | delegated | pending |
| T8 | Pages ES and EN: 404, about, workflow, notes, work | S2, S3, S11 | delegated | pending |
| T9 | Build, 390px check, and rule audit | S12 | inline | pending |

## Log

L1 (verbatim): "instala esto https://github.com/elayadesign/ai-design-skills, quiero aplicar estos estilos para mi landing en esta branch"

L2: Skill installed with `npx skills add elayadesign/ai-design-skills --skill landing-page-design -a opencode -y` into `.agents/skills/landing-page-design` (copied). Security scan: Gen Safe, Socket 0 alerts, Snyk Low Risk.

L3: Existing landing already implements the skill's Part A (structure, copy rules, tagline reveal in `src/scripts/reveal.ts`). The gap is Part B, the visual system. Copy in `src/i18n/landing.ts` already follows sentence case and the no hyphen rule.

L4: Scope question answered by the user: "Todo el sitio" (all pages, not only the home landing).
