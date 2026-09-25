import { DekError } from "./error.ts";

/**
 * The two GitHub calls dek ref needs: pin a rev to a commit, and download
 * that commit. DEK_GITHUB_API points them elsewhere, the way DEK_VOICE_URL
 * does for the voice engine.
 */
const DEFAULT_API = "https://api.github.com";

/** A repository tarball larger than this is refused rather than held in memory. */
export const MAX_TARBALL_BYTES = 200 * 1024 * 1024;

/** A commit lookup is one small answer; a stall this long is a dead connection. */
const COMMIT_TIMEOUT_MS = 30 * 1000;

/** A tarball near the size cap on a slow line still fits well inside this. */
const TARBALL_TIMEOUT_MS = 10 * 60 * 1000;

const SIGN_IN_HINT =
  "if the repository is private, set GITHUB_TOKEN or run `gh auth login`, then run the command again";

export type GithubOptions = {
  /** Covers the whole call, from connecting to the last byte of the body. */
  timeoutMs?: number;
};

export type TarballOptions = GithubOptions & {
  maxBytes?: number;
};

function apiBase(): string {
  return (process.env.DEK_GITHUB_API ?? DEFAULT_API).replace(/\/+$/, "");
}

/** GITHUB_TOKEN, else what `gh auth token` prints, else nothing: public repositories need no token. */
function token(): string | undefined {
  const fromEnv = process.env.GITHUB_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const result = Bun.spawnSync([process.env.DEK_GH ?? "gh", "auth", "token"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const printed = result.exitCode === 0 ? result.stdout.toString().trim() : "";
    return printed || undefined;
  } catch {
    return undefined;
  }
}

/**
 * One call's deadline. `signal` goes to fetch and fires on the timeout or on
 * `abort`, which is how a download is dropped: cancelling the body reader
 * alone leaves the connection open. `timeout` tells the two apart.
 */
type Deadline = {
  signal: AbortSignal;
  timeout: AbortSignal;
  abort: () => void;
  expired: () => DekError;
};

function deadline(what: string, timeoutMs: number): Deadline {
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(timeoutMs);
  return {
    signal: AbortSignal.any([controller.signal, timeout]),
    timeout,
    abort: () => controller.abort(),
    expired: () =>
      new DekError(`GitHub timed out after ${timeoutMs / 1000}s while fetching ${what}`, {
        hint: "check the network and run the command again; GitHub may also be slow, see https://www.githubstatus.com",
      }),
  };
}

function rateLimitHint(retryAfter: string | null): string {
  const wait = retryAfter ? `wait ${retryAfter}s, and ` : "";
  return `${wait}set GITHUB_TOKEN or run \`gh auth login\` to raise the limit, then run the command again`;
}

async function request(
  path: string,
  what: string,
  accept: string,
  { signal, timeout, expired }: Deadline,
): Promise<Response> {
  const auth = token();
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      headers: {
        accept,
        "user-agent": "dek",
        ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      },
      redirect: "follow",
      signal,
    });
  } catch (error) {
    if (timeout.aborted) {
      throw expired();
    }
    throw new DekError(`could not reach GitHub for ${what}`, {
      cause: error,
      hint: "check the network; an agent sandbox may block it, so run the command yourself",
    });
  }
  if (response.ok) {
    return response;
  }
  if (response.status === 404) {
    throw new DekError(`${what} not found on GitHub`, { hint: SIGN_IN_HINT });
  }
  const retryAfter = response.headers.get("retry-after");
  if (
    (response.status === 403 || response.status === 429) &&
    (retryAfter !== null || response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new DekError(`GitHub rate limit reached while fetching ${what}`, {
      hint: rateLimitHint(retryAfter),
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new DekError(`GitHub refused access to ${what} (${response.status})`, {
      hint: SIGN_IN_HINT,
    });
  }
  throw new DekError(`GitHub answered ${response.status} for ${what}`, {
    hint: "run the command again; if it keeps failing, check https://www.githubstatus.com",
  });
}

/** The full sha a rev names; the default branch when `rev` is omitted. */
export async function resolveRev(
  owner: string,
  repo: string,
  rev?: string,
  options: GithubOptions = {},
): Promise<string> {
  const what = `${owner}/${repo}${rev ? `@${rev}` : ""}`;
  const response = await request(
    `/repos/${owner}/${repo}/commits/${encodeURIComponent(rev ?? "HEAD")}`,
    what,
    "application/vnd.github.sha",
    deadline(what, options.timeoutMs ?? COMMIT_TIMEOUT_MS),
  );
  const sha = (await response.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    throw new DekError(`GitHub did not return a commit for ${what}`, {
      hint: "run the command again",
    });
  }
  return sha;
}

/** The repository at one commit, as a gzipped tarball. */
export async function downloadTarball(
  owner: string,
  repo: string,
  sha: string,
  options: TarballOptions = {},
): Promise<Uint8Array> {
  const what = `${owner}/${repo}@${sha.slice(0, 7)}`;
  const maxBytes = options.maxBytes ?? MAX_TARBALL_BYTES;
  const limit = deadline(what, options.timeoutMs ?? TARBALL_TIMEOUT_MS);
  const response = await request(`/repos/${owner}/${repo}/tarball/${sha}`, what, "*/*", limit);
  const tooLarge = new DekError(`${what} is larger than ${maxBytes / 1024 / 1024} MB`, {
    hint: "dek ref downloads the whole repository; keep decks in a smaller repository",
  });
  if (Number(response.headers.get("content-length") ?? 0) > maxBytes) {
    throw tooLarge;
  }
  return readBody(response, maxBytes, tooLarge, limit);
}

/**
 * The body, chunk by chunk, giving up as soon as it passes `maxBytes`:
 * codeload answers chunked, so the content-length check above rarely applies.
 * The fetch signal does not wake a read in progress, so the timeout also
 * cancels the reader.
 */
async function readBody(
  response: Response,
  maxBytes: number,
  tooLarge: DekError,
  { timeout, abort, expired }: Deadline,
): Promise<Uint8Array> {
  if (!response.body) {
    return new Uint8Array(0);
  }
  const reader = response.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  timeout.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        abort();
        throw tooLarge;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (timeout.aborted) {
      throw expired();
    }
    throw error;
  } finally {
    timeout.removeEventListener("abort", cancel);
  }
  if (timeout.aborted) {
    throw expired();
  }
  return concat(chunks, total);
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
