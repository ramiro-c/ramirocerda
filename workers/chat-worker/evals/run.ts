/**
 * Botardo eval runner: linear (main) vs adaptive RAG on the fixed case set.
 *
 *   pnpm eval              real backends (read-only), prints a markdown table
 *   pnpm eval:offline      stubs + MOCKED OpenRouter (oracle of the expected labels):
 *                          only plumbing and call counts mean anything, never router quality
 *
 * Options: --cases <path> (default evals/cases.json), --only <id-substring>,
 *          --pipelines linear,adaptive, --no-judge, --out <dir> (default evals/results).
 *
 * Real mode needs, as env vars or in the gitignored files the worker already uses
 * (root .env for Cloudflare, workers/chat-worker/.dev.vars for the model keys):
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Workers AI + Vectorize read),
 *   OPENCODE_GO_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL.
 * It only calls /ai/run, /vectorize/v2/indexes/<index>/query, OpenRouter chat
 * completions and the generation endpoint. It never writes to Vectorize and
 * never deploys anything.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAdaptivePipeline, type PipelineEnv } from "../src/pipeline";
import { instrument, offlineBindings, realBindings, zeroCounters, type MockRouterAnswer } from "./backends";
import { judgeAnswer } from "./judge";
import { runLinearPipeline } from "./linear-pipeline";
import { markdownTable, summarize, type CaseResult, type EvalCase, type PipelineName } from "./metrics";

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
  if (!process.env.OPENCODE_GO_API_KEY || !process.env.OPENROUTER_API_KEY || !process.env.OPENROUTER_MODEL) {
    tryLoad(path.join(WORKER_DIR, ".dev.vars"));
  }
}

async function main(): Promise<void> {
  const offline = flag("offline");
  const useJudge = !offline && !flag("no-judge");
  const casesPath = arg("cases") ?? path.join(EVAL_DIR, "cases.json");
  const only = arg("only");
  const pipelines = (arg("pipelines") ?? "linear,adaptive").split(",") as PipelineName[];
  const outDir = arg("out") ?? path.join(EVAL_DIR, "results");

  const allCases = (JSON.parse(readFileSync(casesPath, "utf8")) as { cases: EvalCase[] }).cases;
  const cases = only ? allCases.filter((c) => c.id.includes(only)) : allCases;
  const vars = readWranglerVars();

  let bindings: Pick<PipelineEnv, "AI" | "VECTORIZE">;
  let apiKey = "offline";
  let openRouter = { OPENROUTER_API_KEY: "offline-mock", OPENROUTER_MODEL: "offline/mock" };
  if (offline) {
    bindings = offlineBindings();
  } else {
    loadLocalSecrets();
    const required = ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "OPENCODE_GO_API_KEY", "OPENROUTER_API_KEY", "OPENROUTER_MODEL"];
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
    openRouter = { OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY!, OPENROUTER_MODEL: process.env.OPENROUTER_MODEL!.trim() };
  }

  const envVars = { ...vars, ...openRouter, OPENCODE_GO_API_KEY: apiKey } as unknown as Omit<PipelineEnv, "AI" | "VECTORIZE">;
  const rawFetch = globalThis.fetch;
  const results: CaseResult[] = [];

  for (const c of cases) {
    for (const pipeline of pipelines) {
      const sessionId = `botardo-eval-${pipeline}-${c.id}`;
      const t0 = Date.now();
      let result: CaseResult;
      try {
        const mockRouter: MockRouterAnswer = {
          route: c.expected.route ?? "search",
          hire_intent: c.expected.offerContact ?? false,
          query: c.message,
        };
        const { value, counters } = await instrument(envVars, bindings, offline ? { mockRouter } : null, async (env) =>
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
        let declined: boolean | null = null;
        if (outcome.kind === "generated") {
          replyKind = outcome.result.status === 200 ? "generated" : "error";
          reply = outcome.result.status === 200 ? outcome.result.content.trim() : null;
        } else {
          replyKind = outcome.kind;
          reply = outcome.reply;
          declined = true;
        }
        let faithful: boolean | null = null;
        if (replyKind === "generated" && reply && useJudge) {
          const verdict = await judgeAnswer({
            fetchImpl: rawFetch,
            endpoint: vars.OPENCODE_GO_ENDPOINT,
            apiKey,
            model: process.env.EVAL_JUDGE_MODEL ?? vars.GENERATION_MODEL,
            question: c.message,
            answer: reply,
            chunks,
          });
          if (verdict) {
            faithful = verdict.faithful;
            declined = verdict.declined;
          }
        }
        result = {
          caseId: c.id,
          pipeline,
          route: value.kind === "adaptive" ? value.run.decision.route : null,
          routeVia: value.kind === "adaptive" ? value.run.decision.via : null,
          offerContact: value.kind === "adaptive" ? value.run.offerContact : false,
          searched: counters.vectorizeQueries > 0,
          chunkIds: chunks.map((ch) => ch.id),
          replyKind,
          reply,
          declined,
          faithful,
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
          declined: null,
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
  const mode = offline
    ? "OFFLINE con OpenRouter MOCKEADO (oráculo: devuelve la ruta y el hire_intent esperados de cada caso; el juez de suficiencia siempre pide una re-búsqueda), Vectorize sin matches y generación stub. Solo son reales el conteo de llamadas bajo esos mocks; nada de esto mide la calidad del router."
    : `REAL (router y juez: OpenRouter ${openRouter.OPENROUTER_MODEL}; Workers AI + Vectorize ${process.env.VECTORIZE_INDEX ?? "botardo-kb"}; generación ${vars.GENERATION_MODEL}${useJudge ? "; juez de fidelidad LLM" : "; sin juez de fidelidad"})`;
  const table = markdownTable(summaries, { offline });
  const report = `### Evals Botardo: lineal vs adaptativo\n\nModo: ${mode}\nCasos: ${cases.length} (${new Date().toISOString()})\n\n${table}\n`;
  console.log(report);

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDir, `${stamp}-${offline ? "offline" : "real"}`);
  writeFileSync(`${base}.md`, report);
  writeFileSync(`${base}.json`, JSON.stringify({ mode: offline ? "offline" : "real", summaries, results }, null, 2));
  console.error(`Wrote ${base}.md and ${base}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
