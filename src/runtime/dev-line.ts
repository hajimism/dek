/// <reference lib="dom" />

import { isLiveEvent } from "../core/live-protocol.ts";
import { ANNOTATIONS_CHANGED, type PageConfig } from "../core/page.ts";
import type { Position } from "../core/step.ts";
import { applyLiveEvent, hydrateLiveEvent } from "./live.ts";
import { documentLiveHost } from "./live-host.ts";
import { createMarksView, type MarksView } from "./marks-view.ts";
import type { GoOrigin } from "./navigator.ts";
import { createRehearseController, fetchRehearsal, type RehearseController } from "./rehearse.ts";
import { deckUrl, liveTokenQuery } from "./routes.ts";
import { createPositionSocket, type PositionHandlers, type PositionSocket } from "./socket.ts";

/**
 * What the page has of the dev server: the position socket, the marks, the rehearsal, and the
 * live updates. Only the player the dev server embeds is built with it; a file that stands alone
 * has no server to reach, so its player never imports this module.
 */
export type DevLine = {
  /** Open the position socket, for the navigator. */
  connect: (handlers: PositionHandlers) => PositionSocket;
  rehearse: RehearseController;
  /** Only the presenter bar has the mark button. */
  marks: MarksView | undefined;
  /**
   * Load the rehearsal the URL asks for, and take the server's live updates from here on.
   * `redraw` puts the beat back as it stood once one has changed the page.
   */
  start(redraw: () => void): void;
};

export type CreateDevLine = typeof createDevLine;

export function createDevLine(options: {
  page: PageConfig;
  /** Move the deck. */
  go: (position: Position, origin: GoOrigin) => Promise<void>;
  /** Where the deck is headed. */
  target: () => Position;
  /** What is on screen. */
  position: () => Position;
}): DevLine {
  const token = liveTokenQuery(options.page.liveToken);
  const route = (kind: "socket" | "marks"): string =>
    `${deckUrl(location.pathname, { kind })}${token}`;

  const rehearse = createRehearseController({
    load: () =>
      fetchRehearsal(location.pathname, {
        fetch: (input, init) => fetch(input, init),
        audio: (src) => new Audio(src),
      }),
    go: options.go,
    current: options.target,
  });

  const marks = createMarksView({
    url: route("marks"),
    current: options.position,
    fetch: (input, init) => fetch(input, init),
  });

  function connect(handlers: PositionHandlers): PositionSocket {
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${route("socket")}`;
    return createPositionSocket({
      connect: () => new WebSocket(url),
      ...handlers,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (id) => window.clearTimeout(id),
    });
  }

  function start(redraw: () => void): void {
    const rehearseMode = new URLSearchParams(location.search).has("rehearse");
    if (rehearseMode) {
      void rehearse.load();
    }
    const liveHost = documentLiveHost();
    // Keep a string key so minify does not rename the hook liveReloadScript calls.
    // biome-ignore lint/complexity/useLiteralKeys: liveReloadScript looks up window["dekLive"]
    window["dekLive"] = async (raw: unknown) => {
      if (!isLiveEvent(raw)) {
        location.reload();
        return;
      }
      if (raw.type === "timeline") {
        if (rehearseMode) {
          await rehearse.load();
        }
        return;
      }
      if (raw.type === "annotations") {
        document.dispatchEvent(new Event(ANNOTATIONS_CHANGED));
        return;
      }
      const event = await hydrateLiveEvent(raw, location.pathname);
      if (!event) {
        location.reload();
        return;
      }
      if (applyLiveEvent(event, liveHost).reload) {
        location.reload();
        return;
      }
      redraw();
    };
  }

  return { connect, rehearse, marks, start };
}
