# Portfolio Redesign (Señal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CV-style `index.html` with an Astro portfolio (ES/EN) using the Señal visual system, with Work case studies, empty Notes, light About, and Botardo restyled + multilingual replies.

**Architecture:** Astro SSG on Vercel with `prefixDefaultLocale: true` routes under `/es` and `/en`. Projects and notes live in Astro content collections. Botardo stays on the existing Cloudflare Worker; only the system prompt (reply language) and the client widget (Señal UI) change.

**Tech Stack:** Astro 5.x, TypeScript, MD/MDX content collections, vanilla client JS for Botardo, Cloudflare Workers AI (existing), Vercel static hosting.

**Spec:** [docs/superpowers/specs/2026-07-10-portfolio-redesign-design.md](../specs/2026-07-10-portfolio-redesign-design.md)

---

## File map

| Path | Responsibility |
|------|----------------|
| `package.json`, `astro.config.mjs`, `tsconfig.json` | Astro app + i18n config |
| `src/styles/global.css` | Señal tokens, base type, motion |
| `src/i18n/ui.ts` | UI string dictionaries `es` / `en` |
| `src/i18n/utils.ts` | `getLangFromUrl`, `useTranslations`, `getLocalizedPath` |
| `src/content.config.ts` | `projects` + `notes` collection schemas |
| `src/content/projects/*.md` | Six projects, bilingual frontmatter |
| `src/content/notes/.gitkeep` | Empty notes collection |
| `src/layouts/BaseLayout.astro` | HTML shell, fonts, analytics, Botardo slot |
| `src/components/SiteHeader.astro` | Brand nav + language toggle |
| `src/components/SiteFooter.astro` | Minimal footer |
| `src/components/ProjectList.astro` | Typographic project list |
| `src/components/Botardo.astro` | Señal chat widget (markup + client script) |
| `src/pages/index.astro` | Locale redirect |
| `src/pages/[lang]/index.astro` | Home |
| `src/pages/[lang]/about.astro` | About |
| `src/pages/[lang]/work/index.astro` | Work index |
| `src/pages/[lang]/work/[slug].astro` | Case study |
| `src/pages/[lang]/notes/index.astro` | Notes empty/index |
| `src/pages/[lang]/notes/[slug].astro` | Note post |
| `workers/chat-worker/src/index.ts` | Reply-language rule (+ CORS if needed) |
| `archive/index.html` | Old monolith preserved |
| `README.md` | Portfolio docs |

---

### Task 1: Commit approved spec + scaffold Astro

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `public/favicon.svg` (optional simple mark)
- Modify: `.gitignore`
- Move later: `index.html` → `archive/` (Task 10); keep root clean for Astro `public/` + `src/`

- [ ] **Step 1: Commit the approved design spec and gitignore**

```bash
cd /Users/ramiro/Desktop/personal/ramirocerda
git add docs/superpowers/specs/2026-07-10-portfolio-redesign-design.md .gitignore
git commit -m "$(cat <<'EOF'
docs: approve Señal portfolio redesign spec

EOF
)"
```

- [ ] **Step 2: Scaffold Astro in the repo root (non-interactive)**

```bash
cd /Users/ramiro/Desktop/personal/ramirocerda
npm create astro@latest . -- --template minimal --typescript strict --install --git false --yes
```

If the scaffolder refuses a non-empty directory, create files manually:

`package.json`:
```json
{
  "name": "ramirocerda",
  "type": "module",
  "version": "1.0.0",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "^5.10.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0"
  }
}
```

`astro.config.mjs`:
```js
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://ramirocerda.vercel.app",
  i18n: {
    defaultLocale: "es",
    locales: ["es", "en"],
    routing: {
      prefixDefaultLocale: true,
    },
  },
});
```

`tsconfig.json`:
```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist", "workers"]
}
```

- [ ] **Step 3: Install and verify build of empty scaffold**

```bash
npm install
npm run build
```

Expected: `dist/` created; build exits 0.

- [ ] **Step 4: Commit scaffold**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json src/ public/ .gitignore
git commit -m "$(cat <<'EOF'
chore: scaffold Astro app with es/en i18n routing

EOF
)"
```

---

### Task 2: Señal design tokens + BaseLayout

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/pages/index.astro` (temporary redirect stub)

- [ ] **Step 1: Add global Señal CSS**

