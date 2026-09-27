export type BeatRef = {
  id?: string;
};

/**
 * Where the talk stands. `beatIndex` counts the beats reached on the slide: 0 is the slide as it
 * arrives, with nothing bound to a beat shown yet, and k is its k-th `###`.
 */
export type Position = {
  slideIndex: number;
  beatIndex: number;
};

/** How many positions a slide has: its arrival, then one per beat. */
export function stopCount(beats: BeatRef[]): number {
  return beats.length + 1;
}

/** The stop with every beat reached. */
export function lastStop(beats: BeatRef[]): number {
  return beats.length;
}

/** The beat reached last at `beatIndex`; none as the slide arrives. */
export function beatAt<T extends BeatRef>(beats: T[], beatIndex: number): T | undefined {
  return beatIndex > 0 ? beats[beatIndex - 1] : undefined;
}

const STOP_NUMBER_RE = /^(0|[1-9]\d*)$/;

/** The beatIndex a stop token names: `0` to the beat count by position, or a beat id. */
export function resolveStop(beats: BeatRef[], token: string): number | undefined {
  if (STOP_NUMBER_RE.test(token)) {
    const index = Number(token);
    return index <= lastStop(beats) ? index : undefined;
  }
  const found = beats.findIndex((beat) => beat.id === token);
  return found < 0 ? undefined : found + 1;
}

/** The beat a `data-step` value names (1-based), by id or position. The arrival is no beat. */
export function resolveStep(beats: BeatRef[], value: string): number | undefined {
  const index = resolveStop(beats, value);
  return index === 0 ? undefined : index;
}

/** The value `data-step` takes for the beat at `index` (0-based): its id, or its 1-based position. */
export function beatStep(beats: BeatRef[], index: number): string {
  return beats[index]?.id ?? String(index + 1);
}

/** The key `motion` and `draw` use for a position: `"0"` for the arrival, else the beat's step. */
export function stepKey(beats: BeatRef[], beatIndex: number): string {
  return beatIndex <= 0 ? "0" : beatStep(beats, beatIndex - 1);
}

/** Every `stepKey` of a slide, arrival first. */
export function stepKeys(beats: BeatRef[]): string[] {
  return Array.from({ length: stopCount(beats) }, (_, index) => stepKey(beats, index));
}

/** The `data-step` values shown once `beatIndex` beats have been reached. */
export function stepValuesForBeat(beats: BeatRef[], beatIndex: number): Set<string> {
  const shown = new Set<string>();
  for (let i = 0; i < beatIndex && i < beats.length; i++) {
    shown.add(String(i + 1));
    const id = beats[i]?.id;
    if (id) {
      shown.add(id);
    }
  }
  return shown;
}

/** The values a step may take on a slide: beat ids, then the position range. Empty without beats. */
export function stepChoices(beats: BeatRef[]): string[] {
  if (beats.length === 0) {
    return [];
  }
  return [
    ...beats.flatMap((beat) => (beat.id ? [beat.id] : [])),
    beats.length === 1 ? "1" : `1-${beats.length}`,
  ];
}

/** "use hook, turn, or 1-2" for a slide with beats. */
export function formatStepChoices(choices: string[]): string {
  const head = choices.slice(0, -1);
  const last = choices[choices.length - 1] ?? "1";
  if (head.length === 0) {
    return `use ${last}`;
  }
  return head.length === 1 ? `use ${head[0]} or ${last}` : `use ${head.join(", ")}, or ${last}`;
}
