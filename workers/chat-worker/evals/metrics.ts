/**
 * Pure metric aggregation for the eval runner (no I/O), unit-tested in metrics.test.ts.
 */

import type { Counters } from "./backends";

export type PipelineName = "linear" | "adaptive";
/** offline: everything mocked; decision: real decision model + stubbed KB/generation; real: everything real. */
export type EvalMode = "offline" | "decision" | "real";

export interface EvalCase {
  id: string;
  category: "smalltalk" | "kb" | "followup" | "off_topic" | "unanswerable" | "hire";
  lang: "es" | "en";
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  expected: {
    route: "search" | "smalltalk" | "off_topic" | null;
    retrieve: boolean | null;
    answerable: boolean | null;
    expectedChunks?: string[];
    expectedFacts?: string[];
    /** Expected AskResponse.offerContact (router hire_intent); null = not graded. */
    offerContact: boolean | null;
  };
}

export interface CaseResult {
  caseId: string;
  pipeline: PipelineName;
  /** Adaptive only. */
  route: string | null;
  routeVia: string | null;
  /** Adaptive only: wall time of the router request (ms). */
  routerMs?: number | null;
  /** AskResponse.offerContact. The linear pipeline has no router: always false. */
  offerContact: boolean;
  searched: boolean;
  chunkIds: string[];
  replyKind: "off_topic" | "no_info" | "generated" | "error";
  reply: string | null;
  /** true/false when known (canned decline, or judge verdict); null when not judged. */
  declined: boolean | null;
  /** Judge verdict on generated answers; null otherwise. */
  faithful: boolean | null;
  latencyMs: number;
  counters: Counters;
  error?: string;
}

export function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** A chunk-id prefix matches "prefix" itself or "prefix-<hash>". */
export function chunkRecall(expectedPrefixes: string[], chunkIds: string[]): number {
  if (expectedPrefixes.length === 0) return 1;
  const hits = expectedPrefixes.filter((p) => chunkIds.some((id) => id === p || id.startsWith(`${p}-`)));
  return hits.length / expectedPrefixes.length;
}

/** Any expected fact (case/accent-insensitive substring) present in the reply. */
export function factHit(expectedFacts: string[], reply: string | null): boolean {
  if (!reply) return false;
  const r = fold(reply);
  return expectedFacts.some((f) => r.includes(fold(f)));
}

export interface Ratio {
  hits: number;
  total: number;
}

function ratio(values: boolean[]): Ratio {
  return { hits: values.filter(Boolean).length, total: values.length };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface PipelineSummary {
  cases: number;
  errors: number;
  retrievalDecision: Ratio;
  route: Ratio | null;
  offerContact: Ratio;
  /** Router answers that were NOT a valid LLM decision (error, timeout, invalid JSON). */
  routerFallbacks: Ratio | null;
  recall: { mean: number; total: number };
  facts: Ratio;
  faithfulness: Ratio;
  noInfoCorrect: Ratio;
  latency: { p50: number; p95: number; mean: number };
  /** Adaptive: router request latency; null when no router call was timed. */
  routerLatency: { p50: number; p95: number } | null;
  perQuery: Counters;
}

export function summarize(pipeline: PipelineName, cases: EvalCase[], results: CaseResult[]): PipelineSummary {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const rs = results.filter((r) => r.pipeline === pipeline);
  const withCase = rs.map((r) => ({ r, c: byId.get(r.caseId)! })).filter((x) => x.c);

  const decision = withCase.filter(({ c }) => c.expected.retrieve !== null).map(({ r, c }) => r.searched === c.expected.retrieve);
  const route =
    pipeline === "adaptive"
      ? ratio(withCase.filter(({ c }) => c.expected.route !== null).map(({ r, c }) => r.route === c.expected.route))
      : null;
  const offer = withCase
    .filter(({ c }) => c.expected.offerContact !== null)
    .map(({ r, c }) => r.offerContact === c.expected.offerContact);
  const fallbacks = pipeline === "adaptive" ? ratio(rs.filter((r) => r.routeVia !== null).map((r) => r.routeVia !== "llm")) : null;
  const recalls = withCase
    .filter(({ c }) => (c.expected.expectedChunks?.length ?? 0) > 0)
    .map(({ r, c }) => chunkRecall(c.expected.expectedChunks!, r.chunkIds));
  const facts = withCase
    .filter(({ c }) => (c.expected.expectedFacts?.length ?? 0) > 0)
    .map(({ r, c }) => factHit(c.expected.expectedFacts!, r.reply));
  const faithful = rs.filter((r) => r.faithful !== null).map((r) => r.faithful === true);
  const noInfo = withCase
    .filter(({ r, c }) => c.expected.answerable !== null && r.declined !== null)
    .map(({ r, c }) => r.declined === !c.expected.answerable);
  const lat = rs.map((r) => r.latencyMs).sort((a, b) => a - b);
  const routerLat = rs
    .map((r) => r.routerMs)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);

  const perQuery = Object.fromEntries(
    Object.keys(rs[0]?.counters ?? {}).map((k) => [
      k,
      rs.length === 0 ? 0 : rs.reduce((s, r) => s + r.counters[k as keyof Counters], 0) / rs.length,
    ]),
  ) as unknown as Counters;

  return {
    cases: rs.length,
    errors: rs.filter((r) => r.replyKind === "error").length,
    retrievalDecision: ratio(decision),
    route,
    offerContact: ratio(offer),
    routerFallbacks: fallbacks,
    recall: { mean: recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 0, total: recalls.length },
    facts: ratio(facts),
    faithfulness: ratio(faithful),
    noInfoCorrect: ratio(noInfo),
    latency: {
      p50: percentile(lat, 50),
      p95: percentile(lat, 95),
      mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
    },
    routerLatency: routerLat.length ? { p50: percentile(routerLat, 50), p95: percentile(routerLat, 95) } : null,
    perQuery,
  };
}

