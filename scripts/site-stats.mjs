#!/usr/bin/env node
/**
 * site-stats.mjs — real traffic for ramirocerda.com.ar.
 *
 * Reads Vercel Web Analytics (the `/_vercel/insights/script.js` beacon already
 * rendered by src/layouts/BaseLayout.astro) through the Vercel REST API and
 * prints: total visitors and pageviews, the per-day series, and the top pages,
 * referrers and countries. Production-only data, as Vercel reports it.
 *
 * Usage:
 *   node scripts/site-stats.mjs                 # last 30 days
 *   node scripts/site-stats.mjs --days 7
 *
 * Credential: VERCEL_TOKEN must exist in the gitignored root `.env` (or the
 * environment). Create one at https://vercel.com/account/tokens with access to
 * the team that owns the project, then add `VERCEL_TOKEN=...` to `.env`. The
 * projectId and teamId are read from `.vercel/project.json` — no need to type
 * them.
 *
 * API: GET /v1/query/web-analytics/visits/count and .../aggregate
 * (https://vercel.com/docs/rest-api/web-analytics). Tests use the built-in
 * node:test runner: `node --test scripts/site-stats.test.mjs`.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(SCRIPT_DIR, "..");
const API_BASE = "https://api.vercel.com";
const PROJECT_FILE = path.join(ROOT_DIR, ".vercel", "project.json");

if (!process.env.VERCEL_TOKEN) {
  try {
    process.loadEnvFile(path.join(ROOT_DIR, ".env"));
  } catch {
    // missing/unreadable .env is fine — continue with exported env only
  }
}

/** Reads projectId and teamId from the Vercel project link file. */
export async function readProject(projectFile = PROJECT_FILE) {
  try {
    const parsed = JSON.parse(await readFile(projectFile, "utf8"));
    return { projectId: parsed.projectId, teamId: parsed.orgId };
  } catch {
    return {};
  }
}

async function request(endpoint, params, apiToken, fetchImpl) {
  const build = (withTeam) => {
    const url = new URL(`${API_BASE}/v1/query/web-analytics/visits/${endpoint}`);
    for (const [key, value] of Object.entries({ ...params, teamId: withTeam ? params.teamId : undefined })) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  };
  const send = async (withTeam) => {
    const res = await fetchImpl(build(withTeam), {
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const error = new Error(`Vercel Analytics request failed (${res.status}): ${await res.text()}`);
      error.status = res.status;
      return error;
    }
    return res.json();
  };

  const first = await send(Boolean(params.teamId));
  // A personal account link stores the user id as orgId; scoping it as a team is refused.
  if (first instanceof Error && params.teamId && (first.status === 403 || first.status === 404)) {
    const retry = await send(false);
    if (!(retry instanceof Error)) return retry;
  }
  if (first instanceof Error) throw first;
  return first;
}

export async function countVisits({ projectId, teamId, since, until, apiToken, fetchImpl = fetch }) {
  const payload = await request("count", { projectId, teamId, since, until }, apiToken, fetchImpl);
  return payload.data ?? {};
}

export async function aggregateVisits({ projectId, teamId, by, limit, since, until, apiToken, fetchImpl = fetch }) {
  const payload = await request("aggregate", { projectId, teamId, by, limit, since, until }, apiToken, fetchImpl);
  return Array.isArray(payload.data) ? payload.data : [];
}

function printRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log("(no rows)");
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

function parseArgs(argv) {
  const daysIndex = argv.indexOf("--days");
  return { days: daysIndex >= 0 ? Number.parseInt(argv[daysIndex + 1] ?? "30", 10) || 30 : 30 };
}

async function main() {
  const apiToken = process.env.VERCEL_TOKEN;
  if (!apiToken) {
    console.error("VERCEL_TOKEN is required. Create one at https://vercel.com/account/tokens (access to the team that owns the project) and add VERCEL_TOKEN=... to the root .env.");
    process.exitCode = 1;
    return;
  }

  const { projectId, teamId } = await readProject();
  if (!projectId) {
    console.error("Could not read projectId from .vercel/project.json — run `vercel link` in this repo first.");
    process.exitCode = 1;
    return;
  }

  const { days } = parseArgs(process.argv.slice(2));
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const isoDay = (date) => date.toISOString().slice(0, 10);
  const range = { projectId, teamId, since: isoDay(since), until: isoDay(until), apiToken };

  console.log(`=== ramirocerda.com.ar — last ${days} days (${range.since} → ${range.until}) ===\n`);

  console.log("Totals (production):");
  printRows([await countVisits(range)]);

  const breakdowns = [
    { title: "Per day", by: "day", limit: Math.min(days + 1, 100) },
    { title: "Top pages", by: "requestPath", limit: 15 },
    { title: "Top referrers", by: "referrerHostname", limit: 15 },
    { title: "Countries", by: "country", limit: 15 },
  ];

  for (const { title, by, limit } of breakdowns) {
    console.log(`\n${title}:`);
    printRows(await aggregateVisits({ ...range, by, limit }));
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`site-stats failed: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
}

export { parseArgs };
