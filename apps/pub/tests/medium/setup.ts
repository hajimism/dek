// Every medium test starts from the schema the migrations make, in a D1 of its own.

import { applyD1Migrations } from "cloudflare:test";
import { env } from "./env.ts";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
