#!/usr/bin/env node
/**
 * chat-stats.mjs — usage analytics for the Botardo chat worker.
 *
 * Reads the Workers Analytics Engine dataset written by the chat worker (one
 * data point per question) via the Cloudflare SQL API and prints usage
 * aggregates: questions per day, language/status split, no-info rate and
 * average latencies.
 *
 * Data point schema (written by workers/chat-worker/src/index.ts writeUsage):
 *   blobs:   blob1 = language ("es"|"en"), blob2 = status ("ok"|"rate_limited"|"model_error"), blob3 = question preview (80 chars)
 *   doubles: double1 = chunk_count, double2 = top similarity score, double3 = retrieval ms, double4 = generation ms
 *   indexes: index1 = conversation session id
 *
 * Usage:
 *   pnpm chat:stats                  # default aggregates (last 30 days)
 *   pnpm chat:stats -- --sql "SELECT _timestamp, blob3 FROM <dataset> ORDER BY _timestamp DESC LIMIT 20"
 *   pnpm chat:stats -- --days 90
 *
 * Credentials auto-load from the gitignored root `.env` (CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_API_TOKEN) — same pattern as populate-index.mjs.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(SCRIPT_DIR, "..", "..", "..");

if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
  try {
    process.loadEnvFile(path.join(ROOT_DIR, ".env"));
  } catch {
    // missing/unreadable .env is fine — continue with exported env only
  }
}

const WORKER_NAME = "ramirocerda-chat";
const BINDING_NAME = "ANALYTICS";
const DATASET = `${WORKER_NAME.replace(/-/g, "_")}_${BINDING_NAME}`;

function parseArgs(argv) {
  const sqlIndex = argv.indexOf("--sql");
  const daysIndex = argv.indexOf("--days");
  return {
    sql: sqlIndex >= 0 ? argv[sqlIndex + 1] : undefined,
    days: daysIndex >= 0 ? Number.parseInt(argv[daysIndex + 1] ?? "30", 10) || 30 : 30,
  };
}

async function runSql(accountId, apiToken, sql) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "text/plain" },
    body: sql,
  });
  if (!res.ok) throw new Error(`SQL request failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function printRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("(no rows — is the ANALYTICS binding deployed and has anyone talked to Botardo?)");
    return;
  }
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (cells) => cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join("  |  ");
  console.log(line(columns));
  console.log(widths.map((w) => "-".repeat(w)).join("--+-"));
  for (const row of rows) console.log(line(columns.map((c) => row[c])));
  console.log(`\n${rows.length} rows`);
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required (root .env is auto-loaded).");
    process.exitCode = 1;
    return;
  }

  const { sql, days } = parseArgs(process.argv.slice(2));
  if (sql) {
    printRows(await runSql(accountId, apiToken, sql));
    return;
  }

  const since = `INTERVAL ${days} DAY`;
  console.log(`=== Botardo usage — last ${days} days (${DATASET}) ===\n`);

  console.log("Questions per day:");
  printRows(
    await runSql(
      accountId,
      apiToken,
      `SELECT date(_timestamp) AS day, count() AS questions FROM ${DATASET} GROUP BY day ORDER BY day DESC LIMIT ${days}`,
    ),
  );

  console.log("\nBy language and status:");
  printRows(
    await runSql(
      accountId,
      apiToken,
      `SELECT blob1 AS lang, blob2 AS status, count() AS n, avg(double1) AS avg_chunks, avg(double2) AS avg_score, avg(double3) AS avg_retrieval_ms, avg(double4) AS avg_gen_ms FROM ${DATASET} GROUP BY blob1, blob2 ORDER BY n DESC`,
    ),
  );

  console.log("\nNo-info rate (questions whose retrieval found 0 KB chunks):");
  printRows(
    await runSql(
      accountId,
      apiToken,
      `SELECT count() AS total, sum(double1 = 0) AS no_info, round(sum(double1 = 0) * 100.0 / count(), 1) AS no_info_pct FROM ${DATASET}`,
    ),
  );

  console.log("\nConversations (distinct session ids):");
  printRows(
    await runSql(
      accountId,
      apiToken,
      `SELECT uniq(index1) AS conversations, count() AS questions FROM ${DATASET}`,
    ),
  );

  console.log("\nRecent questions:");
  printRows(
    await runSql(
      accountId,
      apiToken,
      `SELECT date(_timestamp) AS day, blob1 AS lang, blob2 AS status, blob3 AS question, double1 AS chunks FROM ${DATASET} ORDER BY _timestamp DESC LIMIT 20`,
    ),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`chat-stats failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}
