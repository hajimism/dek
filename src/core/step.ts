export type BeatRef = {
  id?: string;
};

export type Position = {
  slideIndex: number;
  beatIndex: number;
};

/** The value `data-step` and `motion` use for a beat: its id, or its 1-based position. */
export function stepKey(beats: BeatRef[], index: number): string {
  return beats[index]?.id ?? String(index + 1);
}

export function stepValuesForBeat(beats: BeatRef[], beatIndex: number): Set<string> {
  const shown = new Set<string>();
  for (let i = 0; i <= beatIndex && i < beats.length; i++) {
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
