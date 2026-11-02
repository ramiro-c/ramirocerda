# pnpm → Bun + oxlint migration (tooling)

Objective: replace pnpm/package-managing with Bun and add oxlint as repo linter. Update tooling/CI/docs accordingly.
Branch PR1: `chore/oxlint` (Phase 1, done). Branch PR2: stacked `chore/bun-migration` (Phase 2). Test runner: worker vitest; root node:test moved to `bun test`.

Delivery strategy: stacked PRs (user-directed). PR1 → main; PR2 → chore/oxlint.

## Specs

S1. User request, verbatim: "me gustaria migrar a bun y oxlint" — migrate package management to Bun and linting to oxlint.
S2. Phase 1 (done, verified): oxlint ^1.90.0 devDependency, `.oxlintrc.json` (correctness=error, suspicious=warn, no-unused-vars with ignoreRestSiblings + argsIgnorePattern "^_"), `lint` script, `.github/workflows/lint.yml` gate, AGENTS.md Operations line. Lint exit 0 (46 intentional style warnings). Worker typecheck clean; vitest 285/285.
S3. Phase 1 also fixed a latent bug (user-approved direction): `populate-index.mjs` YAML key regex `\S` inside template compiled as literal `S`; now `\\S` so the regex gets real `\S`.
S4. Bun migration must preserve resolved versions: convert `pnpm-lock.yaml` via `bun pm migrate` (lockfile 7–9 incl. pnpm 11 multi-doc → `bun.lock`, workspaces list moved to root package.json).
S5. Critical: allowBuilds [esbuild, sharp, workerd] from `pnpm-workspace.yaml` must end up in root `package.json` `trustedDependencies` — if not auto-converted, add manually before first `bun install`.
S6. `minimumReleaseAgeExclude` [miniflare@5.20261023.3-beta, wrangler@4.156.0] must become bunfig.toml `[install] minimumReleaseAgeExcludes`.
S7. Scripts referencing pnpm (`pnpm --filter ramirocerda-chat-worker eval`, AGENTS.md `pnpm chat:populate`, DEPLOY.md) become bun equivalents; delete `pnpm-workspace.yaml` and `pnpm-lock.yaml`; remove `packageManager` pnpm field.
S8. `vercel.json` buildCommand → `bun run build`.
S9. All GitHub workflows: `pnpm/action-setup` + setup-node/pnpm-cache → `oven-sh/setup-bun`, cache bun; `pnpm install --frozen-lockfile [--filter X]` → `bun install --frozen-lockfile [--filter X]`; `pnpm --filter X test/typecheck` → `bun --filter X test/typecheck`; root `node --test ...` → `bun test` with explicit file list (root + src/scripts tests; do NOT let bun test discover worker vitest/* test suites).
S10. Verification before PR2: `pnpm run lint` (or bun run lint), `bun run build`, `bun test <root+script tests>`, `bun --filter ramirocerda-chat-worker typecheck`, `bun --filter ramirocerda-chat-worker test` all green; grep for residual pnpm references updated in docs.
S11. Do not force `--bun` runtime for Astro/vitest/wrangler/tsx binaries (node shebang respected); keep semantics.
S12. Both PRs use Conventional Commits, no AI attribution; PR bodies include summary/changes table/test plan; PR2 adds chain context (stacked on PR1) with dependency diagram.

## Tasks

- T1 (S2,S3) route: inline+delegated, DONE — lint setup + fixes; evidence: lint exit 0, vitest 285/285.
- T2 (S4..S7) route: inline, DONE — commit c9dee61. Evidence: `bun install --frozen-lockfile` resolves 688 packages from bun.lock; `bun run lint` exit 0; no residual pnpm refs in README/AGENTS/DEPLOY/fixtures.
- T3 (S8..S10) route: inline, DONE — commit bb27d3e. Evidence: 5 workflows parse as valid YAML; no pnpm refs left under `.github/`.
- T4 (S10,S11,S12) route: inline verification, DONE except PR2 — evidence: `bun run build` 57 pages; `bun test <4 files>` 19/19 (parity with `node --test` 19/19); `bun run --filter ramirocerda-chat-worker typecheck` exit 0; `bun run --filter ramirocerda-chat-worker test` 19 files / 285 tests; `bun run lint` exit 0.

## Log

- L1: "me gustaria migrar a bun y oxlint, quiero que investigues con context7 y me des proximos pasos a seguir o que deberia cambiar, que se romperia y esas cosas" (investigation; Context7 research done, plan delivered).
- L2: "test runner tampoco tengo, capaz puedo usar bun? no se" — answered: bun test for root node:test files; worker keeps vitest.
- L3: "hacete un pull de main y empeza con esto" — pulled main (d92c4e2), Phase 1 implemented, checks green, left uncommitted on chore/oxlint.
- L4: "commitea todo + PR y hacete un stack PR con la fase dos. utiliza free models para todo, vos solo orquesta" — orchestration with free-model workers: PR1 (Phase 1) to main; stacked PR2 (Phase 2) on chore/oxlint.
- Assumptions (marked): bun may need upgrade to ≥1.4 for `bun pm migrate`; Vercel chooses installer by lockfile (verified against Vercel docs assumption, unverified on live project).
- L5 (2026-11-02): "lets continue" — resumed on chore/bun-migration. Found `bun pm migrate` had already produced bun.lock on bun 1.3.12 (the ≥1.4 assumption was wrong: migration works on 1.3.x). Delegation unavailable in this runtime (`subagent` permission denied; only a read-only `vision` agent exists), so T2/T3/T4 ran inline on the free orchestrator model.
- L6 (2026-11-02, correction): S9/S10 wrote `bun --filter <pkg> run <script>`, which fails with "No packages matched the filter" on bun 1.3.12. The working form is `bun run --filter <pkg> <script>`; `bun install --frozen-lockfile --filter <pkg>` does work as written. All script, workflow, doc and fixture references were corrected before commit.
