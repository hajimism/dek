// What every page knows before its own loader runs: who is signed in, the language and theme, and
// the switches the server runs with. The language and theme also go on <html>, which only the
// first render sets, so changing either reloads the document.

import { defineMiddleware } from "void";
import { getUser } from "void/auth";
import { env } from "void/env";
import { getCookie, setCookie } from "hono/cookie";
import { type Lang, pickLang } from "../src/common/i18n.ts";

export type Theme = "system" | "light" | "dark";

export type Viewer = { id: string; handle: string; name: string; image: string | null };

export type Shared = {
  viewer: Viewer | null;
  lang: Lang;
  theme: Theme;
  devLogin: boolean;
  turnstileSiteKey: string;
  /** The time the page was made, so relative times render the same on the server and in the browser. */
  now: number;
};

declare module "void" {
  interface CloudContextVariables {
    shared: Shared;
    /** Set by a loader that renders the not-found page, so the document answers 404. */
    pageStatus?: 404;
  }
}

const YEAR = 60 * 60 * 24 * 365;

/** The wordmark's slide, as a 32px icon: an ink-blue frame on paper. */
const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#3451d1"/><rect x="7" y="10" width="18" height="12" rx="2" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M11 18h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
)}`;

export default defineMiddleware(async (c, next) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/i/")) {
    return next();
  }
  const asked = url.searchParams.get("lang");
  const lang = pickLang(asked, getCookie(c, "lang"), c.req.header("accept-language"));
  if (asked === lang) {
    setCookie(c, "lang", lang, { path: "/", maxAge: YEAR, sameSite: "Lax" });
  }
  const themeCookie = getCookie(c, "theme");
  const theme: Theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : "system";
  const user = getUser() as (ReturnType<typeof getUser> & { handle?: string | null }) | null;

  c.set("shared", {
    viewer: user
      ? { id: user.id, handle: user.handle ?? user.id, name: user.name, image: user.image ?? null }
      : null,
    lang,
    theme,
    devLogin: env.DEK_PUB_DEV_LOGIN === "1",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    now: Date.now(),
  });
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
