import type { Position } from "../core/step.ts";

/** How capture tools seek the current slide's script, the way they seek Web Animations. */
export type DekMotionHandle = {
  /** The current beat's motion in ms; 0 when the slide has none. */
  duration(): number;
  seek(t: number): void;
};

/**
 * What the player shares through `window` with code outside its bundle: the
 * video recorder and morph shots (run by Playwright), live reload, and the
 * slide scripts that register themselves before the player starts.
 */
declare global {
  interface Window {
    dekGo?: (next: Position | null | undefined) => Promise<void>;
    dekMotion?: DekMotionHandle;
    dekLive?: (raw: unknown) => Promise<void>;
    /** The go the video recorder started and has not awaited yet. */
    __dekPendingGo?: Promise<void>;
    __dekSlides?: Record<string, DekSlide>;
  }
}
