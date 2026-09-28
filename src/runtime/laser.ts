import type { Pointer } from "../core/live-protocol.ts";

/** How often a laser held still says again where it points. */
export const LASER_HEARTBEAT_MS = 1_000;

/**
 * How long a dot stays with no word from its laser. Past a few heartbeats missed, the window
 * that pointed has closed or lost its line, and a dot left on the projector would mislead.
 */
export const LASER_STALE_MS = 3_000;

type Rect = { left: number; top: number; width: number; height: number };

/** Where on the slide a point in the window falls, as a share of each side; nothing off it. */
export function pointOnSlide(
  client: { x: number; y: number },
  rect: Rect,
): { x: number; y: number } | undefined {
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  const x = (client.x - rect.left) / rect.width;
  const y = (client.y - rect.top) / rect.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : undefined;
}

type Timers = {
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
};

export type LaserFeed = {
  /** The laser points here now. */
  point(pointer: Pointer): void;
  /** The laser went away: off the slide, the finger lifted, or the laser turned off. */
  lift(): void;
};

/**
 * What one window's laser sends. A hand moves the pointer many times a frame, so only the latest
 * point of each frame goes out; a hand held still says again where it points each heartbeat, so
 * the other windows can tell a laser at rest from one that is gone.
 */
export function createLaserFeed(
  options: Timers & {
    send: (pointer: Pointer | null) => void;
    /** Run once before the next paint: requestAnimationFrame in a browser. */
    frame: (fn: () => void) => void;
  },
): LaserFeed {
  let latest: Pointer | undefined;
  let framed = false;
  let heartbeat: number | undefined;
  let pointing = false;

  const stopHeartbeat = (): void => {
    if (heartbeat !== undefined) {
      options.clearTimer(heartbeat);
      heartbeat = undefined;
    }
  };

  const send = (pointer: Pointer): void => {
    pointing = true;
    options.send(pointer);
    stopHeartbeat();
    heartbeat = options.setTimer(() => {
      heartbeat = undefined;
      send(pointer);
    }, LASER_HEARTBEAT_MS);
  };

  return {
    point(pointer) {
      latest = pointer;
      if (framed) {
        return;
      }
      framed = true;
      options.frame(() => {
        framed = false;
        if (latest) {
          send(latest);
        }
      });
    },
    lift() {
      latest = undefined;
      stopHeartbeat();
      if (pointing) {
        pointing = false;
        options.send(null);
      }
    },
  };
}

export type LaserDot = {
  /** A point, or null for none, from this window's laser or another's. */
  receive(pointer: Pointer | null): void;
  /** The deck moved: a point made on another slide is no longer on screen. */
  sync(): void;
};

/**
 * The dot every window of the deck draws where a laser points: on the slide it was made on, and
 * only for as long as its laser keeps saying so.
 */
export function createLaserDot(
  options: Timers & {
    /** Put the dot at a point, or take it away for null. */
    draw: (pointer: Pointer | null) => void;
    /** The slide on screen. */
    current: () => number;
  },
): LaserDot {
  let shown: Pointer | null = null;
  let stale: number | undefined;

  const show = (pointer: Pointer | null): void => {
    shown = pointer && pointer.slideIndex === options.current() ? pointer : null;
    options.draw(shown);
  };

  return {
    receive(pointer) {
      if (stale !== undefined) {
        options.clearTimer(stale);
        stale = undefined;
      }
      show(pointer);
      if (pointer) {
        stale = options.setTimer(() => {
          stale = undefined;
          show(null);
        }, LASER_STALE_MS);
      }
    },
    sync() {
      if (shown && shown.slideIndex !== options.current()) {
        show(null);
      }
    },
  };
}
