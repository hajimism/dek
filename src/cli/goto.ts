import { DekcError } from "../core/error.ts";
import { deckRoutePath } from "../runtime/routes.ts";
import { isPidAlive, readDevServerLock } from "../server/lock.ts";
import { type DeckTarget, requireSection } from "./scope.ts";

export type NavResult = {
  slug: string;
  slideIndex: number;
  beatIndex: number;
  /** The pages that show the deck; with none, the position is where the next one lands. */
  viewers: number;
};

export async function gotoCommand(target: DeckTarget, slug: string): Promise<NavResult> {
  requireSection(target.deck, slug);
  return requestDevServer(target, {
    method: "POST",
    path: "goto",
    body: { slug },
  });
}

export async function currentCommand(target: DeckTarget): Promise<NavResult> {
  return requestDevServer(target, { method: "GET", path: "current" });
}

async function requestDevServer(
  { project, deck }: DeckTarget,
  request: { method: "GET" | "POST"; path: "goto" | "current"; body?: { slug: string } },
): Promise<NavResult> {
  const deckName = deck.name;
  const lock = readDevServerLock(project.root);
  if (!lock || !isPidAlive(lock.pid)) {
    throw new DekcError("dev server is not running", { hint: "run `dekc`" });
  }

  // Under /decks/<name> whether or not the server is scoped to this deck; a scoped one takes both.
  const url = new URL(deckRoutePath(deckName, { kind: request.path }), lock.url);
  const headers: Record<string, string> = {};
  if (request.body) {
    headers["content-type"] = "application/json";
  }
  if (lock.password) {
    headers.authorization = `Basic ${btoa(`:${lock.password}`)}`;
  }
  const response = await fetch(url, {
    method: request.method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: request.body ? JSON.stringify(request.body) : undefined,
  });
  // Only the nav routes answer JSON; a 404, 401, or 405 from the server itself is plain text.
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw refusal(response.status, lock, deckName, request.path);
  }
  const json = (await response.json()) as {
    ok?: boolean;
    slug?: string;
    slideIndex?: number;
    beatIndex?: number;
    viewers?: number;
    error?: { message?: string };
  };
  if (!response.ok || json.ok === false || json.slug === undefined) {
    throw new DekcError(json.error?.message ?? `dev server ${request.path} failed`, {
      hint: "run `dekc`",
    });
  }
  return {
    slug: json.slug,
    slideIndex: json.slideIndex ?? 0,
    beatIndex: json.beatIndex ?? 0,
    viewers: json.viewers ?? 0,
  };
}

/** Why the server turned the request away before a nav route saw it. */
function refusal(
  status: number,
  lock: { url: string; deck?: string },
  deckName: string,
  path: string,
): DekcError {
  if (status === 404 && lock.deck !== undefined && lock.deck !== deckName) {
    return new DekcError(`the running dev server serves deck "${lock.deck}", not "${deckName}"`, {
      hint: `pass --deck ${lock.deck}, or stop the server at ${lock.url} and run \`dekc ${deckName}\``,
    });
  }
  if (status === 401) {
    return new DekcError(
      `the dev server at ${lock.url} refused the password in .dekc/server.json`,
      {
        hint: "restart it: stop `dekc` and run it again",
      },
    );
  }
  return new DekcError(`dev server ${path} failed with HTTP ${status}`, {
    hint: `restart the server at ${lock.url}: stop \`dekc\` and run it again`,
  });
}
