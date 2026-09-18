export function controlAuth(req: Request, password: string | undefined): Response | undefined {
  return presenterAuth(req, "presenter", password);
}

export function presenterAuth(
  req: Request,
  mode: "player" | "presenter",
  password: string | undefined,
): Response | undefined {
  if (mode !== "presenter" || !password) {
    return undefined;
  }
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice("Basic ".length));
      const colon = decoded.indexOf(":");
      const pass = colon >= 0 ? decoded.slice(colon + 1) : decoded;
      if (pass === password) {
        return undefined;
      }
    } catch {
      /* malformed credentials */
    }
  }
  return new Response("Unauthorized\n", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="dek presenter"' },
  });
}

export function wsHasControl(req: Request, password: string | undefined): boolean {
  if (!password) {
    return true;
  }
  const token = new URL(req.url).searchParams.get("token");
  if (token === password) {
    return true;
  }
  return presenterAuth(req, "presenter", password) === undefined;
}
