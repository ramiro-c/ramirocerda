#!/usr/bin/env node
/**
 * chat-stats.mjs — usage analytics for the Botardo chat worker.
 *
 * Reads the Workers Analytics Engine dataset written by the chat worker (one
 * data point per question) and prints usage aggregates: questions per day,
 * language/status split, no-info rate and average latencies. It also prints
 * worker invocation counts from the GraphQL analytics API, which are
 * independent of Analytics Engine and therefore always available.
 *
 * Data point schema (written by workers/chat-worker/src/index.ts writeUsage):
 *   blobs:   blob1 = language ("es"|"en"), blob2 = status ("ok"|"rate_limited"|"model_error"), blob3 = question preview (80 chars),
 *            blob4 = router decision model tier ("free"|"paid"|"none"; empty on rows written before the paid fallback)
 *   doubles: double1 = chunk_count, double2 = top similarity score, double3 = retrieval ms, double4 = generation ms,
 *            double5 = route (0 search, 1 smalltalk, 2 off_topic), double6 = retrieval iterations,
 *            double7 = search query used the conversation (0/1), double8 = router ms, double9 = offerContact (0/1),
 *            double10 = router status (0 decision model answered, 1 fallback after error, 2 decision model off),
 *            double11 = judge verdict (0 skipped, 1 sufficient, 2 insufficient, 3 error), double12 = judge ms
 *            (5..12 appended by adaptive RAG; 0 on older rows)
 *   indexes: index1 = conversation session id
 *
 * Endpoint note: queries go to the unified Analytics SQL API
 * (POST /client/v4/analytics/sql) with the dataset addressed as
 * `events.analyticsEngine.<dataset>`. The legacy Workers Analytics Engine
 * endpoint (POST /accounts/<id>/analytics_engine/sql) currently answers
 * HTTP 403 "Authorization error" for this account even with a valid
 * least-privilege token — a platform-side issue, not a token problem.
 * Two consequences of that API: every statement needs a lower time bound
 * (`timestamp >= ...`), and an unknown dataset returns 0 rows silently
 * instead of failing, so "no rows" never proves the dataset is empty.
 *
 * Usage:
 *   pnpm chat:stats                  # default aggregates (last 30 days)
 *   pnpm chat:stats -- --days 90
 *   pnpm chat:stats -- --sql "SELECT toDate(timestamp) AS day, blob3 FROM events.analyticsEngine.ramirocerda_chat_ANALYTICS WHERE timestamp >= NOW() - INTERVAL '30' DAY ORDER BY timestamp DESC LIMIT 20"
 *
 * Credentials auto-load from the gitignored root `.env` (CLOUDFLARE_ACCOUNT_ID,
 * CLOUDFLARE_API_TOKEN) — same pattern as populate-index.mjs. A dedicated
 * least-privilege token can be provided via CLOUDFLARE_ANALYTICS_TOKEN
 * (Account | Account Analytics | Read); it takes precedence when set, so the
 * broad populate token never needs to change.
 */

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
const TABLE = `events.analyticsEngine.${DATASET}`;
const SQL_ENDPOINT = "https://api.cloudflare.com/client/v4/analytics/sql";
const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

function parseArgs(argv) {
  const sqlIndex = argv.indexOf("--sql");
  const daysIndex = argv.indexOf("--days");
  return {
    sql: sqlIndex >= 0 ? argv[sqlIndex + 1] : undefined,
    days: daysIndex >= 0 ? Number.parseInt(argv[daysIndex + 1] ?? "30", 10) || 30 : 30,
  };
}

async function runSql(accountId, apiToken, sql, fetchImpl = fetch) {
  const res = await fetchImpl(SQL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, scope: { accountTag: accountId } }),
  });
  if (!res.ok) throw new Error(`SQL request failed (${res.status}): ${await res.text()}`);

  const payload = await res.json();
  return Array.isArray(payload) ? payload : payload.data ?? [];
}

