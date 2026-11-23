import { DekError } from "../core/error.ts";
import { deckRoutePath } from "../runtime/routes.ts";
import { type DevServerLock, devServersFor } from "../server/lock.ts";
import { deckFlag, deckWord } from "./address.ts";
import { isTypedCommand } from "./commands.ts";
import { type DeckTarget, requireSection } from "./scope.ts";

export type NavResult = {
  slug: string;
  slideIndex: number;
  beatIndex: number;
  /** The pages that show the deck; with none, the position is where the next one lands. */
  viewers: number;
  /** The deck's page on the dev server that answered: what a browser opens to show the deck. */
  url: string;
};

type NavOptions = {
  /** Covers the whole request, from connecting to the last byte of the answer. */
  timeoutMs?: number;
};

/** The dev server answers a nav request at once; a stall this long is a server that is stuck. */
const NAV_TIMEOUT_MS = 10 * 1000;

export async function gotoCommand(
  target: DeckTarget,
  slug: string,
  options: NavOptions = {},
): Promise<NavResult> {
  requireSection(target.deck, slug);
  return requestDevServer(
    target,
    { method: "POST", path: "goto", body: { slug } },
    options.timeoutMs ?? NAV_TIMEOUT_MS,
  );
}

export async function currentCommand(
  target: DeckTarget,
  options: NavOptions = {},
): Promise<NavResult> {
  return requestDevServer(
    target,
    { method: "GET", path: "current" },
    options.timeoutMs ?? NAV_TIMEOUT_MS,
  );
}

async function requestDevServer(
  { project, deck }: DeckTarget,
  request: NavRequest,
  timeoutMs: number,
): Promise<NavResult> {
  // The server started for this deck, then the one that serves the project. The first may be a
  // lock its server left behind, with a pid that is some other process by now.
  let taken: (DevServerLock & { path: string }) | undefined;
  for (const lock of devServersFor(project.root, deck.name)) {
    const answer = await askDevServer(lock, deck.name, request, timeoutMs);
    if (typeof answer === "object") {
      return answer;
    }
    if (answer === "another's") {
      taken = lock;
    }
  }
  // A start would take that lock for a live server's, since something listens there: only
  // removing it lets `dekc` start one for the deck.
  throw taken
    ? new DekError(
        `the lock of deck "${deck.name}" names ${taken.url}, which serves no such deck`,
        {
          path: taken.path,
          hint: `its server is gone and another program has its port: remove the file, then ${startHint(deck.name)}`,
        },
      )
    : notRunning(deck.name);
}

type NavRequest = { method: "GET" | "POST"; path: "goto" | "current"; body?: { slug: string } };

/**
 * What the server `lock` names answers for `deckName`, or why it is not that deck's server after
 * all: `gone` when nothing listens where the lock points, `another's` when what listens there
 * knows no such deck, as a server that took the port since does not.
 */
async function askDevServer(
  lock: DevServerLock & { path: string },
  deckName: string,
  request: NavRequest,
  timeoutMs: number,
): Promise<NavResult | "gone" | "another's"> {
  // Under /decks/<name> whether or not the server is scoped to this deck; a scoped one takes both.
  const url = new URL(deckRoutePath(deckName, { kind: request.path }), lock.url);
  const headers: Record<string, string> = {};
  if (request.body) {
    headers["content-type"] = "application/json";
  }
  if (lock.password) {
    headers.authorization = `Basic ${btoa(`:${lock.password}`)}`;
  }
  // A server that takes the connection but never answers is stuck; say so instead of waiting.
  const signal = AbortSignal.timeout(timeoutMs);
  const unlessStuck = (error: unknown): never => {
    throw signal.aborted
      ? new DekError(`the dev server at ${lock.url} did not answer within ${timeoutMs / 1000}s`, {
          hint: "restart it: stop `dekc` and run it again",
        })
      : error;
  };
  // biome-ignore lint/style/noRestrictedGlobals: signal, an AbortSignal.timeout, bounds the request and the read of its answer.
  const response = await fetch(url, {
    method: request.method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: request.body ? JSON.stringify(request.body) : undefined,
    signal,
  }).catch((error: unknown) => (isConnectionRefused(error) ? undefined : unlessStuck(error)));
  if (!response) {
    return "gone";
  }
  // Only the nav routes answer JSON; a 404, 401, or 405 from the server itself is plain text.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    // The lock is this deck's own, and the server there has no such deck: not the one it names.
    if (response.status === 404 && lock.deck === deckName) {
      return "another's";
    }
    throw refusal(response.status, lock, request.path);
  }
  const json = (await response.json().catch(unlessStuck)) as {
    ok?: boolean;
    slug?: string;
    slideIndex?: number;
    beatIndex?: number;
    viewers?: number;
    error?: { message?: string };
  };
  if (!response.ok || json.ok === false || json.slug === undefined) {
    throw new DekError(json.error?.message ?? `dev server ${request.path} failed`, {
      hint: "run `dekc`",
    });
  }
  return {
    slug: json.slug,
    slideIndex: json.slideIndex ?? 0,
    beatIndex: json.beatIndex ?? 0,
    viewers: json.viewers ?? 0,
    url: deckPage(lock, deckName),
  };
}

/**
 * Where a browser opens `deckName` on the server `lock` names: its root when it was started for
 * that deck alone, the deck's place under it otherwise. The password is never part of it.
 */
function deckPage(lock: { url: string; deck?: string }, deckName: string): string {
  return lock.deck === deckName
    ? lock.url
    : new URL(deckRoutePath(deckName, { kind: "player" }), lock.url).href;
}

/** Why the server turned the request away before a nav route saw it. */
function refusal(status: number, lock: DevServerLock & { path: string }, path: string): DekError {
  if (status === 401) {
    return new DekError(`the dev server at ${lock.url} refused the password in its lock`, {
      path: lock.path,
      hint: "restart it: stop `dekc` and run it again",
    });
  }
  return new DekError(`dev server ${path} failed with HTTP ${status}`, {
    hint: `restart the server at ${lock.url}: stop \`dekc\` and run it again`,
  });
}

/** No live server shows `deckName`, whatever serves the project's other decks. */
function notRunning(deckName: string): DekError {
  return new DekError(`no dev server serves deck "${deckName}"`, { hint: startHint(deckName) });
}

/** The command that starts a server for `deckName` alone, beside whatever else runs. */
function startHint(deckName: string): string {
  return `run \`dekc ${isTypedCommand(deckName) ? deckFlag(deckName) : deckWord(deckName)}\``;
}

/** Whether a request failed because nothing listens at the address, as Bun and Node name it. */
function isConnectionRefused(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "ECONNREFUSED";
}
