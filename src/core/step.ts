export type BeatRef = {
  id?: string;
};

export type Position = {
  slideIndex: number;
  beatIndex: number;
};

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
