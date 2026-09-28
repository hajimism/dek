/// <reference lib="dom" />
import type { Pointer } from "../core/live-protocol.ts";
import { PAGE_ID } from "../core/page.ts";
import { createLaserDot, createLaserFeed, pointOnSlide } from "./laser.ts";

export type LaserView = {
  /** Turn this window's laser on or off; true, since the key is always the laser's. */
  toggle(): boolean;
  /** Whether this window's laser is on, so the slide is for pointing rather than for tapping. */
  isOn(): boolean;
  /** Where another window's laser points, or null once it went away. */
  receive(pointer: Pointer | null): void;
  /** The deck moved. */
  sync(): void;
};

/**
 * The laser: while it is on, where the pointer or a finger rests on the slide is shown here and
 * sent to the deck's other windows, which show it at the same place on the slide. A window with
 * its laser off still shows another's. The dot is the deck's first child, so it scales with the
 * slide and stays out of what counts slides, such as the print CSS's last page.
 */
export function createLaserView(options: {
  /** The slide on screen. */
  current: () => number;
  /** Send a point to the deck's other windows. */
  send: (pointer: Pointer | null) => void;
}): LaserView {
  const deckEl = document.getElementById(PAGE_ID.deck);
  const stageEl = document.getElementById(PAGE_ID.currentStage);
  const toggleEl = document.getElementById(PAGE_ID.laserToggle);
  const dotEl = document.createElement("div");
  dotEl.id = PAGE_ID.laser;
  dotEl.hidden = true;
  dotEl.setAttribute("aria-hidden", "true");
  deckEl?.prepend(dotEl);

  const timers = {
    setTimer: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
    clearTimer: (id: number) => window.clearTimeout(id),
  };
  const dot = createLaserDot({
    ...timers,
    current: options.current,
    draw(pointer) {
      dotEl.hidden = pointer === null;
      if (pointer) {
        dotEl.style.left = `${pointer.x * 100}%`;
        dotEl.style.top = `${pointer.y * 100}%`;
      }
    },
  });
  // This window's own dot is one more reader of what it sends.
  const feed = createLaserFeed({
    ...timers,
    frame: (fn) => window.requestAnimationFrame(fn),
    send(pointer) {
      options.send(pointer);
      dot.receive(pointer);
    },
  });
  let on = false;

  function setOn(next: boolean): void {
    on = next;
    document.body.classList.toggle("is-laser", on);
    toggleEl?.setAttribute("aria-pressed", String(on));
    if (!on) {
      feed.lift();
    }
  }

  function track(event: PointerEvent): void {
    if (!on || !deckEl) {
      return;
    }
    const at = pointOnSlide({ x: event.clientX, y: event.clientY }, deckEl.getBoundingClientRect());
    if (at) {
      feed.point({ slideIndex: options.current(), ...at });
    } else {
      feed.lift();
    }
  }

  stageEl?.addEventListener("pointermove", track);
  stageEl?.addEventListener("pointerdown", track);
  stageEl?.addEventListener("pointerleave", () => feed.lift());
  stageEl?.addEventListener("pointercancel", () => feed.lift());
  // A finger that lifts takes the laser with it; a mouse stays where it is.
  stageEl?.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") {
      feed.lift();
    }
  });
  toggleEl?.addEventListener("click", () => setOn(!on));

  return {
    toggle() {
      setOn(!on);
      return true;
    },
    isOn: () => on,
    receive: (pointer) => dot.receive(pointer),
    sync() {
      // A point made on the slide the deck left is no longer where the laser is.
      feed.lift();
      dot.sync();
    },
  };
}
