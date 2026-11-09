/**
 * Generation benchmark (`pnpm --filter ramirocerda-chat-worker eval:gen-bench`).
 *
 * Measures, per candidate model, time to first token (TTFT), total time, output
 * tokens/s and usage (including reasoning tokens when the upstream reports them),
 * over real Botardo RAG prompts: the answerable `kb` cases of evals/cases.json,
 * built with the worker's own buildRagPrompt and the KB chunks named in each
 * case's expectedChunks (loaded from the repo, no Cloudflare credentials needed).
 * Replies are saved to evals/results/gen-bench-<timestamp>.json; with --judge the
 * eval:judges faithfulness judge (claim extraction + Jev claim support) grades them.
 *
 * Needs OPENCODE_GO_API_KEY (env, or workers/chat-worker/.dev.vars). Without it the
 * script exits without calling anything: there are no made-up numbers here.
 *
 * Usage:
 *   pnpm --filter ramirocerda-chat-worker eval:gen-bench
 *   ... eval:gen-bench -- --dry-run      (no key, no calls: prints the prompts it would send)
 *   ... eval:gen-bench -- --prompt v1    (prompt variant from src/prompts.ts PROMPTS, default v0)
 *   ... eval:gen-bench -- --models "deepseek-v4.1-flash,deepseek-v4.1-flash@low" --cases 4 --runs 2 --judge
 * A candidate is `model` or `model@reasoning_effort`; the effort is sent verbatim as
 * `reasoning_effort` (omitted for plain `model`), since each provider names its levels.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSseLines } from "../src/generate";
import { detectLanguage } from "../src/language";
import { isPromptId, PROMPTS } from "../src/prompts";
import { buildRagPrompt, type ChatMessage, type RetrievedChunk } from "../src/rag";
import { loadLocalSecrets } from "./env";
import { answerFaithful, claimSnippets, evalJudgeConfig, extractClaims, judgeClaims } from "./stage-judges";
// @ts-expect-error plain ESM script without types
import { loadKBChunks } from "../scripts/populate-index.mjs";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.dirname(EVAL_DIR);
const ROOT_DIR = path.resolve(WORKER_DIR, "../..");

export const DEFAULT_CANDIDATES = [
  "deepseek-v4.1-flash",
  "deepseek-v4.1-flash@low",
  "claude-haiku-5-5@off",
  "gpt-6-luna@none",
];

export interface Candidate {
  label: string;
  model: string;
  reasoningEffort: string | null;
}

export function parseCandidates(list: string): Candidate[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((label) => {
      const at = label.indexOf("@");
      return at < 0
        ? { label, model: label, reasoningEffort: null }
        : { label, model: label.slice(0, at), reasoningEffort: label.slice(at + 1) || null };
    });
}

export interface Usage {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
}

/** OpenAI-style usage, with reasoning tokens wherever the upstream puts them. */
export function readUsage(raw: unknown): Usage {
  const u = (raw ?? {}) as Record<string, any>;
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    promptTokens: num(u.prompt_tokens ?? u.input_tokens),
    completionTokens: num(u.completion_tokens ?? u.output_tokens),
    reasoningTokens: num(
      u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? u.reasoning_tokens,
    ),
  };
}

export interface Sample {
  status: number;
  ttftMs: number | null;
  totalMs: number;
  reply: string;
  finishReason: string | null;
  usage: Usage;
  /** Output tokens per second after the first token (null without usage or with a single chunk). */
  tokensPerSecond: number | null;
  error?: string;
}

