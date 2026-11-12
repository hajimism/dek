import { defineConfig } from "vite-plus";

// The app's tests, apart from the Void dev server: pure logic in Node, components in a real
// browser. The serve Worker has its own, in workerd (serve/vitest.config.ts); the whole app is
// checked end to end by tests/e2e against `vp dev`.
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
    ],
  },
});
