import type { Position } from "../core/step.ts";
import type { ScheduledGo } from "../core/timeline.ts";

export type RehearseDriver = {
  play: () => void;
  pause: () => void;
  seek: (position: Position) => void;
  stop: () => void;
  playing: () => boolean;
  elapsed: () => number;
};

export function createRehearseDriver(options: {
  schedule: ScheduledGo[];
  go: (position: Position) => void | Promise<void>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (ms: number) => void;
}): RehearseDriver {
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const timers = new Set<unknown>();
  let playing = false;
  let origin = 0;
  let pausedElapsed = 0;

  const elapsed = (): number => (playing ? now() - origin : pausedElapsed);

  const clear = (): void => {
    for (const id of timers) {
      clearTimer(id);
    }
    timers.clear();
  };

  const arm = (): void => {
    clear();
    const t = elapsed();
    for (const event of options.schedule) {
      const wait = event.at - t;
      if (wait <= 0) {
        continue;
      }
      const id = setTimer(() => {
        timers.delete(id);
        void options.go(event.position);
      }, wait);
      timers.add(id);
    }
  };

  const lastDue = (at: number): ScheduledGo | undefined => {
    let found: ScheduledGo | undefined;
    for (const event of options.schedule) {
      if (event.at <= at) {
        found = event;
      }
    }
    return found;
  };

  return {
    play() {
      if (playing) {
        return;
      }
      playing = true;
      origin = now() - pausedElapsed;
      options.onPlay?.();
      const due = lastDue(pausedElapsed);
      if (due) {
        void options.go(due.position);
      }
      arm();
    },
    pause() {
      if (!playing) {
        return;
      }
      pausedElapsed = elapsed();
      playing = false;
      options.onPause?.();
      clear();
    },
    seek(position) {
      const event =
        options.schedule.find(
          (entry) =>
            entry.position.slideIndex === position.slideIndex &&
            entry.position.beatIndex === position.beatIndex,
        ) ?? options.schedule[0];
      if (!event) {
        return;
      }
      pausedElapsed = event.at;
      options.onSeek?.(event.at);
      if (playing) {
        origin = now() - pausedElapsed;
        arm();
      }
      void options.go(event.position);
    },
    stop() {
      playing = false;
      pausedElapsed = 0;
      clear();
    },
    playing: () => playing,
    elapsed,
  };
}