async function runOnce(opts: {
  endpoint: string;
  apiKey: string;
  candidate: Candidate;
  messages: ChatMessage[];
}): Promise<Sample> {
  const t0 = performance.now();
  let ttft: number | null = null;
  let reply = "";
  let finish: string | null = null;
  let usage: Usage = { promptTokens: null, completionTokens: null, reasoningTokens: null };
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${opts.apiKey}`,
        "x-opencode-session": `botardo-gen-bench-${opts.candidate.label}`,
        "User-Agent": "botardo-gen-bench/1.0",
      },
      body: JSON.stringify({
        model: opts.candidate.model,
        messages: opts.messages,
        max_tokens: 1024,
        temperature: 0,
        stream: true,
        stream_options: { include_usage: true },
        ...(opts.candidate.reasoningEffort ? { reasoning_effort: opts.candidate.reasoningEffort } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok || !res.body) {
      return {
        status: res.status,
        ttftMs: null,
        totalMs: performance.now() - t0,
        reply: "",
        finishReason: null,
        usage,
        tokensPerSecond: null,
        error: (await res.text()).slice(0, 300),
      };
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    const onData = (data: string) => {
      if (data === "[DONE]") return;
      try {
        const chunk = JSON.parse(data);
        const choice = chunk?.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          if (ttft === null) ttft = performance.now() - t0;
          reply += delta;
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk?.usage) usage = readUsage(chunk.usage);
      } catch {
        // ignore keep-alives / malformed lines
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer = parseSseLines(buffer + value, onData);
    }
    parseSseLines(buffer + "\n", onData);
    const totalMs = performance.now() - t0;
    const genMs = ttft === null ? null : totalMs - ttft;
    const tokensPerSecond =
      usage.completionTokens && genMs && genMs > 0 ? (usage.completionTokens / genMs) * 1000 : null;
    return { status: 200, ttftMs: ttft, totalMs, reply, finishReason: finish, usage, tokensPerSecond };
  } catch (err) {
    return {
      status: 0,
      ttftMs: ttft,
      totalMs: performance.now() - t0,
      reply,
      finishReason: finish,
      usage,
      tokensPerSecond: null,
      error: String(err),
    };
  }
}

const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const endpoint = process.env.OPENCODE_GO_ENDPOINT ?? "https://opencode.ai/zen/go/v1/chat/completions";
  const candidates = parseCandidates(arg("models") ?? DEFAULT_CANDIDATES.join(","));
  const runs = Number.parseInt(arg("runs") ?? "1", 10) || 1;
  const maxCases = Number.parseInt(arg("cases") ?? "6", 10) || 6;
  const judge = process.argv.includes("--judge");
  const promptId = arg("prompt") ?? "v0";
  if (!isPromptId(promptId)) throw new Error(`Unknown --prompt ${promptId}; one of ${Object.keys(PROMPTS).join(", ")}`);

  const kb: Array<{ id: string; text: string; metadata?: Record<string, unknown> }> = await loadKBChunks(ROOT_DIR);
  const cases = (JSON.parse(readFileSync(path.join(EVAL_DIR, "cases.json"), "utf8")).cases as Array<any>)
    .filter((c) => c.category === "kb" && c.expected?.answerable === true && Array.isArray(c.expected?.expectedChunks))
    // Half Spanish, half English, in file order.
    .filter((c, _i, all) => all.filter((o) => o.lang === c.lang).indexOf(c) < Math.ceil(maxCases / 2))
    .slice(0, maxCases)
    .map((c) => {
      const chunks: RetrievedChunk[] = kb
        .filter((k) => (c.expected.expectedChunks as string[]).some((prefix) => k.id.startsWith(prefix)))
        .map((k) => ({ id: k.id, score: 1, metadata: { ...k.metadata, text: k.text } }));
      const messages = buildRagPrompt({
        prompt: PROMPTS[promptId],
        chunks,
        language: detectLanguage(c.message),
        message: c.message,
        siteOrigin: "https://ramirocerda.com.ar",
      });
      return { id: c.id as string, message: c.message as string, chunks, messages };
    });

  if (process.argv.includes("--dry-run")) {
    for (const c of cases)
      console.log(`${c.id}: ${c.chunks.length} chunks, ${JSON.stringify(c.messages).length} chars de prompt`);
    console.log(`Candidatos: ${candidates.map((c) => c.label).join(", ")}`);
    return;
  }
  loadLocalSecrets({ rootDir: ROOT_DIR, workerDir: WORKER_DIR });
  const apiKey: string = process.env.OPENCODE_GO_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error(
      "OPENCODE_GO_API_KEY no está configurada (env o workers/chat-worker/.dev.vars). No se llamó a ningún modelo.",
    );
    process.exit(2);
  }
  const judgeConfig = evalJudgeConfig({ apiKey });
  const results: any[] = [];
  for (const candidate of candidates) {
    const samples: any[] = [];
    for (const c of cases) {
      for (let r = 0; r < runs; r++) {
        const s = await runOnce({ endpoint, apiKey, candidate, messages: c.messages });
        let faithful: boolean | null = null;
        let claims: unknown = null;
        if (judge && s.status === 200 && s.reply) {
          const extracted = await extractClaims({
            endpoint,
            apiKey,
            model: process.env.EVAL_JUDGE_MODEL ?? "deepseek-v4.1-flash",
            question: c.message,
            answer: s.reply,
          });
          if (extracted.ok) {
            const checks = await judgeClaims(judgeConfig, extracted.claims, claimSnippets(c.chunks));
            faithful = answerFaithful(checks);
            claims = checks;
          }
        }
        samples.push({ caseId: c.id, run: r, ...s, faithful, claims });
        console.log(
          `${candidate.label.padEnd(28)} ${c.id.padEnd(26)} ${s.status} ttft=${s.ttftMs?.toFixed(0) ?? "-"}ms total=${s.totalMs.toFixed(0)}ms tok/s=${s.tokensPerSecond?.toFixed(1) ?? "-"} out=${s.usage.completionTokens ?? "-"} reasoning=${s.usage.reasoningTokens ?? "-"}${judge ? ` faithful=${faithful}` : ""}`,
        );
      }
    }
    const ok = samples.filter((s) => s.status === 200);
    results.push({
      candidate,
      summary: {
        ok: ok.length,
        total: samples.length,
        ttftMsP50: median(ok.map((s) => s.ttftMs).filter((x): x is number => x !== null)),
        totalMsP50: median(ok.map((s) => s.totalMs)),
        tokensPerSecondP50: median(ok.map((s) => s.tokensPerSecond).filter((x): x is number => x !== null)),
        reasoningTokensP50: median(ok.map((s) => s.usage.reasoningTokens).filter((x): x is number => x !== null)),
        truncated: ok.filter((s) => s.finishReason === "length").length,
        ...(judge
          ? {
              faithful: ok.filter((s) => s.faithful === true).length,
              unfaithful: ok.filter((s) => s.faithful === false).length,
            }
          : {}),
      },
      samples,
    });
  }

  console.log("\nResumen (p50):");
  for (const r of results) {
    const s = r.summary;
    console.log(
      `${r.candidate.label.padEnd(28)} ok ${s.ok}/${s.total}  TTFT ${s.ttftMsP50?.toFixed(0) ?? "-"} ms  total ${s.totalMsP50?.toFixed(0) ?? "-"} ms  ${s.tokensPerSecondP50?.toFixed(1) ?? "-"} tok/s  reasoning ${s.reasoningTokensP50 ?? "-"}  cortes ${s.truncated}${judge ? `  fieles ${s.faithful}/${s.ok}` : ""}`,
    );
  }
  mkdirSync(path.join(EVAL_DIR, "results"), { recursive: true });
  const out = path.join(EVAL_DIR, "results", `gen-bench-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    out,
    JSON.stringify({ endpoint, prompt: promptId, runs, cases: cases.map((c) => c.id), results }, null, 2),
  );
  console.log(`\nRespuestas guardadas en ${path.relative(process.cwd(), out)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
