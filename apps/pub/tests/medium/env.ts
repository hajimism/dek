// The bindings the medium tests run with, as vitest.config.ts gives them: the app's D1 and R2, and
// the migrations to apply to the D1.

/// <reference types="@cloudflare/vitest-plugin/types" />

import type { D1Migration } from "cloudflare:test";
import { env as workerEnv } from "cloudflare:workers";

export const env = workerEnv as unknown as {
  DB: D1Database;
  STORAGE: R2Bucket;
  TEST_MIGRATIONS: D1Migration[];
};
