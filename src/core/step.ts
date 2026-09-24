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
