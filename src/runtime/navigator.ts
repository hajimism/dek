/// <reference lib="dom" />

import {
  decodePointer,
  decodePosition,
  encodePointer,
  encodePosition,
  type Pointer,
} from "../core/live-protocol.ts";
import {
  clampPosition,
  type DeckStops,
  formatHash,
  hashChangeTarget,
  historyMode,
  positionFromHash,
  positionsEqual,
} from "../core/position.ts";
import type { Position } from "../core/step.ts";
import { applyIncomingPosition, createGuardedGo } from "./go.ts";
import type { PositionHandlers, PositionSocket } from "./socket.ts";

/**
 * Where a move came from. Local moves, and the rehearsal clock's, are published to peers; remote
 * ones arrived from one; a hash move came from the URL, which already holds its history entry.
 * Capture (the video recorder and morph shots, through `window.dekGo`) drives this page alone.
 */
export type GoOrigin = "local" | "rehearse" | "remote" | "hash" | "capture";

export type Navigator = {
  /** What is on screen. */
  position(): Position;
  /**
   * Where the deck is headed: `position()` once the moves asked for have run. Moves step from
   * here, so every press counts even while a transition is still playing.
   */
  target(): Position;
  go(next: Position | null | undefined, origin?: GoOrigin): Promise<void>;
  /** Write the position to the URL, e.g. once a hash past a slide's last beat was clamped. */
  writeHash(mode: "push" | "replace"): void;
  /** Tell the other windows and the server where this window's laser points, or that it went away. */
  point(pointer: Pointer | null): void;
};

type GoRequest = { position: Position; origin: GoOrigin };

/**
 * Owns where the deck is: the position, the one it is headed to, and the lines that carry it
 * (the URL, other windows, the dev server's socket), which also carry where a laser points.
 * Drawing a move is left to `present`.
 */
export function createNavigator(options: {
  deck: DeckStops;
  channelName: string;
  /** Open the dev server's position socket; a file that stands alone has none to open. */
  connect?: (handlers: PositionHandlers) => PositionSocket;
  /**
   * Draw the move from `from` to `to`. `apply` puts it on screen, perhaps inside a transition;
   * the promise settles once the move has played.
   */
  present: (from: Position, to: Position, apply: () => void) => Promise<void>;
  /** A newer move is waiting: cut the one in flight short. */
  hurry: () => void;
  /** The deck now stands on `to`. */
  onMove: (from: Position, to: Position) => void;
  /** A move is about to run. */
  beforeMove?: () => void;
  /** A move has played out. */
  afterMove?: () => void;
  /** Where a peer's move goes, once clamped and new; left out, the deck goes there. */
  route?: (next: Position) => void;
  /** Where a peer's laser points, or null once it went away. */
  onPointer?: (pointer: Pointer | null) => void;
}): Navigator {
  const slugs = options.deck.map((slide) => slide.slug);
  // One channel per deck: two decks' built files open side by side must not drive each other.
  const channel = new BroadcastChannel(options.channelName);
  let pos = positionFromHash(location.hash, options.deck);
  let target = pos;

  /**
   * Write `pos` to the URL without a hashchange, so the handler only ever hears the reader:
   * a typed hash, Back, or Forward.
   */
  function writeHash(mode: "push" | "replace"): void {
    const hash = formatHash(pos, slugs);
    if (!hash || location.hash === hash) {
      return;
    }
    try {
      history[mode === "push" ? "pushState" : "replaceState"](null, "", hash);
    } catch {
      // A browser that refuses history on this URL still takes a hash; its echo matches `target`.
      location.hash = hash;
    }
  }

  const runGo = createGuardedGo(
    async ({ position: next, origin }: GoRequest) => {
      options.beforeMove?.();
      await options.present(pos, next, () => {
        const from = pos;
        pos = next;
        writeHash(origin === "hash" ? "replace" : historyMode(from, next));
        options.onMove(from, next);
      });
      options.afterMove?.();
    },
    { onQueue: options.hurry },
  );

  let remote: PositionSocket | undefined;

  /** Tell the other windows and the server where the deck is headed. */
  function publish(position: Position): void {
    channel.postMessage(encodePosition(position));
    remote?.publish(position);
  }

  /**
   * Move to `next`. A local move is published at once, so a second window follows the key press
   * rather than the end of this window's animation. A remote one came from a peer and is not
   * sent back: a peer that had moved on would be rewound by the echo.
   */
  function go(next: Position | null | undefined, origin: GoOrigin = "local"): Promise<void> {
    if (next == null) {
      return runGo(undefined);
    }
    target = next;
    if (origin === "local" || origin === "rehearse") {
      publish(next);
    }
    return runGo({ position: next, origin });
  }

  /** A position a peer sent: clamped to this deck, and dropped when the deck already heads there. */
  function receive(next: Position): void {
    const clamped = clampPosition(next, options.deck);
    if (!clamped) {
      return;
    }
    applyIncomingPosition(options.route ?? ((incoming) => go(incoming, "remote")), clamped, {
      equal: positionsEqual,
      current: () => target,
    });
  }

  channel.addEventListener("message", (event: MessageEvent) => {
    const laser = decodePointer(event.data);
    if (laser) {
      options.onPointer?.(laser.pointer);
      return;
    }
    const next = decodePosition(event.data);
    if (next) {
      receive(next);
    }
  });
  if (options.connect) {
    remote = options.connect({
      onPosition: receive,
      ...(options.onPointer ? { onPointer: options.onPointer } : {}),
    });
    // A page that is really going away must not dial back in; one kept for Back reconnects.
    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) {
        remote?.close();
      }
    });
  }
  window.addEventListener("hashchange", () => {
    void go(hashChangeTarget(target, location.hash, options.deck), "hash");
  });

  return {
    position: () => pos,
    target: () => target,
    go,
    writeHash,
    point(pointer) {
      channel.postMessage(encodePointer(pointer));
      remote?.point(pointer);
    },
  };
}
