/**
 * Botardo eval runner: linear (main) vs adaptive RAG on the fixed case set.
 *
 *   pnpm eval              real backends (read-only), prints a markdown table
 *   pnpm eval:decision     REAL decision model (Jev via OpenCode System One, anonymous
 *                          for jev-1.13-free) + stubbed KB/generation: real router
 *                          metrics with no Cloudflare or OpenCode Go credential
 *   pnpm eval:offline      stubs + MOCKED decision model (oracle of the expected labels):
 *                          only plumbing and call counts mean anything, never router quality
 *   pnpm eval:judges       (evals/judge-check.ts) REAL Jev stage judges on FIXTURES, no credentials
 *
 * Options: --cases <path> (default evals/cases.json), --only <id-substring>,
 *          --pipelines linear,adaptive, --no-judge (skip the faithfulness eval, the
 *          only judge that spends generation tokens), --out <dir> (default evals/results).
 *
 * The report is split by stage so a failure can be located: router, 1. retrieval
 * (recall / hit), 2. sufficiency (the adaptive Jev judge), 3. faithfulness (claims
 * extracted by the generation model, each checked by Jev against the chunks that
 * were passed to generation) and 4. abstention (Jev judge on generated replies,
 * canned declines count as abstentions). See evals/stage-judges.ts. The stage
 * judges only run in real mode; `pnpm eval:judges` validates them on fixtures.
 * Linear and adaptive run in the same report; "linear" is main's frozen pipeline,
 * the same behaviour as the adaptive one with DECISION_MODEL="".
 *
 * Real mode needs, as env vars or in the gitignored files the worker already uses
 * (root .env for Cloudflare, workers/chat-worker/.dev.vars for the model keys):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI + Vectorize read),
 *   OPENCODE_GO_API_KEY (generation, claim extraction for the faithfulness eval and
 *   the paid Jev fallback jev-1.13). Decision and offline modes have no real key, so they turn the paid
 *   fallback off (DECISION_FALLBACK_MODEL=""). Router / judge call
 *   counts include paid retries.
 * The decision model config (DECISION_ENDPOINT / DECISION_MODEL / ...) comes from
 * wrangler.jsonc vars, overridable by env vars of the same name.
 * It only calls /ai/run, /vectorize/v2/indexes/<index>/query, the System One
 * decision endpoint and the generation endpoint. It never writes to Vectorize
 * and never deploys anything.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAdaptivePipeline, type PipelineEnv } from "../src/pipeline";
import { instrument, offlineBindings, realBindings, zeroCounters, type MockRouterAnswer } from "./backends";
import { runLinearPipeline } from "./linear-pipeline";
import { markdownTable, summarize, type CaseResult, type EvalCase, type EvalMode, type PipelineName } from "./metrics";
import {
  answerFaithful,
  claimSnippets,
  evalJudgeConfig,
  extractClaims,
  judgeAbstention,
  judgeClaims,
  type AbstentionCheck,
  type ClaimCheck,
} from "./stage-judges";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(EVAL_DIR, "..");
const ROOT_DIR = path.join(WORKER_DIR, "..", "..");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** wrangler.jsonc vars, so the eval runs with exactly the deployed knobs. Full-line // comments only. */
function readWranglerVars(): Record<string, string> {
  const raw = readFileSync(path.join(WORKER_DIR, "wrangler.jsonc"), "utf8");
  const json = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return (JSON.parse(json) as { vars: Record<string, string> }).vars;
}

function loadLocalSecrets(): void {
  const tryLoad = (file: string) => {
    try {
      process.loadEnvFile(file);
    } catch {
      // missing file is fine: explicit env vars always work
    }
  };
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) tryLoad(path.join(ROOT_DIR, ".env"));
  if (!process.env.OPENCODE_GO_API_KEY) {
    tryLoad(path.join(WORKER_DIR, ".dev.vars"));
  }
}

