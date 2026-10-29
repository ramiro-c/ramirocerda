/**
 * Credential loading shared by every eval entry point.
 *
 * The evals talk to real backends, so they need Cloudflare credentials (to query
 * Vectorize) and the OpenCode Go key (for the paid decision and generation
 * retries). Both live in gitignored files that the worker itself reads at
 * runtime: the root `.env` and `workers/chat-worker/.dev.vars`.
 *
 * An entry point that skips this silently loses its paid path: with the
 * anonymous Jev tier exhausted every call fails with 429 and the report comes
 * out empty. Loading must therefore happen in one place, for every script.
 *
 * An already exported variable always wins: `process.loadEnvFile` does not
 * override it, and the guards below avoid touching the file at all.
 */

import path from "node:path";

export interface CredentialDirs {
  rootDir: string;
  workerDir: string;
}

export function loadLocalSecrets({ rootDir, workerDir }: CredentialDirs): void {
  const tryLoad = (file: string) => {
    try {
      process.loadEnvFile(file);
    } catch {
      // A missing file is fine: explicit env vars always work.
    }
  };
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    tryLoad(path.join(rootDir, ".env"));
  }
  if (!process.env.OPENCODE_GO_API_KEY) {
    tryLoad(path.join(workerDir, ".dev.vars"));
  }
}