Create `src/styles/global.css`:
```css
:root {
  --bg: #f7f5f1;
  --text: #111111;
  --muted: #444444;
  --muted-2: #666666;
  --accent: #e4572e;
  --border: #111111;
  --radius: 2px;
  --font-display: "Archivo Black", "Archivo", system-ui, sans-serif;
  --font-body: "Archivo", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-body);
  font-size: 1.05rem;
  line-height: 1.55;
}

a {
  color: inherit;
}

a:focus-visible,
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.skip-link {
  position: absolute;
  left: 12px;
  top: -48px;
  z-index: 1000;
  background: var(--accent);
  color: #fff;
  padding: 8px 12px;
  text-decoration: none;
  font-weight: 600;
}

.skip-link:focus {
  top: 12px;
}

.display {
  font-family: var(--font-display);
  letter-spacing: -0.04em;
  line-height: 1.05;
  text-transform: uppercase;
}

.mono {
  font-family: var(--font-mono);
}

.site-shell {
  width: min(920px, calc(100% - 2rem));
  margin-inline: auto;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 2: Create BaseLayout**

Create `src/layouts/BaseLayout.astro`:
```astro
---
import "../styles/global.css";

interface Props {
  title: string;
  description: string;
  lang: "es" | "en";
}

const { title, description, lang } = Astro.props;
---

<!doctype html>
<html lang={lang}>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content={description} />
    <meta name="theme-color" content="#F7F5F1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
      rel="stylesheet"
    />
    <title>{title}</title>
    <script>
      window.va =
        window.va ||
        function () {
          (window.vaq = window.vaq || []).push(arguments);
        };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <slot name="header" />
    <main id="main" class="site-shell">
      <slot />
    </main>
    <slot name="footer" />
    <slot name="botardo" />
  </body>
</html>
```

- [ ] **Step 3: Root redirect page**

Create `src/pages/index.astro`:
```astro
---
return Astro.redirect("/es/");
---
```

(Accept-Language detection can be added later via middleware; default `es` matches the spec.)

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/styles/global.css src/layouts/BaseLayout.astro src/pages/index.astro
git commit -m "$(cat <<'EOF'
feat: add Señal tokens and BaseLayout

EOF
)"
```

---

### Task 3: i18n dictionaries + header/footer

**Files:**
- Create: `src/i18n/ui.ts`, `src/i18n/utils.ts`
- Create: `src/components/SiteHeader.astro`, `src/components/SiteFooter.astro`, `src/components/LanguageToggle.astro`

- [ ] **Step 1: UI strings**

Create `src/i18n/ui.ts`:
```ts
export const languages = {
  es: "Español",
  en: "English",
} as const;

export type Lang = keyof typeof languages;

export const defaultLang: Lang = "es";

export const ui = {
  es: {
    "nav.about": "About",
    "nav.work": "Work",
    "nav.notes": "Notes",
    "nav.home": "Inicio",
    "cta.work": "Proyectos",
    "cta.botardo": "Botardo",
    "home.brand": "Ramiro Cerdá",
    "home.thesis": "Tech lead que shippea.",
    "home.support":
      "Full-stack · liderazgo · IA-augmented. Proyectos reales, no un CV disfrazado.",
    "home.workLabel": "01 / WORK",
    "home.notesLabel": "02 / NOTES",
    "home.notesEmpty": "Pronto notas.",
    "about.title": "About",
    "work.title": "Work",
    "notes.title": "Notes",
    "notes.empty": "Todavía no hay notas. Vuelvo cuando tenga algo que valga la pena publicar.",
    "footer.line": "Diseñado y construido por Ramiro Cerdá · Buenos Aires",
    "project.problem": "Problema",
    "project.what": "Qué hice",
    "project.stack": "Stack",
    "project.links": "Links",
  },
  en: {
    "nav.about": "About",
    "nav.work": "Work",
    "nav.notes": "Notes",
    "nav.home": "Home",
    "cta.work": "Projects",
    "cta.botardo": "Botardo",
    "home.brand": "Ramiro Cerdá",
    "home.thesis": "Tech lead who ships.",
    "home.support":
      "Full-stack · leadership · AI-augmented. Real projects, not a CV in disguise.",
    "home.workLabel": "01 / WORK",
    "home.notesLabel": "02 / NOTES",
    "home.notesEmpty": "Notes coming soon.",
    "about.title": "About",
    "work.title": "Work",
    "notes.title": "Notes",
    "notes.empty": "No notes yet. Back when there’s something worth publishing.",
    "footer.line": "Designed and built by Ramiro Cerdá · Buenos Aires",
    "project.problem": "Problem",
    "project.what": "What I did",
    "project.stack": "Stack",
    "project.links": "Links",
  },
} as const;

export type UiKey = keyof (typeof ui)["es"];
```

