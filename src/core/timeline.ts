import { type Cue, splitSentences } from "./cue.ts";
import { DekError } from "./error.ts";
import type { Position } from "./step.ts";

export type PauseConfig = {
  sentence: number;
  beat: number;
};

export const DEFAULT_PAUSE: PauseConfig = {
  sentence: 350,
  beat: 700,
};

export type Utterance = {
  text: string;
  kana: string;
  durationMs: number;
};

export type TimelineSentence = {
  text: string;
  kana: string;
  start: number;
  end: number;
};

export type TimelineBeat = {
  position: Position;
  start: number;
  end: number;
  sentences: TimelineSentence[];
  /** How far the screen change leads the voice. Absent in hand-written timelines. */
  lead?: number;
};

/** Per-beat overrides from voice.toml. `pause` replaces `pause.beat` after the beat. */
export type BeatTiming = {
  lead?: number;
  pause?: number;
};

export type Timeline = {
  audio: string;
  durationMs: number;
  beats: TimelineBeat[];
};

/** Screen changes lead the voice so a transition settles as the first word lands. */
export const DEFAULT_LEAD_MS = 300;

export type ScheduledGo = {
  at: number;
  position: Position;
};

export type VoiceSchedule = {
  timeline: Timeline;
  pauseAfterMs: number[];
  leadingMs: number;
};

export function buildTimeline(
  cues: Cue[],
  utterances: Iterable<Utterance>,
  pause: PauseConfig = DEFAULT_PAUSE,
  audio = "",
): Timeline {
  return scheduleVoice(cues, utterances, pause, audio).timeline;
}

export function scheduleVoice(
  cues: Cue[],
  utterances: Iterable<Utterance>,
  pause: PauseConfig = DEFAULT_PAUSE,
  audio = "",
  timing: (position: Position) => BeatTiming = () => ({}),
): VoiceSchedule {
  const queue = [...utterances];
  let next = 0;
  const take = (text: string): Utterance => {
    const utterance = queue[next];
    if (!utterance || utterance.text !== text) {
      throw new DekError(`missing utterance for ${JSON.stringify(text)}`, {
        hint: "run `dek voice`",
      });
    }
    next += 1;
    return utterance;
  };

  const beats: TimelineBeat[] = [];
  const pauseAfterMs: number[] = [];
  let leadingMs = 0;
  let t = 0;
  let previousEnd = 0;
  let lastClipIndex = -1;

  for (const cue of cues) {
    const texts = cue.paragraphs.flatMap(splitSentences);
    const override = timing(cue.position);
    const lead = override.lead ?? DEFAULT_LEAD_MS;
    const beatPause = override.pause ?? pause.beat;
    if (texts.length === 0) {
      const start = previousEnd;
      const end = start + beatPause;
      if (end > t) {
        const extra = end - t;
        if (lastClipIndex >= 0) {
          pauseAfterMs[lastClipIndex] = (pauseAfterMs[lastClipIndex] ?? 0) + extra;
        } else {
          leadingMs += extra;
        }
        t = end;
      }
      beats.push({ position: cue.position, start, end, sentences: [], lead });
      previousEnd = end;
      continue;
    }

    const sentences: TimelineSentence[] = [];
    const start = t;
    for (const [index, text] of texts.entries()) {
      const utterance = take(text);
      sentences.push({
        text,
        kana: utterance.kana,
        start: t,
        end: t + utterance.durationMs,
      });
      t += utterance.durationMs;
      if (index < texts.length - 1) {
        pauseAfterMs.push(pause.sentence);
        t += pause.sentence;
      } else {
        pauseAfterMs.push(beatPause);
        t += beatPause;
      }
      lastClipIndex = pauseAfterMs.length - 1;
    }
    const end = sentences[sentences.length - 1]?.end ?? start;
    beats.push({ position: cue.position, start, end, sentences, lead });
    previousEnd = end;
  }

  return {
    timeline: {
      audio,
      durationMs: t,
      beats,
    },
    pauseAfterMs,
    leadingMs,
  };
}

/**
 * When each beat's screen change fires: its lead ahead of the voice, but never
 * before the previous change, so a long lead cannot send the screen back.
 */
export function playbackSchedule(timeline: Timeline): ScheduledGo[] {
  let previousAt = 0;
  return timeline.beats.map((beat) => {
    const lead = Math.max(0, beat.lead ?? DEFAULT_LEAD_MS);
    const at = Math.max(previousAt, beat.start - lead);
    previousAt = at;
    return { at, position: beat.position };
  });
}

export function timelineSeconds(timeline: Timeline): number {
  return Math.round(timeline.durationMs / 1000);
}

export function slideTimeRange(
  timeline: Timeline,
  slideIndex: number,
): { start: number; end: number } | undefined {
  const beats = timeline.beats.filter((beat) => beat.position.slideIndex === slideIndex);
  if (beats.length === 0) {
    return undefined;
  }
  const start = beats[0]?.start ?? 0;
  const next = timeline.beats.find((beat) => beat.position.slideIndex > slideIndex);
  const end = next?.start ?? timeline.durationMs;
  return { start, end };
}

export function slideVideoSeconds(timeline: Timeline, slideIndex: number): number | undefined {
  const range = slideTimeRange(timeline, slideIndex);
  if (!range) {
    return undefined;
  }
  return Math.round((range.end - range.start) / 1000);
}

export function sliceTimeline(timeline: Timeline, slideIndex: number): Timeline {
  const range = slideTimeRange(timeline, slideIndex);
  if (!range) {
    throw new DekError(`no timeline beats for slide ${slideIndex}`, {
      hint: "run `dek voice`",
    });
  }
  const offset = range.start;
  return {
    audio: timeline.audio,
    durationMs: Math.max(0, range.end - offset),
    beats: timeline.beats
      .filter((beat) => beat.position.slideIndex === slideIndex)
      .map((beat) => ({
        ...beat,
        start: beat.start - offset,
        end: beat.end - offset,
        sentences: beat.sentences.map((sentence) => ({
          ...sentence,
          start: sentence.start - offset,
          end: sentence.end - offset,
        })),
      })),
  };
}
