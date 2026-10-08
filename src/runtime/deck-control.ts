import type { Position } from "../core/step.ts";
import type { GoOrigin } from "./navigator.ts";
import type { RehearseController } from "./rehearse.ts";

/** Where a move someone asked for came from: a key or a click on this page, or a peer. */
export type RequestOrigin = Extract<GoOrigin, "local" | "remote">;

export type DeckControl = {
  /** Move the deck to `next`; nothing at either end of the talk. */
  request(next: Position | null, origin: RequestOrigin): void;
  /** Play or pause the rehearsal; false when none is loaded, so the key is left alone. */
  togglePlay(): boolean;
};

/**
 * Who a move goes through. While a rehearsal is loaded its clock owns the deck, so a move goes
 * through the clock and the clock moves with it; otherwise the navigator takes it directly.
 */
export function createDeckControl(options: {
  go: (next: Position, origin: RequestOrigin) => Promise<void>;
  /** The rehearsal the dev server can load; a file that stands alone has none. */
  rehearse?: Pick<RehearseController, "ready" | "move" | "toggle">;
}): DeckControl {
  const { go, rehearse } = options;
  return {
    request(next, origin) {
      if (!next) {
        return;
      }
      if (rehearse?.ready()) {
        rehearse.move(next, origin);
      } else {
        void go(next, origin);
      }
    },
    togglePlay() {
      if (!rehearse?.ready()) {
        return false;
      }
      rehearse.toggle();
      return true;
    },
  };
}