Create `src/i18n/utils.ts`:
```ts
import { defaultLang, ui, type Lang, type UiKey } from "./ui";

export function getLangFromUrl(url: URL): Lang {
  const [, maybe] = url.pathname.split("/");
  if (maybe in ui) return maybe as Lang;
  return defaultLang;
}

export function useTranslations(lang: Lang) {
  return function t(key: UiKey): string {
    return ui[lang][key] ?? ui[defaultLang][key];
  };
}

export function getLocalizedPath(lang: Lang, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (clean === "/") return `/${lang}/`;
  return `/${lang}${clean}`;
}

export function switchLangPath(currentPath: string, nextLang: Lang): string {
  const parts = currentPath.split("/").filter(Boolean);
  if (parts.length === 0) return `/${nextLang}/`;
  parts[0] = nextLang;
  return `/${parts.join("/")}` + (currentPath.endsWith("/") ? "/" : "");
}
```

- [ ] **Step 2: Language toggle + header + footer**

Create `src/components/LanguageToggle.astro`:
```astro
---
import { languages, type Lang } from "../i18n/ui";
import { switchLangPath } from "../i18n/utils";

interface Props {
  lang: Lang;
}
const { lang } = Astro.props;
const path = Astro.url.pathname;
---

<nav class="lang mono" aria-label="Language">
  {
    (Object.keys(languages) as Lang[]).map((code) => (
      <a
        href={switchLangPath(path, code)}
        aria-current={code === lang ? "page" : undefined}
        class:list={[{ active: code === lang }]}
      >
        {code}
      </a>
    ))
  }
</nav>

<style>
  .lang {
    display: flex;
    gap: 0.5rem;
    font-size: 0.85rem;
  }
  .lang a {
    text-decoration: none;
    color: var(--muted-2);
    text-transform: uppercase;
  }
  .lang a.active,
  .lang a[aria-current="page"] {
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
```

Create `src/components/SiteHeader.astro`:
```astro
---
import type { Lang } from "../i18n/ui";
import { getLocalizedPath, useTranslations } from "../i18n/utils";
import LanguageToggle from "./LanguageToggle.astro";

interface Props {
  lang: Lang;
}
const { lang } = Astro.props;
const t = useTranslations(lang);
---

<header class="header site-shell">
  <a class="brand mono" href={getLocalizedPath(lang, "/")}>ramirocerda</a>
  <nav class="nav" aria-label="Primary">
    <a href={getLocalizedPath(lang, "/about/")}>{t("nav.about")}</a>
    <a href={getLocalizedPath(lang, "/work/")}>{t("nav.work")}</a>
    <a href={getLocalizedPath(lang, "/notes/")}>{t("nav.notes")}</a>
  </nav>
  <LanguageToggle lang={lang} />
</header>

<style>
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.25rem 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 2.5rem;
  }
  .brand {
    font-weight: 500;
    text-decoration: none;
    letter-spacing: 0.02em;
  }
  .nav {
    display: flex;
    gap: 1.25rem;
    font-size: 0.95rem;
  }
  .nav a {
    text-decoration: none;
  }
  .nav a:hover {
    color: var(--accent);
  }
  @media (max-width: 640px) {
    .header {
      flex-wrap: wrap;
    }
    .nav {
      order: 3;
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
```

Create `src/components/SiteFooter.astro`:
```astro
---
import type { Lang } from "../i18n/ui";
import { useTranslations } from "../i18n/utils";

interface Props {
  lang: Lang;
}
const { lang } = Astro.props;
const t = useTranslations(lang);
const year = new Date().getFullYear();
---

<footer class="footer site-shell">
  <p>{t("footer.line")} · <span>{year}</span></p>
</footer>

<style>
  .footer {
    margin-top: 4rem;
    padding: 1.5rem 0 3rem;
    border-top: 1px solid var(--border);
    color: var(--muted-2);
    font-size: 0.9rem;
  }
</style>
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n src/components/LanguageToggle.astro src/components/SiteHeader.astro src/components/SiteFooter.astro
git commit -m "$(cat <<'EOF'
feat: add i18n dictionaries, header, and footer

EOF
)"
```

