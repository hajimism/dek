/**
 * The dev server's URL scheme, shared by the server that matches paths and the page that builds
 * them. Everything a deck serves sits under `/decks/:name`, or at the root of a server scoped to
 * that deck; `DeckRoute` is what follows that prefix.
 */
export type VoiceFile = "timeline.json" | "audio.wav";

export type DeckRoute =
  | { kind: "player" }
  | { kind: "presenter" }
  /** The position socket. */
  | { kind: "socket" }
  /** The live event stream. */
  | { kind: "events" }
  | { kind: "theme" }
  | { kind: "slide"; slug: string }
  | { kind: "voice"; file: VoiceFile }
  /** `dek current` and `dek goto`. */
  | { kind: "current" }
  | { kind: "goto" }
  /** The beats the presenter marked to rewrite: listed, and one marked or unmarked. */
  | { kind: "marks" }
  /** A file under the deck's `assets/`, decoded. */
  | { kind: "asset"; path: string };

type Fixed = Exclude<DeckRoute, { kind: "slide" | "voice" | "asset" }>["kind"];

const FIXED: Record<Fixed, string> = {
  player: "/",
  presenter: "/presenter",
  socket: "/ws",
  events: "/events",
  theme: "/theme",
  current: "/current",
  goto: "/goto",
  marks: "/marks",
};

/** The path of `route` below its deck's prefix. */
export function formatDeckRoute(route: DeckRoute): string {
  switch (route.kind) {
    case "slide":
      return `/slide/${encodeURIComponent(route.slug)}`;
    case "voice":
      return `/voice/${route.file}`;
    case "asset":
      return `/assets/${route.path.split("/").map(encodeURIComponent).join("/")}`;
    default:
      return FIXED[route.kind];
  }
}

/** The route `rest` names below a deck's prefix; a fixed path may end in a slash. */
export function parseDeckRoute(rest: string): DeckRoute | undefined {
  const bare = rest.length > 1 && rest.endsWith("/") ? rest.slice(0, -1) : rest || "/";
  for (const [kind, path] of Object.entries(FIXED) as Array<[Fixed, string]>) {
    if (bare === path) {
      return { kind };
    }
  }
  try {
    const slug = rest.match(/^\/slide\/([^/]+)\/?$/)?.[1];
    if (slug) {
      return { kind: "slide", slug: decodeURIComponent(slug) };
    }
    const file = rest.match(/^\/voice\/(timeline\.json|audio\.wav)$/)?.[1];
    if (file) {
      return { kind: "voice", file: file as VoiceFile };
    }
    const asset = rest.match(/^\/assets\/(.+)$/)?.[1];
    if (asset) {
      return { kind: "asset", path: decodeURIComponent(asset) };
    }
  } catch {
    // Malformed percent-encoding names nothing.
  }
  return undefined;
}

/** Where `route` is on a server that serves every deck, for the deck named `deckName`. */
export function deckRoutePath(deckName: string, route: DeckRoute): string {
  return `/decks/${encodeURIComponent(deckName)}${formatDeckRoute(route)}`;
}

/**
 * `localPath` under the deck the page at `pathname` belongs to. `liveReloadScript` embeds this
 * function's source, so it must stay self-contained.
 */
export function withDeckPrefix(pathname: string, localPath: string): string {
  const deck = pathname.match(/^\/decks\/([^/]+)/)?.[1];
  return deck ? `/decks/${deck}${localPath}` : localPath;
}

/** Where `route` is for the page at `pathname`. */
export function deckUrl(pathname: string, route: DeckRoute): string {
  return withDeckPrefix(pathname, formatDeckRoute(route));
}

/** Inverse of `withDeckPrefix`: `/decks/:name/rest` or a scoped local path, the name decoded. */
export function splitDeckPath(
  pathname: string,
  scopedDeckName?: string,
): { deckName: string; rest: string } | undefined {
  const prefixed = pathname.match(/^\/decks\/([^/]+)(\/.*)?$/);
  if (prefixed?.[1]) {
    const deckName = decodeSegment(prefixed[1]);
    // A server scoped to one deck shares that deck, not the rest of the project.
    if (deckName === undefined || (scopedDeckName !== undefined && deckName !== scopedDeckName)) {
      return undefined;
    }
    return { deckName, rest: prefixed[2] ?? "/" };
  }
  if (!scopedDeckName) {
    return undefined;
  }
  return { deckName: scopedDeckName, rest: pathname };
}

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * The query a live channel carries for the presenter's token, or nothing on an audience page.
 * `liveReloadScript` embeds this function's source, so it must stay self-contained.
 */
export function liveTokenQuery(token: string | undefined): string {
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

/**
 * The BroadcastChannel a deck's windows share. Built files share one origin under `file://`,
 * so the name carries the deck and its slides: an audience view and a presenter view of one
 * deck follow each other, and two decks open side by side do not.
 */
export function deckChannelName(deck: string | undefined, slugs: readonly string[]): string {
  return `dek:${deck ?? ""}:${slugs.join(",")}`;
}
