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
    /** The animations that go started, so capture tools seek those and nothing older. */
    __dekStarted?: Animation[];
    /** The animations the last finished beat ended; the next go did not start them. */
    __dekSettled?: Set<Animation>;
    __dekSlides?: Record<string, DekSlide>;
    /** What each slide's draw threw on a still page, for the worker that measures it. */
    __dekDrawErrors?: Array<{
      slug: string;
      step: string;
      t: number;
      kind: "throw" | "reach" | "seek";
      message: string;
    }>;
    /** Takes back what the draws on a still page changed in attributes; absent when nothing. */
    __dekUndoDraw?: () => void;
  }
}