---

### Task 4: Content collections + migrate six projects

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/projects/{ai-agents-hub,mundial-2026,linkedin-markdownificator,knowledge-vault,lactaria,rutinify}.md`
- Create: `src/content/notes/.gitkeep`

- [ ] **Step 1: Define collections**

Create `src/content.config.ts`:
```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const localized = z.object({
  title: z.string(),
  summary: z.string(),
  problem: z.string(),
  what: z.string(),
  stack: z.array(z.string()),
});

const projects = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/projects" }),
  schema: z.object({
    slug: z.string(),
    kind: z.string(),
    featured: z.boolean().default(false),
    order: z.number(),
    tags: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    es: localized,
    en: localized,
  }),
});

const notes = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/notes" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    lang: z.enum(["es", "en"]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { projects, notes };
```

- [ ] **Step 2: Add project markdown files**

Create each file under `src/content/projects/`. Example for featured Mundial:

`src/content/projects/mundial-2026.md`:
```md
---
slug: mundial-2026
kind: personal
featured: true
order: 1
tags: [FastAPI, React, Cloudflare]
repo: https://github.com/rami992009/mundial-2026
demo: https://worldcup-2026.rami992009.workers.dev
es:
  title: "Mundial 2026 — World Cup Companion"
  summary: "Companion full-stack para seguir el Mundial 2026: grupos, fixture, bracket y TV."
  problem: "Seguir un mundial multi-sede con husos horarios, TV local y datos históricos es caótico en pestañas sueltas."
  what: "Construí una app con tabla de grupos, fixture con huso local, bracket dinámico, mapa de sedes y cruce de historiales."
  stack: [FastAPI, "React 19", TypeScript, "Tailwind CSS v4", Leaflet, "Cloudflare Workers"]
en:
  title: "Mundial 2026 — World Cup Companion"
  summary: "Full-stack companion for World Cup 2026: groups, fixtures, bracket, and TV guides."
  problem: "Following a multi-host World Cup across timezones, local TV, and history means juggling too many tabs."
  what: "Built groups, local-timezone fixtures, a live knockout bracket, venue map, and historical matchup views."
  stack: [FastAPI, "React 19", TypeScript, "Tailwind CSS v4", Leaflet, "Cloudflare Workers"]
---
```

Repeat for:

| file | featured | order | notes |
|------|----------|-------|-------|
| `ai-agents-hub.md` | true | 2 | repo `https://github.com/ramiro-c/ai-agents-hub` |
| `knowledge-vault.md` | true | 3 | no demo required |
| `linkedin-markdownificator.md` | false | 4 | fork OSS |
| `lactaria.md` | false | 5 | freelance |
| `rutinify.md` | false | 6 | PWA |

Use the Spanish copy already in `archive`-bound `index.html` (AI Agents Hub, LactarIA, etc.) and write clear EN equivalents in the same frontmatter shape. Body of each `.md` can be empty; case study pages read frontmatter only in v1.

- [ ] **Step 3: Empty notes folder**

```bash
mkdir -p src/content/notes
touch src/content/notes/.gitkeep
```

If the notes glob fails on empty dir during build, keep `.gitkeep` and ensure the loader pattern does not require files (Astro allows empty collections).

- [ ] **Step 4: Build to validate schemas**

```bash
npm run build
```

Expected: exit 0; content collection types generated. If schema errors, fix frontmatter until green.

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content
git commit -m "$(cat <<'EOF'
feat: add projects content collection (ES/EN)

EOF
)"
```

---

### Task 5: Home + About pages

**Files:**
- Create: `src/pages/[lang]/index.astro`
- Create: `src/pages/[lang]/about.astro`
- Create: `src/components/ProjectList.astro`

- [ ] **Step 1: ProjectList component**

Create `src/components/ProjectList.astro`:
```astro
---
import type { Lang } from "../i18n/ui";
import { getLocalizedPath } from "../i18n/utils";

interface Item {
  slug: string;
  title: string;
  summary: string;
  tags?: string[];
}

