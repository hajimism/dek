import type { z } from "zod";
import pkg from "../../../package.json";
import {
  API_KEY_HEADER,
  answerOf,
  ErrorBody,
  MAX_VERSION_BYTES,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
} from "../../pub/protocol.ts";
import { DekError } from "../error.ts";
import type { Key } from "./store.ts";

/** Where `dekc pub` goes when neither --server nor DEK_PUB_SERVER names another. */
export const DEFAULT_SERVER = "https://dek.pub";

/** A call that answers in a moment; a stall this long is a dead connection. */
const CALL_TIMEOUT_MS = 30 * 1000;

/** An upload of a version, three builds and a picture per slide, on a slow line. */
export const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const SERVER_HINT =
  "check the network and run the command again; if your dek.pub is elsewhere, pass --server <url> or set DEK_PUB_SERVER";

/**
 * The origin of the dek.pub to talk to: --server, else DEK_PUB_SERVER, else dek.pub itself. A key
 * goes over HTTPS only, or plain HTTP to this machine, as a server under development is.
 */
export function serverOrigin(flag?: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.DEK_PUB_SERVER?.trim();
  const raw = flag ?? (fromEnv || DEFAULT_SERVER);
  const named = flag !== undefined ? `--server "${flag}"` : `DEK_PUB_SERVER "${fromEnv}"`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DekError(`invalid ${named}`, {
      hint: `name the server by its address, like ${DEFAULT_SERVER}`,
    });
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new DekError(`${named} is not served over HTTPS`, {
      hint: `dek sends its key only over HTTPS, or plain HTTP to this machine; use an https:// address, like ${DEFAULT_SERVER}`,
    });
  }
  return url.origin;
}

/** A failed answer from dek.pub: its status and the stable code of its error body. */
export class PubError extends DekError {
  readonly status: number;
  readonly code: string | undefined;

  constructor(
    message: string,
    options: { status: number; code?: string; hint?: string; cause?: unknown },
  ) {
    super(message, {
      ...(options.hint !== undefined ? { hint: options.hint } : {}),
      cause: options.cause,
    });
    this.name = "PubError";
    this.status = options.status;
    this.code = options.code;
  }
}

export type PubCall = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** What the call is for, as an error names it: "your account", "the deck". */
  what: string;
  query?: Record<string, string>;
  /** A JSON body. */
  json?: unknown;
  /** A multipart body. */
  form?: FormData;
  /** The API key, sent as x-api-key, and where it came from, for the hint when it is refused. */
  key?: Key;
  /** The device flow's access token, sent as a Bearer token. */
  bearer?: string;
  timeoutMs?: number;
};

/**
 * One request to dek.pub, as every `dekc pub` call makes it: the protocol version in its header,
 * a deadline, and any failure as an error that says what did not answer and what to do.
 */
export async function send(origin: string, call: PubCall): Promise<Response> {
  const timeoutMs = call.timeoutMs ?? CALL_TIMEOUT_MS;
  const url = new URL(call.path, origin);
  for (const [name, value] of Object.entries(call.query ?? {})) {
    url.searchParams.set(name, value);
  }
  const timeout = AbortSignal.timeout(timeoutMs);
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": `dekc/${pkg.version}`,
    [PROTOCOL_HEADER]: String(PROTOCOL_VERSION),
    ...(call.key !== undefined ? { [API_KEY_HEADER]: call.key.key } : {}),
    ...(call.bearer !== undefined ? { authorization: `Bearer ${call.bearer}` } : {}),
    ...(call.json !== undefined ? { "content-type": "application/json" } : {}),
  };
  try {
    // biome-ignore lint/style/noRestrictedGlobals: the timeout's signal bounds the request, its body included.
    return await fetch(url, {
      method: call.method,
      headers,
      ...(call.json !== undefined ? { body: JSON.stringify(call.json) } : {}),
      ...(call.form !== undefined ? { body: call.form } : {}),
      redirect: "error",
      signal: timeout,
    });
  } catch (error) {
    if (timeout.aborted) {
      throw new DekError(
        `${origin} did not answer within ${timeoutMs / 1000}s while fetching ${call.what}`,
        { hint: SERVER_HINT, cause: error },
      );
    }
    throw new DekError(`could not reach ${origin} for ${call.what}`, {
      hint: SERVER_HINT,
      cause: error,
    });
  }
}

/**
 * `send`, then the answer read as `schema`, or the error the server gave as a PubError. The answer
 * is read through `answerOf`: a field a newer server added is dropped, not refused.
 */
export async function request<S extends z.ZodType>(
  origin: string,
  call: PubCall,
  schema: S,
): Promise<z.infer<S>> {
  const response = await send(origin, call);
  const body = await readBody(response, origin, call);
  if (!response.ok) {
    throw failure(response.status, body, origin, call);
  }
  const parsed = answerOf(schema).safeParse(body);
  if (!parsed.success) {
    throw unreadable(origin, call);
  }
  return parsed.data as z.infer<S>;
}

async function readBody(response: Response, origin: string, call: PubCall): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch (error) {
    throw new DekError(`${origin} stopped answering while sending ${call.what}`, {
      hint: SERVER_HINT,
      cause: error,
    });
  }
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A failed answer as the error dek prints: the server's own words when it sent an ErrorBody. */
export function failure(status: number, body: unknown, origin: string, call: PubCall): PubError {
  const parsed = answerOf(ErrorBody).safeParse(body);
  // dek knows better than the server what to do about a key it was handed, or a size it sent.
  const own = ownHint(status, call);
  if (parsed.success) {
    const { code, message, hint } = parsed.data.error;
    return new PubError(message, { status, code, hint: own ?? hint ?? statusHint(status) });
  }
  return new PubError(`${origin} answered ${status} for ${call.what}`, {
    status,
    hint: own ?? statusHint(status),
  });
}

/** The hint dek gives whatever the server says: for a key from DEK_TOKEN, and for a size. */
function ownHint(status: number, call: PubCall): string | undefined {
  if (status === 401 && call.key?.source === "env") {
    return "the server does not take the key in DEK_TOKEN: replace it with a key that works, or unset DEK_TOKEN to use the one `dekc pub login` keeps";
  }
  if (status === 413) {
    return `a version holds ${MAX_VERSION_BYTES / 1024 / 1024} MiB at most, every build, the source, and the pictures together; make the deck's assets smaller, then publish again`;
  }
  return undefined;
}

function statusHint(status: number): string {
  if (status === 401) {
    return "run `dekc pub login`, then the command again";
  }
  if (status === 403) {
    return "the account signed in may not do this; `dekc pub whoami` says which it is";
  }
  if (status === 404) {
    return "check `pub:` in script.md, and that `dekc pub whoami` names the deck's owner; a deck deleted from dek.pub is gone, so take pub: out of script.md to publish it as a new one";
  }
  return status >= 500 ? "dek.pub failed to answer; run the command again in a while" : SERVER_HINT;
}

export function unreadable(origin: string, call: PubCall): DekError {
  return new DekError(`${origin} answered ${call.what} in a shape this dekc does not read`, {
    hint: "update dek with `bun add -d @hajimism/dek@latest`, and check that --server or DEK_PUB_SERVER names a dek.pub",
  });
}