async function runInvocations(accountId, apiToken, days, fetchImpl = fetch) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const isoDay = (date) => date.toISOString().slice(0, 10);
  const query = `query { viewer { accounts(filter: {accountTag: "${accountId}"}) { workersInvocationsAdaptive(limit: 100, filter: {date_geq: "${isoDay(start)}", date_leq: "${isoDay(end)}"}) { dimensions { date scriptName } sum { requests errors } } } } }`;

  const res = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GraphQL request failed (${res.status}): ${await res.text()}`);

  const payload = await res.json();
  if (payload.errors?.length) throw new Error(`GraphQL error: ${payload.errors[0]?.message}`);

  const perDay = new Map();
  for (const account of payload.data?.viewer?.accounts ?? []) {
    for (const row of account.workersInvocationsAdaptive ?? []) {
      const day = row.dimensions.date;
      const entry = perDay.get(day) ?? { day, requests: 0, errors: 0 };
      entry.requests += row.sum.requests ?? 0;
      entry.errors += row.sum.errors ?? 0;
      perDay.set(day, entry);
    }
  }
  return [...perDay.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** Default aggregates. Every statement carries a lower time bound because the API requires one. */
function defaultQueries(days) {
  const since = `NOW() - INTERVAL '${days}' DAY`;
  return [
    {
      title: "Questions per day",
      sql: `SELECT toDate(timestamp) AS day, COUNT(*) AS questions FROM ${TABLE} WHERE timestamp >= ${since} GROUP BY day ORDER BY day DESC LIMIT ${days}`,
    },
    {
      title: "By language and status",
      sql: `SELECT blob1 AS lang, blob2 AS status, COUNT(*) AS n, avg(double1) AS avg_chunks, avg(double2) AS avg_score, avg(double3) AS avg_retrieval_ms, avg(double4) AS avg_gen_ms FROM ${TABLE} WHERE timestamp >= ${since} GROUP BY blob1, blob2 ORDER BY n DESC`,
    },
    {
      title: "No-info rate (KB questions whose retrieval found 0 chunks; smalltalk/off-topic excluded)",
      sql: `SELECT COUNT(*) AS total, sum(CASE WHEN double1 = 0 THEN 1 ELSE 0 END) AS no_info, round(sum(CASE WHEN double1 = 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS no_info_pct FROM ${TABLE} WHERE timestamp >= ${since} AND double5 = 0`,
    },
    {
      title: "By route (0 search, 1 smalltalk, 2 off_topic)",
      sql: `SELECT double5 AS route, COUNT(*) AS n, avg(double6) AS avg_iterations, avg(double7) AS rewritten_rate, avg(double8) AS avg_router_ms, avg(double9) AS offer_contact_rate, avg(double12) AS avg_judge_ms FROM ${TABLE} WHERE timestamp >= ${since} GROUP BY double5 ORDER BY n DESC`,
    },
    {
      title: "Router status (0 llm, 1 fallback after error, 2 not configured) and judge verdict (0 skipped, 1 sufficient, 2 insufficient, 3 error)",
      sql: `SELECT double10 AS router_status, double11 AS judge_verdict, COUNT(*) AS n, sum(CASE WHEN double9 = 1 THEN 1 ELSE 0 END) AS offer_contact FROM ${TABLE} WHERE timestamp >= ${since} GROUP BY double10, double11 ORDER BY n DESC`,
    },
    {
      title: "Conversations (distinct session ids)",
      sql: `SELECT COUNT(DISTINCT index1) AS conversations, COUNT(*) AS questions FROM ${TABLE} WHERE timestamp >= ${since}`,
    },
    {
      title: "Recent questions",
      sql: `SELECT toDate(timestamp) AS day, blob1 AS lang, blob2 AS status, blob3 AS question, double1 AS chunks FROM ${TABLE} WHERE timestamp >= ${since} ORDER BY timestamp DESC LIMIT 20`,
    },
  ];
}

function printRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("(no rows — an unknown dataset returns 0 rows silently, so this alone does not prove the dataset is empty; cross-check the invocations section)");
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
  // Dedicated analytics token first (least privilege); broad API token as fallback.
  const apiToken = process.env.CLOUDFLARE_ANALYTICS_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (or CLOUDFLARE_ANALYTICS_TOKEN) are required (root .env is auto-loaded).");
    process.exitCode = 1;
    return;
  }

  const { sql, days } = parseArgs(process.argv.slice(2));
  if (sql) {
    printRows(await runSql(accountId, apiToken, sql));
    return;
  }

  console.log(`=== Botardo usage — last ${days} days (${DATASET}) ===`);

  for (const { title, sql: statement } of defaultQueries(days)) {
    console.log(`\n${title}:`);
    printRows(await runSql(accountId, apiToken, statement));
  }

  console.log("\nWorker invocations per day (GraphQL, independent of Analytics Engine):");
  try {
    printRows(await runInvocations(accountId, apiToken, days));
  } catch (err) {
    console.log(`(invocations unavailable: ${err?.message ?? err})`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`chat-stats failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}

export { DATASET, TABLE, defaultQueries, parseArgs, runInvocations, runSql };