interface Props {
  lang: Lang;
  items: Item[];
}
const { lang, items } = Astro.props;
---

<ul class="list">
  {
    items.map((item) => (
      <li>
        <a href={getLocalizedPath(lang, `/work/${item.slug}/`)}>
          <span class="title">{item.title}</span>
          <span class="summary">{item.summary}</span>
        </a>
      </li>
    ))
  }
</ul>

<style>
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.85rem;
  }
  .list li a {
    display: grid;
    gap: 0.25rem;
    text-decoration: none;
    border-left: 3px solid var(--accent);
    padding: 0.55rem 0 0.55rem 0.85rem;
    transition: transform 0.2s ease;
  }
  .list li a:hover {
    transform: translateX(4px);
  }
  .title {
    font-weight: 700;
  }
  .summary {
    color: var(--muted);
    font-size: 0.95rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .list li a {
      transition: none;
    }
    .list li a:hover {
      transform: none;
    }
  }
</style>
```

- [ ] **Step 2: Home page**

Create `src/pages/[lang]/index.astro`:
```astro
---
import { getCollection } from "astro:content";
import BaseLayout from "../../layouts/BaseLayout.astro";
import SiteHeader from "../../components/SiteHeader.astro";
import SiteFooter from "../../components/SiteFooter.astro";
import ProjectList from "../../components/ProjectList.astro";
import { languages, type Lang } from "../../i18n/ui";
import { getLocalizedPath, useTranslations } from "../../i18n/utils";

export function getStaticPaths() {
  return (Object.keys(languages) as Lang[]).map((lang) => ({ params: { lang } }));
}

const lang = Astro.params.lang as Lang;
const t = useTranslations(lang);
const projects = (await getCollection("projects"))
  .filter((p) => p.data.featured)
  .sort((a, b) => a.data.order - b.data.order)
  .map((p) => ({
    slug: p.data.slug,
    title: p.data[lang].title,
    summary: p.data[lang].summary,
  }));
---

<BaseLayout
  lang={lang}
  title={`${t("home.brand")} — ${t("home.thesis")}`}
  description={t("home.support")}
>
  <SiteHeader slot="header" lang={lang} />

  <section class="hero">
    <p class="brand-line mono">{t("home.brand")}</p>
    <h1 class="display">{t("home.thesis")}</h1>
    <p class="support">{t("home.support")}</p>
    <div class="ctas">
      <a class="btn" href={getLocalizedPath(lang, "/work/")}>{t("cta.work")}</a>
      <button class="btn solid" type="button" data-open-botardo>{t("cta.botardo")}</button>
    </div>
  </section>

  <section class="block">
    <p class="mono label">{t("home.workLabel")}</p>
    <ProjectList lang={lang} items={projects} />
  </section>

  <section class="block">
    <p class="mono label">{t("home.notesLabel")}</p>
    <p class="empty">{t("home.notesEmpty")}</p>
  </section>

  <SiteFooter slot="footer" lang={lang} />
</BaseLayout>

