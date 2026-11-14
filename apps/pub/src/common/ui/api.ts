// The browser's calls to dek.pub's own JSON API, with the session cookie. An error answer carries
// protocol ErrorBody; its message, and its hint when it has one, are what the page shows.

const DEADLINE_MS = 15_000;

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** What to do about it, as the server put it. */
    readonly hint = "",
  ) {
    super(message);
  }
}

/**
 * A same-origin call with the session cookie, cut off after DEADLINE_MS: its status and its body
 * read as JSON, null when it has none. A call that never got an answer throws.
 */
export async function fetchJson(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; ok: boolean; statusText: string; data: unknown }> {
  // biome-ignore lint/style/noRestrictedGlobals: same-origin calls, cut off after DEADLINE_MS.
  const response = await fetch(path, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body === undefined ? {} : { "content-type": "application/json" },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    signal: AbortSignal.timeout(DEADLINE_MS),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, ok: response.ok, statusText: response.statusText, data };
}

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  let answer: Awaited<ReturnType<typeof fetchJson>>;
  try {
    answer = await fetchJson(path, init);
  } catch {
    throw new ApiFailure(0, "offline", "");
  }
  const { data } = answer;
  if (!answer.ok) {
    const error = (data as { error?: { code?: string; message?: string; hint?: string } } | null)
      ?.error;
    throw new ApiFailure(
      answer.status,
      error?.code ?? String(answer.status),
      error?.message ??
        (typeof (data as { message?: string } | null)?.message === "string"
          ? String((data as { message: string }).message)
          : answer.statusText),
      error?.hint ?? "",
    );
  }
  return data as T;
}
