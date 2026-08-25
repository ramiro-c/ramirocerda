# Home Redesign (Prototipo D) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the home page (`/` and `/en/`) as a narrative-first layout: poster hero → about/stack intro band → 2-column project card grid.

**Architecture:** Markup + scoped styles live in the two page files; `ProjectList` gains a `variant` prop so `/work/` keeps its list style; new copy goes into the flat i18n map in `src/i18n/ui.ts`. No new dependencies, no test framework (static Astro site) — verification is `pnpm build` plus rendered-output checks.

**Tech Stack:** Astro 5, scoped component styles, existing design tokens in `src/styles/global.css`.

**Spec:** `docs/superpowers/specs/2026-08-24-home-redesign-design.md`

---

### Task 1: Add i18n keys

**Files:**
- Modify: `src/i18n/ui.ts`

- [ ] **Step 1: Add the five keys to the `es` locale**

In `src/i18n/ui.ts`, inside `es: { ... }`, immediately after the line `"home.notesEmpty": "Pronto notas.",`, insert:

```ts
    "home.aboutLabel": "Sobre mí",
    "home.aboutText":
      "Ingeniero full-stack en Buenos Aires. Construyo productos web rápidos y observables, y llevo agentes de IA de la idea a producción: arquitectura, código y deploy.",
    "home.stackLabel": "Stack",
    "home.statusAvailable": "Disponible para proyectos",
    "home.location": "Buenos Aires · UTC-3",
```

- [ ] **Step 2: Add the five keys to the `en` locale**

Inside `en: { ... }`, immediately after the line `"home.notesEmpty": "Notes coming soon.",`, insert:

```ts
    "home.aboutLabel": "About me",
    "home.aboutText":
      "Full-stack engineer based in Buenos Aires. I build fast, observable web products and take AI agents from idea to production: architecture, code, and deploy.",
    "home.stackLabel": "Stack",
    "home.statusAvailable": "Available for projects",
    "home.location": "Buenos Aires · UTC-3",
```

- [ ] **Step 3: Verify types still compile**