<style>
  .hero {
    padding: 1rem 0 2.5rem;
  }
  .brand-line {
    margin: 0 0 0.75rem;
    color: var(--muted-2);
    font-size: 0.9rem;
  }
  .display {
    margin: 0 0 1rem;
    font-size: clamp(2.4rem, 8vw, 4.2rem);
  }
  .support {
    max-width: 36rem;
    color: var(--muted);
    margin: 0 0 1.5rem;
  }
  .ctas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .btn {
    border: 1.5px solid var(--border);
    background: transparent;
    color: var(--text);
    padding: 0.65rem 0.95rem;
    text-decoration: none;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.8rem;
    letter-spacing: 0.04em;
    cursor: pointer;
    border-radius: var(--radius);
  }
  .btn.solid {
    background: var(--border);
    color: var(--bg);
  }
  .block {
    margin: 2.5rem 0;
  }
  .label {
    font-size: 0.8rem;
    color: var(--muted-2);
    margin-bottom: 0.75rem;
  }
  .empty {
    color: var(--muted);
  }
  @media (prefers-reduced-motion: no-preference) {
    .hero {
      animation: rise 0.6s ease both;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
```

- [ ] **Step 3: About page**

Create `src/pages/[lang]/about.astro` with bilingual inline content (or a small `src/i18n/about.ts` map). Keep it light:

- Bio: Tech Lead at LDP, UTN ISI, BA
- Roles bullets: LDP (RN → React → Tech Lead), DevGAM, UTN FRLP, New Logic
- Education one line
- Links: LinkedIn, GitHub, email

No skills grids / certs.

- [ ] **Step 4: Build + smoke in browser**

```bash
npm run build && npm run preview
```

Open `/es/` and `/en/`; confirm hero, featured three projects, notes empty line, about page.

- [ ] **Step 5: Commit**

```bash
git add src/pages src/components/ProjectList.astro src/i18n
git commit -m "$(cat <<'EOF'
feat: add Señal home and about pages

EOF
)"
```

---

### Task 6: Work index + case study + Notes routes

**Files:**
- Create: `src/pages/[lang]/work/index.astro`
- Create: `src/pages/[lang]/work/[slug].astro`
- Create: `src/pages/[lang]/notes/index.astro`
- Create: `src/pages/[lang]/notes/[slug].astro`

- [ ] **Step 1: Work index** — `getCollection("projects")`, sort by `order`, render `ProjectList` with all items.

- [ ] **Step 2: Case study page**

`getStaticPaths` from projects × langs. Render sections using `t("project.problem")` etc. and `project.data[lang]`. Show repo/demo links when present.

- [ ] **Step 3: Notes index** — `getCollection("notes")` filtered by `lang` and `!draft`. If length 0, show `t("notes.empty")`.

- [ ] **Step 4: Notes slug page** — `getStaticPaths` from notes; if zero notes, export empty paths array (valid in Astro).

- [ ] **Step 5: Build**

```bash
npm run build
```

Expected: routes for all 6 projects × 2 langs; notes index for both langs.

- [ ] **Step 6: Commit**

```bash
git add src/pages/[lang]/work src/pages/[lang]/notes
git commit -m "$(cat <<'EOF'
feat: add work case studies and notes routes

EOF
)"
```

---

### Task 7: Botardo widget — Señal UI (hard requirement)

**Files:**
- Create: `src/components/Botardo.astro`
- Modify: `src/layouts/BaseLayout.astro` (include Botardo by default) OR pass from each page via slot — prefer include once in `BaseLayout` after footer slot for DRY
- Modify: home CTA `data-open-botardo` already present — wire in Botardo script

- [ ] **Step 1: Implement Botardo.astro**

Port behavior from current `index.html` chat JS (`WORKER_URL = https://ramirocerda-chat.rami992009.workers.dev`), but **all chrome must use Señal tokens**:

- Island button: black border / coral fill or inverse solid black, square radius `2px`
- Modal: `background: var(--bg)`, `border: 1.5px solid var(--border)`, no dark `#0b0d10` panel
- Header: mono “Botardo”, close button hairline
- Messages: user bubbles with coral left border or solid black; assistant plain
- Input: hairline border, send button solid black
- Open animation: short scale/fade; respect `prefers-reduced-motion`

Expose `window` custom event or `document.querySelectorAll("[data-open-botardo]")` click → open modal.

Keep a11y: `role="dialog"`, `aria-modal`, focus trap basics, Escape to close (as in current widget if present).

Welcome copy can stay Spanish for v1 (spec: reply language follows the message, not UI chrome).

- [ ] **Step 2: Mount in BaseLayout**

```astro
<Botardo />
```

at end of `<body>` (not only a slot), so every page gets it.

- [ ] **Step 3: Manual UI check**

```bash
npm run dev
```

Verify Botardo looks like the site (light, coral, borders) — not the old dark gold widget. Open from floating button and from home CTA.

- [ ] **Step 4: Commit**

```bash
git add src/components/Botardo.astro src/layouts/BaseLayout.astro
git commit -m "$(cat <<'EOF'
feat: add Botardo widget in Señal design system

EOF
)"
```

---

### Task 8: Worker — reply in the user’s language

**Files:**
- Modify: `workers/chat-worker/src/index.ts` (SYSTEM_PROMPT rules)

- [ ] **Step 1: Update language rule in SYSTEM_PROMPT**

Replace rule 1 (currently “Respondé SIEMPRE en español rioplatense…”) with:

