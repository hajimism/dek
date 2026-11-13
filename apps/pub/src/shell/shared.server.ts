// The shared data of a page request: who is signed in, the language and theme, and the switches
// the server runs with.

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getUser } from "void/auth";
import { env } from "void/env";
import { pickLang } from "../common/i18n.ts";
import { selfOf } from "../model/person/person.ts";
import { Account } from "../model/person/type.ts";
import { type Shared, Theme } from "./type.ts";

const YEAR = 60 * 60 * 24 * 365;

export function sharedOf(c: Context): Shared {
  const asked = new URL(c.req.url).searchParams.get("lang");
  const lang = pickLang(asked, getCookie(c, "lang"), c.req.header("accept-language"));
  if (asked === lang) {
    setCookie(c, "lang", lang, { path: "/", maxAge: YEAR, sameSite: "Lax" });
  }
  const user = getUser();
  return {
    viewer: user ? selfOf(Account.parse(user)) : null,
    lang,
    theme: Theme.parse(getCookie(c, "theme")),
    devLogin: env.DEK_PUB_DEV_LOGIN === "1",
    turnstileSiteKey: env.TURNSTILE_SITE_KEY,
    now: Date.now(),
  };
}
