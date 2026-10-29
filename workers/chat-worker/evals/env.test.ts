import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evalDecisionAuth, loadLocalSecrets } from "./env";

const TOUCHED = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "OPENCODE_GO_API_KEY"] as const;
const saved = new Map(TOUCHED.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of TOUCHED) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function scaffold(): { rootDir: string; workerDir: string } {
  const rootDir = mkdtempSync(path.join(tmpdir(), "eval-env-"));
  const workerDir = path.join(rootDir, "workers", "chat-worker");
  mkdirSync(workerDir, { recursive: true });
  writeFileSync(
    path.join(rootDir, ".env"),
    "CLOUDFLARE_API_TOKEN=token-from-file\nCLOUDFLARE_ACCOUNT_ID=account-from-file\n",
  );
  writeFileSync(path.join(workerDir, ".dev.vars"), "OPENCODE_GO_API_KEY=key-from-file\n");
  return { rootDir, workerDir };
}

describe("loadLocalSecrets", () => {
  it("fills the credentials the evals need from the root .env and the worker .dev.vars", () => {
    const { rootDir, workerDir } = scaffold();
    for (const key of TOUCHED) delete process.env[key];

    loadLocalSecrets({ rootDir, workerDir });

    expect(process.env.CLOUDFLARE_API_TOKEN).toBe("token-from-file");
    expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBe("account-from-file");
    expect(process.env.OPENCODE_GO_API_KEY).toBe("key-from-file");
  });

  it("keeps an already exported variable instead of overwriting it from a file", () => {
    const { rootDir, workerDir } = scaffold();
    process.env.OPENCODE_GO_API_KEY = "exported-key";

    loadLocalSecrets({ rootDir, workerDir });

    expect(process.env.OPENCODE_GO_API_KEY).toBe("exported-key");
  });

  it("does not throw when the credential files do not exist", () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), "eval-env-empty-"));
    for (const key of TOUCHED) delete process.env[key];

    expect(() => loadLocalSecrets({ rootDir, workerDir: rootDir })).not.toThrow();
    expect(process.env.OPENCODE_GO_API_KEY).toBeUndefined();
  });
});

describe("evalDecisionAuth", () => {
  it("keeps the paid fallback in decision mode so the router is not replaced by the heuristic", () => {
    expect(evalDecisionAuth("decision", "key-from-file")).toEqual({
      apiKey: "key-from-file",
      paidFallback: true,
    });
  });

  it("drops the paid fallback when the key is only whitespace", () => {
    expect(evalDecisionAuth("decision", "   ")).toEqual({ apiKey: null, paidFallback: false });
  });

  it("never signs an offline run with a real key", () => {
    expect(evalDecisionAuth("offline", "key-from-file")).toEqual({ apiKey: null, paidFallback: false });
  });
});
