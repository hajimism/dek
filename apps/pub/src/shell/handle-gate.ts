// Until the signed-in account has chosen a handle, every page sends it to choose one first, and
// back to the page it asked for after (ADR 77). Only a page is sent, whether the browser opens it
// or Void's router asks for its data (`x-voidpages`): a feed, a script or a stylesheet the welcome
// page needs answers as before, and the API answers `handle_needed` itself.

import { welcomeHref } from "../model/person/sign-in-path.ts";
import type { Self } from "../model/person/type.ts";

/** Where a page request goes instead, or null to let it through. */
export function handleGate(
  viewer: Self | null,
  request: { method: string; url: URL; accept: string | null; pageData: boolean },
): string | null {
  if (viewer === null || viewer.handle !== null) {
    return null;
  }
  const page =
    (request.method === "GET" || request.method === "HEAD") &&
    (request.pageData || request.accept?.includes("text/html") === true);
  if (!page || request.url.pathname === "/welcome") {
    return null;
  }
  return welcomeHref(request.url.pathname + request.url.search);
}