```text
1. Respondé en el mismo idioma del último mensaje del usuario (al menos español o inglés).
   - Si escriben en español: español rioplatense (voseo), tono cercano.
   - Si escriben en inglés: inglés claro y profesional, still referring to Ramiro in third person.
   - No fuerces español si la pregunta está en inglés.
```

Keep identity rules (Botardo in first person; Ramiro in third person) and KB-only constraints.

- [ ] **Step 2: Confirm CORS**

`ALLOWED_ORIGIN` is already `https://ramirocerda.vercel.app`. For local dev, either:

- temporarily allow `http://localhost:4321` in addition (array / reflect allowlist), or
- document that Botardo is tested against production origin / `wrangler dev` with preview.

Preferred v1 allowlist:

```ts
const ALLOWED_ORIGINS = new Set([
  "https://ramirocerda.vercel.app",
  "http://localhost:4321",
]);
```

Update CORS headers + origin check to use the set.

- [ ] **Step 3: Deploy worker**

```bash
cd workers/chat-worker
npx wrangler deploy
```

- [ ] **Step 4: Smoke test language**

```bash
curl -s -X POST https://ramirocerda-chat.rami992009.workers.dev/ask \
  -H "Content-Type: application/json" \
  -H "Origin: https://ramirocerda.vercel.app" \
  -d '{"message":"What is Ramiro’s current role?"}'

curl -s -X POST https://ramirocerda-chat.rami992009.workers.dev/ask \
  -H "Content-Type: application/json" \
  -H "Origin: https://ramirocerda.vercel.app" \
  -d '{"message":"¿Cuál es el rol actual de Ramiro?"}'
```

Expected: English reply to English; Spanish reply to Spanish.

- [ ] **Step 5: Commit**

```bash
git add workers/chat-worker/src/index.ts
git commit -m "$(cat <<'EOF'
fix: make Botardo reply in the user’s language

EOF
)"
```

---

### Task 9: Archive monolith, README, Vercel entry

**Files:**
- Move: `index.html` → `archive/index.html`
- Modify: `README.md`, `READY.md` (point to Astro + Botardo)
- Create: `vercel.json` if needed for SPA-less static Astro

- [ ] **Step 1: Archive old site**

```bash
mkdir -p archive
git mv index.html archive/index.html
```

- [ ] **Step 2: Rewrite README** for portfolio structure (Astro, routes, Botardo worker, Señal), remove CV-table-as-homepage framing.

- [ ] **Step 3: Ensure Vercel builds Astro**

`vercel.json` (if framework not auto-detected):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

- [ ] **Step 4: Final build**

```bash
npm run build
```

Expected: no root `index.html` conflict; `dist/es/index.html` and `dist/en/index.html` exist.

- [ ] **Step 5: Commit**

```bash
git add archive README.md READY.md vercel.json
git commit -m "$(cat <<'EOF'
chore: archive CV monolith and document Astro portfolio

EOF
)"
```

---

### Task 10: Deploy + acceptance checklist

- [ ] **Step 1: Push and deploy on Vercel** (or `vercel --prod` if CLI is used).

- [ ] **Step 2: Acceptance checklist (manual)**

| Criterion | Check |
|-----------|-------|
| First viewport is brand + thesis + CTAs, not CV | `/es/` |
| Featured: Mundial, Agents Hub, Knowledge Vault | home |
| About is light trajectory | `/es/about/` |
| All 6 projects have case study pages ES+EN | `/work/...` |
| Notes empty state OK | `/es/notes/` |
| Language toggle preserves path | about/work |
| Botardo UI matches Señal | open widget |
| Botardo EN/ES replies | ask in both languages |
| Free Vercel + Worker still Cloudflare | deploy targets |

- [ ] **Step 3: Fix any P0 gaps from checklist, commit, redeploy**

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Astro SSG on Vercel | 1, 9, 10 |
| ES/EN routes | 1, 3, 5, 6 |
| Home brand composition + featured 3 | 5 |
| About light | 5 |
| Work + case studies (6 projects) | 4, 6 |
| Notes empty | 4, 6 |
| Señal tokens/fonts/motion | 2, 5, 7 |
| Botardo kept + Señal UI hard match | 7 |
| Botardo reply language = user language | 8 |
| Archive old CV HTML | 9 |
| Success criteria smoke | 10 |

No TBD placeholders left in tasks. Featured projects fixed. Botardo design parity is Task 7 hard requirement.
