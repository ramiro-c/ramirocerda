# AI Engineer positioning — feature document

**Objective**: make the public surface (site + GitHub) read as "AI systems engineer who ships verifiable agents" instead of "full-stack dev with AI side projects", and ship one real public asset (a deterministic eval harness) that backs the claim.

**Branch**: `feat/ai-engineer-positioning` (site repo `ramiro-c/ramirocerda`); separate branches in `ramiro-c/agent-evals` (new) and `ramiro-c/ramiro-c` (profile).

**Delivery strategy**: chained PRs, one per work unit, across four repos. PRs stay open for the owner; no merge, no publish, no deploy.

**Test runner**: `pnpm build` (site), `pytest` (harness), `gh api` read-back for GitHub metadata.

## Specs

### S1 — Positioning (from the owner's own words)

> "me quiero posicionar como AI engineer tambien, como podria hacerlo?"

> "el resto me gusta, quiero que ambos, haceme los drafts y los PRs que yo mañana reviso todo"

Scope: the site's hero line, the about bio and the GitHub profile README must name AI engineering as the discipline, with the deterministic-evals / grounding-with-permissions / factory-engineering pillars as the differentiator. Full-stack stays as the substrate, not as the headline.

Acceptance: `home.thesis` (es+en) no longer reads only "Full-Stack Engineer."; the about bio states the AI discipline and the differentiator; the profile README states the same positioning. Checks: `pnpm build`; read-back of the rendered strings.

Assumption (not requested, flagged for review): the exact wording is drafted by the agent and left for the owner to tune.

### S2 — Public eval-harness asset

> "Convertí el harness de evals en activo público??"

> "estoy abierto a cualquiera jajala"

> "quiero que ambos"

Scope: a standalone, public, framework-agnostic Python package that verifies agent behaviour deterministically, without an LLM judge: golden-case format, graders (expected tools, numeric grounding, unsupported claims, language, forbidden content), a runner with pass-rate threshold and non-zero exit, tests, CI, and a README that teaches the method and states its limits. The real implementation lives in the private LDP repo and must not be copied; only the method and a synthetic example ship.

Acceptance: `pytest` green locally and in CI; zero network dependency in tests; the README states what deterministic evals cannot detect and when an LLM judge is still required.

### S3 — GitHub and site curation

> "algo que quiero hacer es limpiar/ acomodar los proyectos que tengo en mi github / pagina web, asi me ven mas como ai engineer que como dev, o por lo menos con mis proyectos mas interesantes"

> "hay muchos que todavia son cascarones, no los empece, son proyectos que quiero armar para mi portolio"

Scope:
- Shell repositories (README-only, no code) leave the GitHub profile until they have code. Archiving is reversible (`gh repo unarchive <name>`), and the shell roadmap is preserved as a tracked list.
- Repositories with real code that are missing from the site get site entries: `spec-refinery`, `orquestador-langgraph`, `rag-citation-agent`.
- The site work list leads with the AI systems and separates them from the remaining work instead of one flat list.
- Repositories with real code and no description get one; the profile README pins the flagship set.

Acceptance: every repository linked from the site is public and reachable; `/work` shows the AI systems first and labels the rest; the shell roadmap is listed in the profile repo with its unarchive command.

### S4 — Drafts for the owner to review

Scope: LinkedIn drafts (one long technical post, one short post, one headline/profile variant set) written in the owner's voice, plus the GitHub cleanup script and a cleanup report. Drafts are files under `odd/drafts/`, not published anywhere.

Acceptance: the owner can copy-paste each draft; nothing is posted to LinkedIn by the agent; every mutation the agent performed on GitHub is listed with its undo command.

## Tasks

| ID | Specs | Route | Work unit | Status |
|----|-------|-------|-----------|--------|
| T1 | S2 | delegated writer | New public repo `ramiro-c/agent-evals`: harness, graders, runner, tests, CI, README | pending |
| T2 | S1, S3 | inline | Site positioning: hero, support line, about bio (es+en) | pending |
| T3 | S3 | inline | Site curation: reorder `/work`, tier AI systems vs the rest, add `spec-refinery`, `orquestador-langgraph`, `rag-citation-agent` entries | pending |
| T4 | S1, S2 | inline | Site note (es+en): "Testear agentes sin juez LLM", linked to the harness | pending |
| T5 | S3 | inline | GitHub cleanup: descriptions, topics, pins, push `rag-citation-agent` code, archive shells and stale course repos (reversible) | pending |
| T6 | S1, S3, S4 | inline | Profile repo `ramiro-c/ramiro-c`: README, pinned repos, shell roadmap, cleanup script + report | pending |
| T7 | S4 | inline | LinkedIn drafts (long post, short post, headline set) in the owner's voice | pending |

Route note: T1 is delegated because it is an isolated new repository (disjoint edit surface) and a fresh context protects the parent's context during a multi-file build. Every other unit stays inline because it needs the owner's editorial judgment and the site's conventions.

## Log

- L1 (2026-10-21): "me quiero posicionar como AI engineer tambien, como podria hacerlo?"
- L2 (2026-10-22): "Convertí el harness de evals en activo público??" — asked for clarification of the public-asset proposal.
- L3 (2026-10-22): "estoy abierto a cualquiera jajaja / el resto me gusta, quiero que ambos, haceme los drafts y los PRs que yo mañana reviso todo" — both variants approved; drafts and PRs to be produced for review the next day.
- L4 (2026-10-22): "algo que quiero hacer es limpiar/ acomodar los proyectos que tengo en mi github / pagina web, asi me ven mas como ai engineer que como dev, o por lo menos con mis proyectos mas interesante"
- L5 (2026-10-22): "hay muchos que todavia son cascarones, no los empece, son proyectos que quiero armar para mi portolio" — the shell repositories are a roadmap, not garbage. Decision: archive them (reversible) and keep the roadmap tracked in the profile repo, instead of deleting or leaving them as README-only padding.
- D1 (2026-10-22): decision — the GitHub profile README and the `/work` tiering are the two highest-leverage surfaces; the site's copy change alone is not enough while the profile shows 10 README-only "AI agent" repositories.
- D2 (2026-10-22): decision — archive, never delete. Every archive is listed with its undo command in the cleanup report.
- Open question for the owner (not blocking): employment/contract positioning versus being found as a product founder. The drafts hedge both; the owner picks.
