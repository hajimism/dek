// Every medium test starts from the schema the migrations make, with no rows and no files. Each
// test file gets a D1 and an R2 of its own, but the tests in a file share them, so every row and
// file is taken away before each test: no test can lean on what another left behind.

import { applyD1Migrations } from "cloudflare:test";
import { beforeEach } from "vitest";
import { env } from "./env.ts";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

/** The tables the migrations made, apart from D1's and SQLite's own. */
const { results: tables } = await env.DB.prepare(
  "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '_cf_%' and name != 'd1_migrations'",
).all<{ name: string }>();

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("pragma defer_foreign_keys = on"),
    ...tables.map(({ name }) => env.DB.prepare(`delete from "${name}"`)),
  ]);
  let listed: R2Objects | undefined;
  do {
    listed = await env.STORAGE.list({ cursor: listed?.truncated ? listed.cursor : undefined });
    if (listed.objects.length > 0) {
      await env.STORAGE.delete(listed.objects.map((object) => object.key));
    }
  } while (listed.truncated);
});
