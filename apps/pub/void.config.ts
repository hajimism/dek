import { defineConfig } from "void/config";

export default defineConfig({
  cloudflare: { name: "dek-pub" },
  auth: { providers: ["github", "email"] },
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