const PENDING = "pending (real backends)";
const MOCKED = "mock (no mide el router)";

function fmtRatio(r: Ratio | null): string {
  if (!r) return "n/a";
  if (r.total === 0) return "n/a (0 graded)";
  return `${r.hits}/${r.total} (${Math.round((100 * r.hits) / r.total)}%)`;
}

const f1 = (n: number) => (Math.round(n * 100) / 100).toString();

/**
 * Labels by mode, so no number is passed off as something it is not:
 * - offline: quality metrics are pending and every adaptive metric that depends
 *   on the router's judgement is labeled as mocked (the offline router is an
 *   oracle that echoes the expected labels). Call counts are real counts under the mocks.
 * - decision: router-dependent metrics, router latency and decision tokens are
 *   REAL (live Jev); KB retrieval, answers, end-to-end latency and generation are
 *   stubbed, so those stay pending.
 * - real: everything is real.
 */
export function markdownTable(summaries: Record<PipelineName, PipelineSummary>, opts: { mode: EvalMode }): string {
  const { linear, adaptive } = summaries;
  const real = (s: string) => (opts.mode === "real" ? s : PENDING);
  const routerDependent = (s: string) => (opts.mode === "offline" ? MOCKED : s);
  const decisionReal = (s: string) => (opts.mode === "offline" ? PENDING : s);
  const pair = (a: number, b: number) => `${Math.round(a)} / ${Math.round(b)}`;
  const rl = adaptive.routerLatency;
  const rows: Array<[string, string, string]> = [
    ["Casos", String(linear.cases), String(adaptive.cases)],
    ["Errores (excepción o 429/500)", String(linear.errors), String(adaptive.errors)],
    ["Decisión de buscar correcta", fmtRatio(linear.retrievalDecision), routerDependent(fmtRatio(adaptive.retrievalDecision))],
    ["Ruta correcta (router Jev)", "n/a (sin router)", routerDependent(fmtRatio(adaptive.route))],
    ["offerContact (hire_intent) correcto", fmtRatio(linear.offerContact), routerDependent(fmtRatio(adaptive.offerContact))],
    ["Fallbacks del router (error, timeout, respuesta inválida)", "n/a", routerDependent(fmtRatio(adaptive.routerFallbacks))],
    ["Latencia del router p50 / p95 (ms)", "n/a", decisionReal(rl ? `${Math.round(rl.p50)} / ${Math.round(rl.p95)}` : "n/a")],
    [
      "Recall de chunks esperados (promedio)",
      real(`${f1(linear.recall.mean)} (n=${linear.recall.total})`),
      real(`${f1(adaptive.recall.mean)} (n=${adaptive.recall.total})`),
    ],
    ["Respuesta con el dato esperado", real(fmtRatio(linear.facts)), real(fmtRatio(adaptive.facts))],
    ["Fidelidad al contexto (juez LLM)", real(fmtRatio(linear.faithfulness)), real(fmtRatio(adaptive.faithfulness))],
    ["\"No tengo info\" correcto", real(fmtRatio(linear.noInfoCorrect)), real(fmtRatio(adaptive.noInfoCorrect))],
    [
      "Latencia p50 / p95 / media (ms)",
      real(`${Math.round(linear.latency.p50)} / ${Math.round(linear.latency.p95)} / ${Math.round(linear.latency.mean)}`),
      real(`${Math.round(adaptive.latency.p50)} / ${Math.round(adaptive.latency.p95)} / ${Math.round(adaptive.latency.mean)}`),
    ],
    ["Llamadas al router (Jev) por consulta", f1(linear.perQuery.routerCalls), f1(adaptive.perQuery.routerCalls)],
    ["Llamadas al juez de suficiencia (Jev) por consulta", f1(linear.perQuery.judgeCalls), f1(adaptive.perQuery.judgeCalls)],
    ["Llamadas de generación por consulta", f1(linear.perQuery.generationCalls), f1(adaptive.perQuery.generationCalls)],
    ["Embeddings por consulta", f1(linear.perQuery.embeddingCalls), f1(adaptive.perQuery.embeddingCalls)],
    ["Queries a Vectorize por consulta", f1(linear.perQuery.vectorizeQueries), f1(adaptive.perQuery.vectorizeQueries)],
    [
      "Tokens decisión (Jev) in / out por consulta",
      decisionReal(pair(linear.perQuery.decisionTokensIn, linear.perQuery.decisionTokensOut)),
      decisionReal(pair(adaptive.perQuery.decisionTokensIn, adaptive.perQuery.decisionTokensOut)),
    ],
    [
      "Tokens generación in / out por consulta",
      real(pair(linear.perQuery.genTokensIn, linear.perQuery.genTokensOut)),
      real(pair(adaptive.perQuery.genTokensIn, adaptive.perQuery.genTokensOut)),
    ],
  ];
  return [
    "| Métrica | Lineal (main) | Adaptativo |",
    "| --- | --- | --- |",
    ...rows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
  ].join("\n");
}
