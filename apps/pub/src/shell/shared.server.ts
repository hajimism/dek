// The shared data of a page request: who is signed in, the language and theme, and the switches
// the server runs with.

import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { env } from "void/env";
import { pickLang } from "../common/i18n.ts";
import { sessionAccount } from "../model/person/actor.server.ts";
import { selfOf } from "../model/person/person.ts";
import { type Shared, Theme } from "./type.ts";

const YEAR = 60 * 60 * 24 * 365;

export function sharedOf(c: Context): Shared {
  const asked = new URL(c.req.url).searchParams.get("lang");
  const lang = pickLang(asked, getCookie(c, "lang"));
  if (asked === lang) {
    setCookie(c, "lang", lang, { path: "/", maxAge: YEAR, sameSite: "Lax" });
  }
  const account = sessionAccount(c);
  return {
    viewer: account ? selfOf(account) : null,
    lang,
    theme: Theme.parse(getCookie(c, "theme")),
    devLogin: env.DEK_PUB_DEV_LOGIN === "1",
    now: Date.now(),
  };
}
