import type { Position } from "../core/step.ts";

/** How capture tools seek the current slide's script, the way they seek Web Animations. */
export type DekcMotionHandle = {
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
    dekcGo?: (next: Position | null | undefined) => Promise<void>;
    dekcMotion?: DekcMotionHandle;
    dekcLive?: (raw: unknown) => Promise<void>;
    /** The go the video recorder started and has not awaited yet. */
    __dekcPendingGo?: Promise<void>;
    /** The animations that go started, so capture tools seek those and nothing older. */
    __dekcStarted?: Animation[];
    /** The animations the last finished beat ended; the next go did not start them. */
    __dekcSettled?: Set<Animation>;
    __dekcSlides?: Record<string, DekcSlide>;
    /** What each slide's draw threw on a still page, for the worker that measures it. */
    __dekcDrawErrors?: Array<{
      slug: string;
      step: string;
      t: number;
      kind: "throw" | "reach" | "seek";
      message: string;
    }>;
    /** Takes back what the draws on a still page changed in attributes; absent when nothing. */
    __dekcUndoDraw?: () => void;
  }
}
