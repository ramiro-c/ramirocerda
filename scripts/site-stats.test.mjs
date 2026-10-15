import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { aggregateVisits, countVisits, readProject } from "./site-stats.mjs";

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

test("countVisits hits the count endpoint with project, range and team", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ data: { visitors: 12, pageviews: 30 } });
  };

  const data = await countVisits({
    projectId: "prj_1",
    teamId: "team_1",
    since: "2026-09-15",
    until: "2026-10-15",
    apiToken: "tok-1",
    fetchImpl,
  });

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://api.vercel.com/v1/query/web-analytics/visits/count");
  assert.equal(url.searchParams.get("projectId"), "prj_1");
  assert.equal(url.searchParams.get("teamId"), "team_1");
  assert.equal(url.searchParams.get("since"), "2026-09-15");
  assert.equal(url.searchParams.get("until"), "2026-10-15");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok-1");
  assert.deepEqual(data, { visitors: 12, pageviews: 30 });
});

test("aggregateVisits passes the breakdown dimension and limit", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push({ url });
    return jsonResponse({ data: [{ timestamp: "2026-10-15T00:00:00Z", visitors: 3, pageviews: 7 }] });
  };

  const rows = await aggregateVisits({
    projectId: "prj_1",
    by: "day",
    limit: 30,
    since: "2026-09-15",
    until: "2026-10-15",
    apiToken: "tok-1",
    fetchImpl,
  });

  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://api.vercel.com/v1/query/web-analytics/visits/aggregate");
  assert.equal(url.searchParams.get("by"), "day");
  assert.equal(url.searchParams.get("limit"), "30");
  assert.deepEqual(rows, [{ timestamp: "2026-10-15T00:00:00Z", visitors: 3, pageviews: 7 }]);
});

test("retries without teamId when the team-scoped request is refused", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return new URL(url).searchParams.has("teamId")
      ? new Response("Forbidden", { status: 403 })
      : jsonResponse({ data: { visitors: 1, pageviews: 2 } });
  };

  const data = await countVisits({
    projectId: "prj_1",
    teamId: "team_1",
    since: "2026-09-15",
    until: "2026-10-15",
    apiToken: "tok-1",
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.has("teamId"), false);
  assert.deepEqual(data, { visitors: 1, pageviews: 2 });
});

test("surfaces a refused request with its status and body", async () => {
  const fetchImpl = async () => new Response("Not authorized", { status: 401 });

  await assert.rejects(
    countVisits({ projectId: "prj_1", since: "2026-09-15", until: "2026-10-15", apiToken: "bad", fetchImpl }),
    /Vercel Analytics request failed \(401\): Not authorized/,
  );
});

test("readProject resolves projectId and teamId from project.json", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "site-stats-"));
  const file = path.join(dir, "project.json");
  await writeFile(file, JSON.stringify({ projectId: "prj_9", orgId: "team_9", projectName: "ramirocerda" }));

  assert.deepEqual(await readProject(file), { projectId: "prj_9", teamId: "team_9" });
  assert.deepEqual(await readProject(path.join(dir, "missing.json")), {});
});