Run: `pnpm build`
Expected: build succeeds (Astro type-checks frontmatter via the compiler; any typo in keys surfaces here or in Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/ui.ts
git commit -m "feat(i18n): add home about/stack/status keys"
```

---

### Task 2: ProjectList grid variant

**Files:**
- Modify: `src/components/ProjectList.astro`

- [ ] **Step 1: Add the `variant` prop**

Replace the existing `Props` interface and destructuring:

```astro
interface Props {
  lang: Lang;
  items: Item[];
}
const { lang, items } = Astro.props;
```

with:

```astro
interface Props {
  lang: Lang;
  items: Item[];
  variant?: "list" | "grid";
}
const { lang, items, variant = "list" } = Astro.props;
```

- [ ] **Step 2: Toggle the class on the `<ul>`**

Replace `<ul class="list">` with:

```astro
<ul class:list={["list", { grid: variant === "grid" }]}>
```

- [ ] **Step 3: Add grid styles**

Inside the `<style>` block, after the existing `.list li a:hover { transform: translateX(4px); }` rule, add:

```css
.list.grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.list.grid li a {
  border-left: none;
  border: 1.5px solid var(--border);
  padding: 1.25rem;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.list.grid li a:hover {
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 var(--accent);
}
.list.grid .summary {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@media (max-width: 768px) {
  .list.grid {
    grid-template-columns: 1fr;
  }
}
```

Then update the existing `prefers-reduced-motion` block from:

```css
@media (prefers-reduced-motion: reduce) {
  .list li a {
    transition: none;
  }
  .list li a:hover {
    transform: none;
  }
}
```

to:

```css
@media (prefers-reduced-motion: reduce) {
  .list li a {
    transition: none;
  }
  .list li a:hover {
    transform: none;
    box-shadow: none;
  }
}
```

(The selectors already cover the grid because they target `.list li a` regardless of variant.)

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: success. No consumer passes `variant` yet, so output is unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectList.astro
git commit -m "feat(components): add grid variant to ProjectList"
```

---

### Task 3: Poster home page (es)

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Update the frontmatter**

After `const t = useTranslations(lang);` add the stack array and thesis split:

```astro
const STACK = [
  "TypeScript",
  "React",
  "Astro",
  "Node.js",
  "Python",
  "FastAPI",
  "PostgreSQL",
  "Cloudflare",
];

const thesis = t("home.thesis");
const lastSpace = thesis.lastIndexOf(" ");
const thesisHead = lastSpace === -1 ? "" : thesis.slice(0, lastSpace);
const thesisTail = thesis.slice(lastSpace + 1);
```

The rest of the frontmatter (projects query) is unchanged.

- [ ] **Step 2: Replace the hero section markup**

Replace everything between `<SiteHeader slot="header" lang={lang} />` and the closing `</section>` of `.hero` with:

```astro
<section class="hero">
  <p class="brand-line mono">{t("home.brand")}</p>
  <h1 class="display">
    {thesisHead && <span class="line">{thesisHead}</span>}
    <span class="line accent">{thesisTail}</span>
  </h1>
  <div class="poster-row">
    <p class="support">{t("home.support")}</p>
    <div class="ctas">
      <a class="btn solid" href="mailto:rami992009@gmail.com">{t("cta.email")}</a>
      <a class="btn" href={getLocalizedPath(lang, "/work/")}>{t("cta.work")}</a>
      <button class="btn" type="button" data-open-botardo>{t("cta.botardo")}</button>
    </div>
  </div>
  <p class="status-chip mono">
    <span class="chip-dot" aria-hidden="true"></span>
    {t("home.statusAvailable")}
    <span class="chip-sep" aria-hidden="true">·</span>
    {t("home.location")}
  </p>
</section>

<section class="intro">
  <div>
    <p class="mono label">{t("home.aboutLabel")}</p>
    <p class="about-text">{t("home.aboutText")}</p>
    <a class="more-link" href={getLocalizedPath(lang, "/about/")}>{t("nav.about")} →</a>
  </div>
  <div>
    <p class="mono label">{t("home.stackLabel")}</p>
    <ul class="stack-list">
      {STACK.map((tech) => (
        <li class="tag mono">{tech}</li>
      ))}
    </ul>
  </div>
</section>
```

- [ ] **Step 3: Pass the grid variant to ProjectList**

Change `<ProjectList lang={lang} items={projects} />` to:

```astro
<ProjectList lang={lang} items={projects} variant="grid" />
```

- [ ] **Step 4: Update the scoped styles**

In the `<style>` block replace the old `.hero`, `.display`, `.support` rules and keep everything else. Final style block:

```css
.hero {
  padding: 1rem 0 2rem;
  border-bottom: 3px solid var(--border);
}
.brand-line {
  margin: 0 0 0.75rem;
  color: var(--muted-2);
  font-size: 0.9rem;
}
.display {
  margin: 0 0 1.75rem;
  font-size: clamp(3rem, 10vw, 6.5rem);
}
.display .line {
  display: block;
}
.accent {
  color: var(--accent);
}
.poster-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;
}
.support {
  max-width: 34rem;
  color: var(--muted);
  margin: 0;
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
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.75rem 0 0;
  padding: 0.4rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.intro {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 2rem;
  padding: 2rem 0;
  border-bottom: 1px solid var(--border);
}
.about-text {
  color: var(--muted);
  margin: 0 0 0.75rem;
}
.stack-list {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0;
  margin: 0;
}
.stack-list .tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--muted);
}
.block {
  margin: 2.5rem 0;
}
.label {
  font-size: 0.8rem;
  color: var(--muted-2);
  margin-bottom: 0.75rem;
}
.more {
  margin: 1rem 0 0;
}
.more-link {
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.1rem;
}
.more-link:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.empty {
  color: var(--muted);
}
@media (max-width: 768px) {
  .intro {
    grid-template-columns: 1fr;
  }
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
```

- [ ] **Step 5: Build and inspect output**

Run: `pnpm build`
Expected: success.

Run: `grep -o "Disponible para proyectos" dist/index.html | head -n1`
Expected: `Disponible para proyectos`

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(home): narrative-first poster layout"
```

---

### Task 4: Mirror on /en/

**Files:**
- Modify: `src/pages/en/index.astro`

- [ ] **Step 1: Apply the identical changes as Task 3**

`src/pages/en/index.astro` is byte-identical to the pre-change `src/pages/index.astro` except: imports use `../../` instead of `../`, and `const lang = "en";`. Apply exactly the same three edits — frontmatter additions, hero/intro markup replacement, `variant="grid"` prop, and the full style block from Task 3 Step 4. The only differences in this file remain the import paths and the `lang` value; all rendered strings come from `t()` so nothing is hardcoded per language except the mailto (same address).

- [ ] **Step 2: Build and inspect output**

Run: `pnpm build`
Expected: success.

Run: `grep -o "Available for projects" dist/en/index.html | head -n1`
Expected: `Available for projects`

- [ ] **Step 3: Confirm /work/ is untouched**

Run: `grep -c 'class="list "' dist/work/index.html || grep -c '"list"' dist/work/index.html`
Expected: matches exist and do NOT contain `grid` in the ul class. Quick check:

```bash
grep -o '<ul class="[^"]*"' dist/work/index.html
```
Expected: `<ul class="list">` (no `grid`).

Also verify the English twin: `grep -o '<ul class="[^"]*"' dist/en/work/index.html` → `<ul class="list">`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/en/index.astro
git commit -m "feat(home): mirror poster layout on /en/"
```

---

### Task 5: Visual check and cleanup

**Files:**
- Delete: `prototypes/home-a.html`, `prototypes/home-b.html`, `prototypes/home-c.html`, `prototypes/home-d.html`

- [ ] **Step 1: Visual smoke test**

Run: `pnpm dev` and open `http://localhost:4321/`.
Check: two-line headline with accent tail, thick hero rule, chip below CTAs row, about|stack band, 2-column bordered cards with hard-shadow hover, single column at ~400px viewport width.
Repeat at `/en/`.

- [ ] **Step 2: Delete prototypes after user confirmation**

Only after the user confirms the result looks right:

```bash
rm prototypes/home-a.html prototypes/home-b.html prototypes/home-c.html prototypes/home-d.html && rmdir prototypes 2>/dev/null; true
git add -A prototypes
git commit -m "chore: remove throwaway home prototypes"
```

(If the user wants changes first, iterate before deleting.)

---

## Self-review notes

- Spec coverage: poster hero (T3), status chip (T3), intro band (T3), grid cards via variant prop keeping /work/ intact (T2), i18n keys (T1), both languages (T3+T4), responsive 768px (T2+T3), reduced-motion preserved (T3 keeps animation guard, T2 extends reduce block).
- No placeholders: every code step shows final code.
- Type consistency: `variant?: "list" | "grid"` defined in T2, consumed as `variant="grid"` in T3/T4; i18n key names match between T1 and T3 usage.
