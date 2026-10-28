import { describe, expect, it } from "vitest";
import eventsMigration from "../migrations/0002_create_events.sql?raw";
import leadsMigration from "../migrations/0001_create_leads.sql?raw";
import { INSERT_EVENT_SQL } from "./events";
import { INSERT_LEAD_SQL } from "./lead";

function insertColumns(sql: string): string[] {
  const match = /\(([^)]+)\)\s*VALUES/i.exec(sql);
  return (match?.[1] ?? "").split(",").map((c) => c.trim());
}

function tableColumns(sql: string): string[] {
  const body = /CREATE TABLE IF NOT EXISTS \w+ \(([\s\S]+?)\n\);/.exec(sql)?.[1] ?? "";
  return body
    .split("\n")
    .map((line) => line.replace(/--.*$/, "").trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

describe("D1 migrations match the worker's INSERT statements", () => {
  it("leads", () => {
    expect(tableColumns(leadsMigration)).toEqual(expect.arrayContaining(insertColumns(INSERT_LEAD_SQL)));
  });

  it("events", () => {
    const columns = tableColumns(eventsMigration);
    expect(columns).toEqual(expect.arrayContaining(insertColumns(INSERT_EVENT_SQL)));
    expect(columns).toContain("id");
  });
});
