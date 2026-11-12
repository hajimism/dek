// The browser's calls to dek.pub's own JSON API, with the session cookie. An error answer carries
// protocol ErrorBody; its message is what the page shows.

const DEADLINE_MS = 15_000;

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    // biome-ignore lint/style/noRestrictedGlobals: same-origin API calls, cut off after DEADLINE_MS.
    response = await fetch(path, {
      method: init.method ?? "GET",
      credentials: "same-origin",
      headers: init.body === undefined ? {} : { "content-type": "application/json" },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(DEADLINE_MS),
    });
  } catch {
    throw new ApiFailure(0, "offline", "");
  }
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiFailure(
      response.status,
      error?.code ?? String(response.status),
      error?.message ??
        (typeof (data as { message?: string } | null)?.message === "string"
          ? String((data as { message: string }).message)
          : response.statusText),
    );
  }
  return data as T;
}
