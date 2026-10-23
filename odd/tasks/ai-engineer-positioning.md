# AI Engineer positioning — feature document

**Objective**: make the public surface (site + GitHub) read as "AI engineer who ships verifiable agents" instead of "full-stack dev with AI side projects", and ship one real public asset (a deterministic eval harness) that backs the claim.

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
| T1 | S2 | inline (route change, see L6) | New public repo `ramiro-c/agent-evals`: harness, graders, runner, tests, CI, README | done — commits `588411b` (main), `e76804e`+`449d2fb` (feat/harness); 36/36 tests green; PR-A open |
| T2 | S1, S3 | inline | Site positioning: hero, support line, about bio (es+en) | done — commit `d171df1` |
| T3 | S3 | inline | Site curation: reorder `/work`, tier AI systems vs the rest, add `spec-refinery`, `orquestador-langgraph`, `rag-citation-agent` entries | done — commit `d171df1` |
| T4 | S1, S2 | inline | Site note (es+en): "Testear agentes sin juez LLM", linked to the harness | done — commit `48dd13f`, example reconciled with the real harness CLI in `e3f254c` |
| T5 | S3 | inline | GitHub cleanup: descriptions, topics, push `rag-citation-agent` code, archive shells and stale course repos (reversible) | done — 33 archives + 6 descriptions + 14 topics + push to `rag-citation-agent` main; log + undos in `odd/drafts/github-cleanup-log.txt` |
| T6 | S1, S3, S4 | inline | Profile repo `ramiro-c/ramiro-c`: README, shell roadmap, cleanup script + runbook | done — PR-D open (`ramiro-c/pull/1`); pins are manual (see L7) |
| T7 | S4 | inline | LinkedIn drafts (long post, short post, headline set) in the owner's voice | done — 3 drafts + headline copy in `odd/drafts/`, commit `02330dd`; nothing posted |

Route note: T1 was planned as delegated but the worker backend was unavailable for the whole session (two launches failed with `Model unavailable: opencode-go/minimax-m3.1-flash-free`), so it moved inline (see Log L6). Every other unit stays inline because it needs the owner's editorial judgment and the site's conventions.

## Log

- L1 (2026-10-21): "me quiero posicionar como AI engineer tambien, como podria hacerlo?"
- L2 (2026-10-22): "Convertí el harness de evals en activo público??" — asked for clarification of the public-asset proposal.
- L3 (2026-10-22): "estoy abierto a cualquiera jajaja / el resto me gusta, quiero que ambos, haceme los drafts y los PRs que yo mañana reviso todo" — both variants approved; drafts and PRs to be produced for review the next day.
- L4 (2026-10-22): "algo que quiero hacer es limpiar/ acomodar los proyectos que tengo en mi github / pagina web, asi me ven mas como ai engineer que como dev, o por lo menos con mis proyectos mas interesante"
- L5 (2026-10-22): "hay muchos que todavia son cascarones, no los empece, son proyectos que quiero armar para mi portolio" — the shell repositories are a roadmap, not garbage. Decision: archive them (reversible) and keep the roadmap tracked in the profile repo, instead of deleting or leaving them as README-only padding.
- D1 (2026-10-22): decision — the GitHub profile README and the `/work` tiering are the two highest-leverage surfaces; the site's copy change alone is not enough while the profile shows 10 README-only "AI agent" repositories.
- D2 (2026-10-22): decision — archive, never delete. Every archive is listed with its undo command in the cleanup report.
- L6 (2026-10-22): route change on T1 — the worker backend was unavailable all session (`Model unavailable: opencode-go/minimax-m3.1-flash-free`, two launches died), so the harness was built inline following the ODD path: scaffold on `main` (`588411b`), tests first (RED observed: `ModuleNotFoundError: agent_evals.case`), then implementation GREEN 36/36, then example + docs (`e76804e`, `449d2fb`). Deliverables: repo https://github.com/ramiro-c/agent-evals (public), PR-A https://github.com/ramiro-c/agent-evals/pull/1 (feat/harness → main, not merged).
- L7 (2026-10-22): scriptability findings worth remembering for the next cleanup. (a) Pinned repositories are not in the GitHub GraphQL `Mutation` schema (no `pinRepository`; only `pinIssue`/`pinEnvironment` exist; REST probe `user/featured_items` → 404), so the pin set is a manual UI step: pin `agent-evals`, `spec-refinery`, `rag-citation-agent`; unpin `mini-projects`, `linkedin-markdownificator`, `worldcup-2026`. (b) Updating the profile bio via REST PATCH `/user` requires the `user` OAuth scope (`gh auth refresh -h github.com -s user`, interactive); old bio kept as undo: "Ingeniero en Sistemas | Fullstack Developer | Software Engineer". (c) SECURITY finding (not touched, archive-never-delete policy): public repo `newlogic` has a committed `.env` with SMTP credentials (SMTP_USER/SMTP_PASS keys) since 2020; archived now, but the file stays public in history — recommend rotating/disabling that SMTP account and considering history removal as an owner decision. (d) `gh repo edit <bare-name>` needs the `[HOST/]OWNER/REPO` format (first run failed for all 6 descriptions + 14 topics; retry with `ramiro-c/` prefix succeeded).
- L8 (2026-10-22): note example reconciliation — the site note (es+en) now shows the real case format (JSON with `expected_tool_args`/`expected_facts`/`expected_numbers`), the six real grader names and the real CLI (`PYTHONPATH=src python3 -m agent_evals.cli cases.json --threshold 1.0`), replacing the invented YAML from the first draft. Commit `e3f254c`. Builds 51 pages.
- Open question for the owner (not blocking): employment/contract positioning versus being found as a product founder. The drafts hedge both; the owner picks.
- L9 (2026-10-22): voice pass on the site note (es+en) — removed slop phrases ('no quiero vender humo', 'Mi regla:', 'Cerrando: los agentes no se testearon con mocks...') and the aphorism closer; rewrote in About register (clear Spanish, light vos, numbers intact). Commit `905173f`. Build 51 páginas OK.
- Open items left for the owner (review day): merge or tune PR-A (agent-evals#1) and PR-D (ramiro-c#1); edit pins in the profile UI; decide on the bio (`gh auth refresh -h github.com -s user` first); decide on the `newlogic` SMTP credential rotation; LinkedIn drafts in `odd/drafts/` are paste-ready but nothing was posted.
