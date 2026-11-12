import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: { bindings: { SERVE_TOKEN_SECRET: "test-secret", APP_ORIGIN: "https://dek.pub" } },
    }),
  ],
});
