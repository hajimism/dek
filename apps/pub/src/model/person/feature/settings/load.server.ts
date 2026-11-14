// The settings page: signed out, the sign-in page's to show, coming back here; with no handle
// yet, the page to choose one's, as every page is.

import type { Context } from "hono";
import { sessionAccount } from "../../actor.server.ts";
import { keysOf } from "../../api-key.server.ts";
import { linksOf } from "../../link.server.ts";
import { hasHandle } from "../../person.ts";
import { signInHref, welcomeHref } from "../../sign-in-path.ts";
import { invitesFor } from "./invites.server.ts";
import type { Settings } from "./type.ts";

const SETTINGS_PATH = "/settings";

export async function loadSettings(c: Context): Promise<Settings> {
  const account = sessionAccount(c);
  if (!account) {
    return { redirect: signInHref(SETTINGS_PATH) };
  }
  if (!hasHandle(account)) {
    return { redirect: welcomeHref(SETTINGS_PATH) };
  }
  const [links, keys, invites] = await Promise.all([
    linksOf(account.id),
    keysOf(c, account.id),
    invitesFor(c, account),
  ]);
  return { handle: account.handle, name: account.name, links, keys, invites };
}