async function main(): Promise<void> {
  const mode: EvalMode = flag("offline") ? "offline" : flag("decision-only") ? "decision" : "real";
  const offline = mode === "offline";
  // Stage judges only grade real answers: decision/offline replies are stubs.
  const useClaims = mode === "real" && !flag("no-judge");
  const useAbstention = mode === "real";
  const casesPath = arg("cases") ?? path.join(EVAL_DIR, "cases.json");
  const only = arg("only");
  const pipelines = (arg("pipelines") ?? "linear,adaptive").split(",") as PipelineName[];
  const outDir = arg("out") ?? path.join(EVAL_DIR, "results");

  const allCases = (JSON.parse(readFileSync(casesPath, "utf8")) as { cases: EvalCase[] }).cases;
  const cases = only ? allCases.filter((c) => c.id.includes(only)) : allCases;
  const vars = readWranglerVars();

  let bindings: Pick<PipelineEnv, "AI" | "VECTORIZE">;
  let apiKey = "offline";
  // Decision config: wrangler vars, overridable from the environment (key only from the environment).
  const decisionVars: Record<string, string> = {};
  for (const k of ["DECISION_ENDPOINT", "DECISION_MODEL", "DECISION_FALLBACK_MODEL", "DECISION_INTEGRATION_ID", "DECISION_TIMEOUT_MS", "DECISION_MIN_CONFIDENCE", "MAX_RETRIEVAL_ITERATIONS"]) {
    const v = process.env[k];
    if (v !== undefined) decisionVars[k] = v;
  }
  if (mode !== "real") {
    bindings = offlineBindings();
    // No real OPENCODE_GO_API_KEY here: never send the "offline" placeholder as a Bearer key.
    decisionVars.DECISION_FALLBACK_MODEL = "";
  } else {
    loadLocalSecrets();
    const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "OPENCODE_GO_API_KEY"];
    const missing = required.filter((k) => !process.env[k]?.trim());
    if (missing.length > 0) {
      console.error(`Missing ${missing.join(", ")}. Export them (or use the root .env / .dev.vars), or run with --offline.`);
      process.exit(2);
    }
    bindings = realBindings({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
      apiToken: process.env.CLOUDFLARE_API_TOKEN!,
      indexName: process.env.VECTORIZE_INDEX ?? "botardo-kb",
    });
    apiKey = process.env.OPENCODE_GO_API_KEY!;
  }

  const envVars = { ...vars, ...decisionVars, OPENCODE_GO_API_KEY: apiKey } as unknown as Omit<PipelineEnv, "AI" | "VECTORIZE">;
  // Same Jev judge config for every pipeline and run, independent of DECISION_MODEL (see evalJudgeConfig).
  const jev = evalJudgeConfig({ ...process.env, apiKey: mode === "real" ? apiKey : null });
  const results: CaseResult[] = [];

  for (const c of cases) {
    for (const pipeline of pipelines) {
      const sessionId = `botardo-eval-${pipeline}-${c.id}`;
      const t0 = Date.now();
      let result: CaseResult;
      try {
        const mockRouter: MockRouterAnswer = {
          route: c.expected.route ?? "search",
          hireIntent: c.expected.offerContact ? 1 : 0,
          needsHistory: c.category === "followup" ? 1 : 0,
        };
        const backend = offline ? { kind: "offline" as const, mockRouter } : { kind: mode as "decision" | "real" };
        const { value, counters } = await instrument(envVars, bindings, backend, async (env) =>
          pipeline === "linear"
            ? { kind: "linear" as const, run: await runLinearPipeline({ message: c.message, history: c.history, env, sessionId }) }
            : {
                kind: "adaptive" as const,
                run: await runAdaptivePipeline({ message: c.message, history: c.history, env, sessionId }),
              },
        );
        const latencyMs = Date.now() - t0;
        const outcome = value.run.outcome;
        const chunks = value.run.chunks;
        let reply: string | null = null;
        let replyKind: CaseResult["replyKind"];
        let abstention: AbstentionCheck | null = null;
        if (outcome.kind === "generated") {
          replyKind = outcome.result.status === 200 ? "generated" : "error";
          reply = outcome.result.status === 200 ? outcome.result.content.trim() : null;
        } else {
          replyKind = outcome.kind;
          reply = outcome.reply;
          // The pipeline's own canned decline: an abstention by construction, no judge call.
          abstention = { abstained: true, confidence: null, via: "canned" };
        }
        // Judges run after `instrument` returned, so they are never counted as pipeline cost.
        if (replyKind === "generated" && reply && useAbstention) {
          abstention = await judgeAbstention(jev, c.message, reply);
        }
        let claims: ClaimCheck[] | null = null;
        let claimError: string | undefined;
        if (replyKind === "generated" && reply && useClaims) {
          const extracted = await extractClaims({
            endpoint: vars.OPENCODE_GO_ENDPOINT,
            apiKey,
            model: process.env.EVAL_JUDGE_MODEL ?? vars.GENERATION_MODEL,
            question: c.message,
            answer: reply,
          });
          if (extracted.ok) claims = await judgeClaims(jev, extracted.claims, claimSnippets(chunks));
          else claimError = extracted.reason;
        }
        result = {
          caseId: c.id,
          pipeline,
          route: value.kind === "adaptive" ? value.run.decision.route : null,
          routeVia: value.kind === "adaptive" ? value.run.decision.via : null,
          routerMs: value.kind === "adaptive" && value.run.decision.via !== "not_configured" ? value.run.routerMs : null,
          offerContact: value.kind === "adaptive" ? value.run.offerContact : false,
          searched: counters.vectorizeQueries > 0,
          chunkIds: chunks.map((ch) => ch.id),
          replyKind,
          reply,
          verdict: value.kind === "adaptive" ? value.run.verdict.kind : null,
          abstained: mode === "real" ? (abstention?.abstained ?? null) : null,
          abstentionVia: mode === "real" ? (abstention?.via ?? null) : null,
          faithful: claims ? answerFaithful(claims) : null,
          claims,
          ...(claimError ? { claimError } : {}),
          latencyMs,
          counters,
        };
      } catch (err) {
        result = {
          caseId: c.id,
          pipeline,
          route: null,
          routeVia: null,
          offerContact: false,
          searched: false,
          chunkIds: [],
          replyKind: "error",
          reply: null,
          abstained: null,
          faithful: null,
          latencyMs: Date.now() - t0,
          counters: zeroCounters(),
          error: err instanceof Error ? err.message : String(err),
        };
      }
      results.push(result);
      console.error(
        `[${pipeline}] ${c.id}: ${result.replyKind}${result.route ? ` route=${result.route}/${result.routeVia} offerContact=${result.offerContact}` : ""} searches=${result.counters.vectorizeQueries} ${result.latencyMs}ms${result.error ? ` error=${result.error}` : ""}`,
      );
    }
  }

  const summaries = {
    linear: summarize("linear", cases, results),
    adaptive: summarize("adaptive", cases, results),
  };
  const decisionModel = `${envVars.DECISION_MODEL ?? "jev-1.13-free"} vía ${envVars.DECISION_ENDPOINT ?? "OpenCode System One"}${mode === "real" && envVars.DECISION_FALLBACK_MODEL !== "" ? ` (fallback pago ${envVars.DECISION_FALLBACK_MODEL ?? "jev-1.13"} con OPENCODE_GO_API_KEY)` : " (sin key, sin fallback pago)"}`;
  const modeText =
    mode === "offline"
      ? "OFFLINE con modelo de decisión MOCKEADO (oráculo: devuelve la ruta y el hire_intent esperados de cada caso; el juez de suficiencia siempre dice insuficiente), Vectorize sin matches y generación stub. Solo son reales el conteo de llamadas bajo esos mocks; nada de esto mide la calidad del router."
      : mode === "decision"
        ? `DECISIÓN REAL (router y juez: ${decisionModel}) con Vectorize sin matches y generación stub. Son reales la ruta, el offerContact, los fallbacks, la latencia y los tokens del router; recall, respuestas y latencia total quedan pendientes.`
        : `REAL (router y juez: ${decisionModel}; Workers AI + Vectorize ${process.env.VECTORIZE_INDEX ?? "botardo-kb"}; generación ${vars.GENERATION_MODEL}; jueces de etapa: abstención Jev ${jev.model}${useClaims ? `, fidelidad = claims con ${process.env.EVAL_JUDGE_MODEL ?? vars.GENERATION_MODEL} + soporte Jev ${jev.model}` : ", fidelidad apagada (--no-judge)"}${jev.fallbackModel ? ` (fallback pago ${jev.fallbackModel})` : ""})`;
  const table = markdownTable(summaries, { mode });
  const report = `### Evals Botardo: lineal vs adaptativo, por etapa\n\nModo: ${modeText}\nCasos: ${cases.length} (${new Date().toISOString()})\n\n${table}\n`;
  console.log(report);

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDir, `${stamp}-${mode}`);
  writeFileSync(`${base}.md`, report);
  writeFileSync(`${base}.json`, JSON.stringify({ mode, summaries, results }, null, 2));
  console.error(`Wrote ${base}.md and ${base}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
