// The one place that reaches into Void for the Better Auth instance of the request. Void keeps it
// under `__voidAuth` on the context; nothing else in dek.pub depends on that name.

import type { Context } from "hono";

// Better Auth's instance type depends on the plugins in auth.ts, which Void types apart from it.
type BetterAuth = {
  // biome-ignore lint/suspicious/noExplicitAny: typed by the plugins auth.ts adds.
  api: any;
  // biome-ignore lint/suspicious/noExplicitAny: typed by the adapter Void picks.
  $context: Promise<any>;
  handler(request: Request): Promise<Response>;
};

export function authOf(c: Context): BetterAuth {
  const auth = c.get("__voidAuth") as BetterAuth | undefined;
  if (!auth) {
    throw new Error("Void did not set up auth for this request");
  }
  return auth;
}
