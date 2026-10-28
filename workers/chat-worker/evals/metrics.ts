/**
 * Pure metric aggregation for the eval runner (no I/O), unit-tested in metrics.test.ts.
 */

import type { Counters } from "./backends";

export type PipelineName = "linear" | "adaptive";

export interface EvalCase {
  id: string;
  category: "smalltalk" | "kb" | "followup" | "off_topic" | "unanswerable";
  lang: "es" | "en";
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  expected: {
    route: "smalltalk" | "about_ramiro" | "off_topic" | null;
    retrieve: boolean | null;
    answerable: boolean | null;
    expectedChunks?: string[];
    expectedFacts?: string[];
  };
}

export interface CaseResult {
  caseId: string;
  pipeline: PipelineName;
  /** Adaptive only. */
  route: string | null;
  routeVia: string | null;
  searched: boolean;
  chunkIds: string[];
  replyKind: "smalltalk" | "off_topic" | "no_info" | "generated" | "error";
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
  recall: { mean: number; total: number };
  facts: Ratio;
  faithfulness: Ratio;
  noInfoCorrect: Ratio;
  latency: { p50: number; p95: number; mean: number };
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
    recall: { mean: recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : 0, total: recalls.length },
    facts: ratio(facts),
    faithfulness: ratio(faithful),
    noInfoCorrect: ratio(noInfo),
    latency: {
      p50: percentile(lat, 50),
      p95: percentile(lat, 95),
      mean: lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0,
    },
    perQuery,
  };
}

const PENDING = "pending (real backends)";

function fmtRatio(r: Ratio | null): string {
  if (!r) return "n/a";
  if (r.total === 0) return "n/a (0 graded)";
  return `${r.hits}/${r.total} (${Math.round((100 * r.hits) / r.total)}%)`;
}

const f1 = (n: number) => (Math.round(n * 100) / 100).toString();

export function markdownTable(summaries: Record<PipelineName, PipelineSummary>, opts: { offline: boolean }): string {
  const { linear, adaptive } = summaries;
  const real = (s: string) => (opts.offline ? PENDING : s);
  const rows: Array<[string, string, string]> = [
    ["Casos", String(linear.cases), String(adaptive.cases)],
    ["Errores (excepción o 429/500)", String(linear.errors), String(adaptive.errors)],
    ["Decisión de buscar correcta", fmtRatio(linear.retrievalDecision), fmtRatio(adaptive.retrievalDecision)],
    ["Ruta correcta (router)", "n/a", fmtRatio(adaptive.route)],
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
    ["Llamadas de generación por consulta", f1(linear.perQuery.generationCalls), f1(adaptive.perQuery.generationCalls)],
    ["Llamadas LLM chico por consulta", f1(linear.perQuery.smallLlmCalls), f1(adaptive.perQuery.smallLlmCalls)],
    ["Embeddings por consulta", f1(linear.perQuery.embeddingCalls), f1(adaptive.perQuery.embeddingCalls)],
    ["Queries a Vectorize por consulta", f1(linear.perQuery.vectorizeQueries), f1(adaptive.perQuery.vectorizeQueries)],
    [
      "Tokens generación in / out por consulta",
      real(`${Math.round(linear.perQuery.genTokensIn)} / ${Math.round(linear.perQuery.genTokensOut)}`),
      real(`${Math.round(adaptive.perQuery.genTokensIn)} / ${Math.round(adaptive.perQuery.genTokensOut)}`),
    ],
    [
      "Tokens LLM chico in / out por consulta",
      real(`${Math.round(linear.perQuery.smallTokensIn)} / ${Math.round(linear.perQuery.smallTokensOut)}`),
      real(`${Math.round(adaptive.perQuery.smallTokensIn)} / ${Math.round(adaptive.perQuery.smallTokensOut)}`),
    ],
  ];
  return [
    "| Métrica | Lineal (main) | Adaptativo |",
    "| --- | --- | --- |",
    ...rows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
  ].join("\n");
}
