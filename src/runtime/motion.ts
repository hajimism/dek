/**
 * Slide scripts draw as a function of time: `draw(slide, { index, step, t })`
 * where `t` is milliseconds since the beat began. The runtime owns the clock,
 * so live playback advances `t` per frame while video capture seeks it.
 */
import { drawFrame, stepMotionMs } from "../core/slide-draw.ts";
import { stepKey } from "../core/step.ts";

export { drawAtEnd, drawFrame, stepMotionMs } from "../core/slide-draw.ts";

// The shapes live in slide.d.ts, which `dek sync` also hands to deck authors.
export type MotionFrame = DekMotionFrame;
export type SlideModule = DekSlide;

/** animate: run t from 0 to the motion. final: jump to the end. hold: t=0, then `seek`. */
export type MotionMode = "animate" | "final" | "hold";

export function motionMs(
  module: SlideModule | undefined,
  beats: Array<{ id?: string }>,
  index: number,
): number {
  return stepMotionMs(module, stepKey(beats, index));
}

export function createMotion(clock: {
  now: () => number;
  requestFrame: (fn: () => void) => number;
  cancelFrame: (id: number) => void;
  /** Backstop for hidden or throttled pages, where animation frames stop arriving. */
  setTimer: (fn: () => void, ms: number) => number;
  clearTimer: (id: number) => void;
}) {
  let current:
    | { slide: HTMLElement; module: SlideModule; index: number; step: string; ms: number }
    | undefined;
  let frame: number | undefined;
  let timer: number | undefined;

  const stop = (): void => {
    if (frame !== undefined) {
      clock.cancelFrame(frame);
      frame = undefined;
    }
    if (timer !== undefined) {
      clock.clearTimer(timer);
      timer = undefined;
    }
  };

  const draw = (t: number): void => {
    if (!current) {
      return;
    }
    drawFrame(current.module, current.slide, {
      index: current.index,
      step: current.step,
      t: Math.min(Math.max(t, 0), current.ms),
    });
  };

  return {
    show(
      slide: HTMLElement,
      module: SlideModule | undefined,
      beats: Array<{ id?: string }>,
      index: number,
      mode: MotionMode,
    ): void {
      stop();
      current = module
        ? { slide, module, index, step: stepKey(beats, index), ms: motionMs(module, beats, index) }
        : undefined;
      if (!current) {
        return;
      }
      if (mode === "final" || current.ms === 0) {
        draw(current.ms);
        return;
      }
      draw(0);
      if (mode === "hold") {
        return;
      }
      const start = clock.now();
      const step = (): void => {
        const t = clock.now() - start;
        draw(t);
        if (current && t < current.ms) {
          frame = clock.requestFrame(step);
        } else {
          stop();
        }
      };
      frame = clock.requestFrame(step);
      timer = clock.setTimer(() => {
        timer = undefined;
        if (frame !== undefined) {
          stop();
          draw(current?.ms ?? 0);
        }
      }, current.ms + 50);
    },
    seek(t: number): void {
      stop();
      draw(t);
    },
    duration(): number {
      return current?.ms ?? 0;
    },
    stop,
  };
}

export type Motion = ReturnType<typeof createMotion>;
