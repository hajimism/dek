// What every page knows before its own loader runs: who is signed in, the language and theme, and
// the switches the server runs with. The language and theme also go on <html>, which only the
// first render sets, so changing either reloads the document.

import { defineMiddleware } from "void";
import { sharedOf } from "../src/shell/shared.server.ts";
import type { Shared } from "../src/shell/type.ts";

declare module "void" {
  interface CloudContextVariables {
    shared: Shared;
    /** Set by a loader that renders the not-found page, so the document answers 404. */
    pageStatus?: 404;
  }
}

/** The wordmark's slide, as a 32px icon: an ink-blue frame on paper. */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#3451d1"/><rect x="7" y="10" width="18" height="12" rx="2" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M11 18h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
)}`;

export default defineMiddleware(async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/i/")) {
    return next();
  }
  const shared = sharedOf(c);
  const { lang, theme } = shared;
  c.set("shared", shared);
  c.set("headDefaults", {
    meta: [
      { charset: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "color-scheme", content: theme === "system" ? "light dark" : theme },
    ],
    link: [{ rel: "icon", href: FAVICON }],
    htmlAttrs: { lang, ...(theme === "system" ? {} : { "data-theme": theme }) },
  });
  await next();
  if (c.get("pageStatus") === 404 && !c.req.header("x-voidpages")) {
    c.res = new Response(c.res.body, { status: 404, headers: c.res.headers });
  }
});
