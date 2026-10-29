/**
 * Credential-free validation of the stage judges (`pnpm eval:judges`).
 *
 * Runs the REAL Jev judges (anonymous jev-1.13-free on OpenCode System One, with
 * the paid jev-1.13 retry when OPENCODE_GO_API_KEY is configured) over
 * evals/judge-fixtures.json: hand-labeled claims against verbatim KB excerpts,
 * and hand-written replies labeled abstains / answers. It measures how often
 * the judges agree with the labels. Everything here is a FIXTURE number: it
 * says nothing about Botardo's real answers, only whether the judges can be
 * trusted. Claim extraction (text model) is not exercised here: the fixtures
 * bring their claims already split.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  agreement,
  answerFaithful,
  evalJudgeConfig,
  judgeAbstention,
  judgeClaims,
  type AbstentionCheck,
  type Agreement,
  type ClaimCheck,
} from "./stage-judges";
import { loadLocalSecrets } from "./env";

const EVAL_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(EVAL_DIR, "..");
const ROOT_DIR = path.join(WORKER_DIR, "..", "..");

interface ClaimFixture {
  id: string;
  snippets: Array<{ chunk: string; section: string; text: string }>;
  claims: Array<{ text: string; supported: boolean }>;
}
interface AbstentionFixture {
  id: string;
  question: string;
  reply: string;
  abstains: boolean;
}

const pct = (a: Agreement) => (a.total ? `${a.agree}/${a.total} (${Math.round((100 * a.agree) / a.total)}%)` : "n/a (0 graded)");

async function main(): Promise<void> {
  const fixtures = JSON.parse(readFileSync(path.join(EVAL_DIR, "judge-fixtures.json"), "utf8")) as {
    claimSupport: ClaimFixture[];
    abstention: AbstentionFixture[];
  };
  // Same credential loading as evals/run.ts: without the key the paid retry does
  // not exist, and with the free tier exhausted every claim fails with 429.
  loadLocalSecrets({ rootDir: ROOT_DIR, workerDir: WORKER_DIR });
  const jev = evalJudgeConfig({ ...process.env, apiKey: process.env.OPENCODE_GO_API_KEY?.trim() || null });

  const claimRows: Array<{ fixture: string; label: boolean; check: ClaimCheck }> = [];
  const answerPairs: Array<{ label: boolean; verdict: boolean | null }> = [];
  for (const f of fixtures.claimSupport) {
    const snippets = f.snippets.map((s) => `[${s.section}] ${s.text}`);
    const checks = await judgeClaims(jev, f.claims.map((c) => c.text), snippets);
    checks.forEach((check, i) => claimRows.push({ fixture: f.id, label: f.claims[i].supported, check }));
    // Two answers per fixture: only the supported claims (should pass) and all claims (should fail).
    answerPairs.push({ label: true, verdict: answerFaithful(checks.filter((_, i) => f.claims[i].supported)) });
    answerPairs.push({ label: false, verdict: answerFaithful(checks) });
    console.error(`[claims] ${f.id}: ${checks.map((c) => (c.p === null ? `err:${c.error}` : c.p.toFixed(2))).join(" ")}`);
  }

  const absRows: Array<{ fixture: AbstentionFixture; check: AbstentionCheck }> = [];
  for (const f of fixtures.abstention) {
    const check = await judgeAbstention(jev, f.question, f.reply);
    absRows.push({ fixture: f, check });
    console.error(`[abstention] ${f.id}: ${check.abstained === null ? `err:${check.error}` : `${check.abstained} (${check.confidence})`}`);
  }

  const claimAgreement = agreement(claimRows.map((r) => ({ label: r.label, verdict: r.check.supported })));
  const answerAgreement = agreement(answerPairs);
  const absAgreement = agreement(absRows.map((r) => ({ label: r.fixture.abstains, verdict: r.check.abstained })));
  const tiers = [...claimRows.map((r) => r.check.tier), ...absRows.map((r) => r.check.tier ?? "none")];
  const tierText = ["free", "paid", "none"].map((t) => `${t}=${tiers.filter((x) => x === t).length}`).join(", ");

  const lines = [
    "### Validación de jueces de etapa (FIXTURE, no son respuestas de Botardo)",
    "",
    `Modo: FIXTURE. Jueces REALES (${jev.model} vía ${jev.endpoint}${jev.fallbackModel ? `, fallback pago ${jev.fallbackModel}` : ", sin key, sin fallback pago"}) sobre claims y respuestas escritas a mano contra extractos textuales del KB indexado. Miden si los jueces coinciden con las etiquetas, no la calidad de Botardo.`,
    `Fecha: ${new Date().toISOString()}. Respuestas por tier: ${tierText}.`,
    "",
    "| Juez | Coincide con la etiqueta | Etiqueta falsa, juez dijo verdadero | Etiqueta verdadera, juez dijo falso | Errores (sin veredicto) |",
    "| --- | --- | --- | --- | --- |",
    `| Soporte por claim (Jev noul) | ${pct(claimAgreement)} | ${claimAgreement.falseTrue} (claim inventado aceptado) | ${claimAgreement.falseFalse} (claim con soporte rechazado) | ${claimAgreement.errors} |`,
    `| Fidelidad por respuesta (algún claim sin soporte = falla) | ${pct(answerAgreement)} | ${answerAgreement.falseTrue} | ${answerAgreement.falseFalse} | ${answerAgreement.errors} |`,
    `| Abstención (Jev choice) | ${pct(absAgreement)} | ${absAgreement.falseTrue} (respondió y el juez dijo que se abstuvo) | ${absAgreement.falseFalse} (se abstuvo y el juez dijo que respondió) | ${absAgreement.errors} |`,
    "",
    "Detalle por claim:",
    "",
    "| Fixture | Claim | Etiqueta | p (Jev) | Veredicto |",
    "| --- | --- | --- | --- | --- |",
    ...claimRows.map(
      (r) =>
        `| ${r.fixture} | ${r.check.claim} | ${r.label ? "con soporte" : "sin soporte"} | ${r.check.p === null ? `error ${r.check.error ?? ""}` : r.check.p.toFixed(2)} | ${r.check.supported === null ? "sin veredicto" : r.check.supported === r.label ? "ok" : "MAL"} |`,
    ),
    "",
    "Detalle de abstención:",
    "",
    "| Fixture | Etiqueta | Juez | Confianza | Veredicto |",
    "| --- | --- | --- | --- | --- |",
    ...absRows.map(
      (r) =>
        `| ${r.fixture.id} | ${r.fixture.abstains ? "se abstiene" : "responde"} | ${r.check.abstained === null ? `error ${r.check.error ?? ""}` : r.check.abstained ? "se abstiene" : "responde"} | ${r.check.confidence?.toFixed(2) ?? "n/a"} | ${r.check.abstained === null ? "sin veredicto" : r.check.abstained === r.fixture.abstains ? "ok" : "MAL"} |`,
    ),
  ];
  const report = `${lines.join("\n")}\n`;
  console.log(report);

  const outDir = path.join(EVAL_DIR, "results");
  mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-judges`);
  writeFileSync(`${base}.md`, report);
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ mode: "fixture", judge: { model: jev.model, fallbackModel: jev.fallbackModel }, claimAgreement, answerAgreement, absAgreement, claimRows, absRows }, null, 2),
  );
  console.error(`Wrote ${base}.md and ${base}.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
