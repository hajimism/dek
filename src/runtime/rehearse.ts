import { comparePositions, positionsEqual } from "../core/position.ts";
import type { Position } from "../core/step.ts";
import { playbackSchedule, type ScheduledGo, type Timeline } from "../core/timeline.ts";
import type { RequestOrigin } from "./deck-control.ts";
import type { GoOrigin } from "./navigator.ts";
import { deckUrl } from "./routes.ts";

export type RehearseDriver = {
  play: () => void;
  pause: () => void;
  /** Move the clock to `position`; the caller moves the deck. */
  seek: (position: Position) => void;
  stop: () => void;
  playing: () => boolean;
  elapsed: () => number;
};

/** The latest entry whose time has come by `at` ms. */
export function lastDue(schedule: ScheduledGo[], at: number): ScheduledGo | undefined {
  return schedule.findLast((entry) => entry.at <= at);
}

/** The entry for `position`, or the last one before it when the timeline skips that stop. */
export function entryFor(schedule: ScheduledGo[], position: Position): ScheduledGo | undefined {
  return (
    schedule.find((entry) => positionsEqual(entry.position, position)) ??
    schedule.findLast((entry) => comparePositions(entry.position, position) < 0)
  );
}

/**
 * The rehearsal clock: it walks the deck through `schedule` as time passes. Only the clock's own
 * moves go through `go`; a seek answers a move someone else already made.
 */
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
  /** The entry the deck stands on as far as the clock knows. */
  let shown: ScheduledGo | undefined;

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
        shown = event;
        void options.go(event.position);
      }, wait);
      timers.add(id);
    }
  };

  return {
    play() {
      if (playing) {
        return;
      }
      playing = true;
      origin = now() - pausedElapsed;
      options.onPlay?.();
      const due = lastDue(options.schedule, pausedElapsed);
      if (due && due !== shown) {
        shown = due;
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
      pausedElapsed = entryFor(options.schedule, position)?.at ?? 0;
      shown = lastDue(options.schedule, pausedElapsed);
      options.onSeek?.(pausedElapsed);
      if (playing) {
        origin = now() - pausedElapsed;
        arm();
      }
    },
    stop() {
      playing = false;
      pausedElapsed = 0;
      shown = undefined;
      clear();
    },
    playing: () => playing,
    elapsed,
  };
}

/** The slice of an audio element the rehearsal uses. */
export type RehearseAudio = {
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
};

/** A loaded rehearsal: when each stop comes, and the voice track if there is one. */
export type Rehearsal = { schedule: ScheduledGo[]; audio?: RehearseAudio };

export type RehearseController = {
  /** Whether a rehearsal is loaded and owns the keys. */
  ready(): boolean;
  /** Load the timeline, or load it again after it changed, and play from where the deck is. */
  load(): Promise<void>;
  toggle(): void;
  /** Move the deck and the clock to `position`, asked for on this page or by a peer. */
  move(position: Position, origin: RequestOrigin): void;
};

type RehearseState =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "ready"; driver: RehearseDriver; audio?: RehearseAudio };

/** A clock for `rehearsal`; with a voice track, the track keeps the time and follows the clock. */
function rehearsalDriver(
  { schedule, audio }: Rehearsal,
  go: (position: Position) => void | Promise<void>,
): RehearseDriver {
  return createRehearseDriver({
    schedule,
    go,
    ...(audio ? { now: () => audio.currentTime * 1000 } : {}),
    onPlay: () => {
      void audio?.play();
    },
    onPause: () => {
      audio?.pause();
    },
    onSeek: (ms) => {
      if (audio) {
        audio.currentTime = ms / 1000;
      }
    },
  });
}

/**
 * Owns the rehearsal: one state at a time, and the voice track with it. A reload stops the old
 * clock and silences its track before anything new plays.
 */
export function createRehearseController(options: {
  load: () => Promise<Rehearsal | undefined>;
  /** Move the deck; the clock's own moves come as "rehearse". */
  go: (position: Position, origin: GoOrigin) => void | Promise<void>;
  /** Where the deck is headed, so a reload plays on from there. */
  current: () => Position;
}): RehearseController {
  let state: RehearseState = { kind: "off" };
  let generation = 0;

  const stopCurrent = (): void => {
    if (state.kind === "ready") {
      state.driver.stop();
      state.audio?.pause();
    }
  };

  return {
    ready: () => state.kind === "ready",
    async load() {
      generation += 1;
      const mine = generation;
      stopCurrent();
      state = { kind: "loading" };
      let loaded: Rehearsal | undefined;
      try {
        loaded = await options.load();
      } catch (error) {
        if (mine === generation) {
          state = { kind: "off" };
        }
        throw error;
      }
      // A newer load started while this one waited; it owns the state now.
      if (mine !== generation) {
        return;
      }
      if (!loaded) {
        state = { kind: "off" };
        return;
      }
      const { audio } = loaded;
      const driver = rehearsalDriver(loaded, (position) => options.go(position, "rehearse"));
      state = audio ? { kind: "ready", driver, audio } : { kind: "ready", driver };
      // Set the clock first: playing from zero would send the deck to the first slide.
      driver.seek(options.current());
      driver.play();
    },
    toggle() {
      if (state.kind !== "ready") {
        return;
      }
      if (state.driver.playing()) {
        state.driver.pause();
      } else {
        state.driver.play();
      }
    },
    move(position, origin) {
      if (state.kind !== "ready") {
        return;
      }
      state.driver.seek(position);
      void options.go(position, origin);
    },
  };
}

/** Fetch the deck's timeline and, when the server has one, its voice track. */
export async function fetchRehearsal(
  pathname: string,
  deps: {
    fetch: (input: string, init?: { method: string }) => Promise<Response>;
    audio: (src: string) => RehearseAudio;
  },
): Promise<Rehearsal | undefined> {
  const timelinePath = deckUrl(pathname, { kind: "voice", file: "timeline.json" });
  const audioPath = deckUrl(pathname, { kind: "voice", file: "audio.wav" });
  const response = await deps.fetch(timelinePath);
  if (!response.ok) {
    return undefined;
  }
  const timeline = (await response.json()) as Timeline;
  const audioHead = await deps.fetch(audioPath, { method: "HEAD" });
  const schedule = playbackSchedule(timeline);
  return audioHead.ok ? { schedule, audio: deps.audio(audioPath) } : { schedule };
}
