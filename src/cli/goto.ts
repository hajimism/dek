import { DekError } from "../core/error.ts";
import { isPidAlive, readDevServerLock } from "../server/lock.ts";
import { requireDeckFromCwd, requireProject, requireSection } from "./scope.ts";

export type NavResult = {
  slug: string;
  slideIndex: number;
  beatIndex: number;
};

export async function gotoCommand(options: {
  cwd: string;
  slug?: string;
  deck?: string;
}): Promise<NavResult> {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek goto <slug>", { hint: "usage: dek goto <slug>" });
  }
  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  requireSection(deck, slug);
  return requestDevServer(options.cwd, deck.name, {
    method: "POST",
    path: "goto",
    body: { slug },
  });
}

export async function currentCommand(options: { cwd: string; deck?: string }): Promise<NavResult> {
  const { deck } = requireDeckFromCwd(options.cwd, options.deck);
  return requestDevServer(options.cwd, deck.name, { method: "GET", path: "current" });
}

async function requestDevServer(
  cwd: string,
  deckName: string,
  request: { method: "GET" | "POST"; path: "goto" | "current"; body?: { slug: string } },
): Promise<NavResult> {
  const project = requireProject(cwd);
  const lock = readDevServerLock(project.root);
  if (!lock || !isPidAlive(lock.pid)) {
    throw new DekError("dev server is not running", { hint: "run `dek`" });
  }

  const url = new URL(`/decks/${deckName}/${request.path}`, lock.url);
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
  const json = (await response.json()) as {
    ok?: boolean;
    slug?: string;
    slideIndex?: number;
    beatIndex?: number;
    error?: { message?: string };
  };
  if (!response.ok || json.ok === false || json.slug === undefined) {
    throw new DekError(json.error?.message ?? `dev server ${request.path} failed`, {
      hint: "run `dek`",
    });
  }
  return {
    slug: json.slug,
    slideIndex: json.slideIndex ?? 0,
    beatIndex: json.beatIndex ?? 0,
  };
}
