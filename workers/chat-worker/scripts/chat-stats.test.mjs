import { describe, expect, it } from "vitest";

import { DATASET, defaultQueries, runInvocations, runSql } from "./chat-stats.mjs";

const jsonResponse = (payload) => new Response(JSON.stringify(payload), {
  status: 200,
  headers: { "content-type": "application/json" },
});

describe("runSql", () => {
  it("queries the unified SQL API with the account scope in the body", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({ data: [{ n: 3 }], rows: 1 });
    };

    const rows = await runSql("acct-1", "tok-1", "SELECT 1", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/analytics/sql");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers.Authorization).toBe("Bearer tok-1");
    expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      query: "SELECT 1",
      scope: { accountTag: "acct-1" },
    });
    expect(rows).toEqual([{ n: 3 }]);
  });

  it("surfaces a failed query with its status and body", async () => {
    const fetchImpl = async () => new Response("Authorization error", { status: 403 });

    await expect(runSql("acct-1", "tok-1", "SELECT 1", fetchImpl)).rejects.toThrow(
      /SQL request failed \(403\): Authorization error/,
    );
  });
});

describe("defaultQueries", () => {
  it("qualifies every query with the Analytics Engine dataset and a lower time bound", () => {
    const queries = defaultQueries(30);

    expect(queries.length).toBeGreaterThan(0);
    for (const { title, sql } of queries) {
      expect(title).toBeTruthy();
      expect(sql).toContain(`events.analyticsEngine.${DATASET}`);
      expect(sql).toMatch(/timestamp >= NOW\(\) - INTERVAL '30' DAY/);
    }
  });
});

describe("runInvocations", () => {
  it("sums worker requests and errors per day from the GraphQL analytics API", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return jsonResponse({
        data: {
          viewer: {
            accounts: [
              {
                workersInvocationsAdaptive: [
                  { dimensions: { date: "2026-10-15", scriptName: "ramirocerda-chat" }, sum: { requests: 10, errors: 1 } },
                  { dimensions: { date: "2026-10-15", scriptName: "ramirocerda-chat" }, sum: { requests: 5, errors: 0 } },
                  { dimensions: { date: "2026-09-21", scriptName: "ramirocerda-chat" }, sum: { requests: 10, errors: 0 } },
                ],
              },
            ],
          },
        },
      });
    };

    const rows = await runInvocations("acct-1", "tok-1", 30, fetchImpl);

    expect(calls[0].url).toBe("https://api.cloudflare.com/client/v4/graphql");
    expect(rows).toEqual([
      { day: "2026-10-15", requests: 15, errors: 1 },
      { day: "2026-09-21", requests: 10, errors: 0 },
    ]);
  });
});
