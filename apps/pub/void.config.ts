import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: {
    name: "dek-pub",
    // The bucket the serve Worker reads decks from (serve/wrangler.jsonc). Unnamed, `void deploy`
    // would make the app one of its own.
    r2_buckets: [{ binding: "STORAGE", bucket_name: "dek-pub" }],
  },
  auth: { providers: ["github", "email"] },
  // Sign-in links, invitations and notices. The domain is set up for Cloudflare Email Sending by
  // `void deploy`; until then the dev server keeps every mail in its own inbox.
  email: { from: "dek.pub <noreply@mail.dek.pub>" },
  head: {
    titleTemplate: "%s · dek.pub",
    htmlAttrs: { lang: "en" },
    link: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&family=Noto+Sans+JP:wght@400..700&display=swap",
      },
    ],
  },
  routing: { typedRoutes: true },
  worker: { compatibility_date: "2026-10-30" },
});
