import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const schema = fileURLToPath(new URL("./db/schema.ts", import.meta.url));
const migrations = await readD1Migrations(
  fileURLToPath(new URL("./db/migrations", import.meta.url)),
);

// The app's tests, apart from the Void dev server: pure logic in Node, components in a real
// browser, and the stores against D1 and R2 in workerd, with every migration applied. The serve
// Worker has its own, in workerd (serve/vitest.config.ts); the whole app is checked end to end by
// tests/e2e against `vp dev`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        plugins: [
          cloudflareTest({
            miniflare: {
              compatibilityDate: "2026-10-30",
              compatibilityFlags: ["nodejs_compat"],
              d1Databases: ["DB"],
              r2Buckets: ["STORAGE"],
              bindings: { TEST_MIGRATIONS: migrations },
            },
          }),
        ],
        resolve: { alias: { "@schema": schema } },
        test: {
          name: "medium",
          include: ["tests/medium/**/*.test.ts"],
          setupFiles: ["tests/medium/setup.ts"],
        },
      },
      {
        plugins: [svelte()],
        resolve: {
          conditions: ["browser"],
          // Components read the page's shared data through @void/svelte; tests give it directly.
          alias: {
            "@void/svelte": fileURLToPath(
              new URL("./tests/browser/void-svelte.ts", import.meta.url),
            ),
          },
        },
        test: {
          name: "browser",
          include: ["tests/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
