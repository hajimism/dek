/**
 * Where Japanese text breaks into phrases, as BudouX finds it.
 *
 * Adapted from BudouX 0.10.2, javascript/src/parser.ts, Copyright 2021 Google LLC, under the
 * Apache License, Version 2.0, in ./LICENSE. Changed from the original: it reads the model in the
 * packed form ./model.ts holds, and returns only the offsets a phrase starts at.
 */
import { JA_MODEL } from "./model.ts";

/** The features BudouX scores a place by, each keyed by the characters it looks at. */
const FEATURES = [
  "UW1",
  "UW2",
  "UW3",
  "UW4",
  "UW5",
  "UW6",
  "BW1",
  "BW2",
  "BW3",
  "TW1",
  "TW2",
  "TW3",
  "TW4",
] as const;

type Feature = (typeof FEATURES)[number];

let loaded: { scores: Map<Feature, Map<string, number>>; base: number } | undefined;

/** The model, unpacked once: each feature's scores, and the score a place starts from. */
function model(): { scores: Map<Feature, Map<string, number>>; base: number } {
  if (loaded) {
    return loaded;
  }
  const scores = new Map<Feature, Map<string, number>>();
  let sum = 0;
  for (const feature of FEATURES) {
    const entries = new Map<string, number>();
    for (const entry of (JA_MODEL[feature] ?? "").split(" ")) {
      const colon = entry.lastIndexOf(":");
      const score = Number(entry.slice(colon + 1));
      entries.set(entry.slice(0, colon), score);
      sum += score;
    }
    scores.set(feature, entries);
  }
  loaded = { scores, base: -0.5 * sum };
  return loaded;
}

/**
 * The offsets in `sentence` where a phrase starts, after its first: where BudouX would break it.
 * An offset is never inside a surrogate pair.
 */
export function phraseBoundaries(sentence: string): number[] {
  const { scores, base } = model();
  const score = (feature: Feature, start: number, end: number): number =>
    // substring, as BudouX has it: an offset before the start reads as the start.
    scores.get(feature)?.get(sentence.substring(start, end)) ?? 0;
  const boundaries: number[] = [];
  for (let i = 1; i < sentence.length; i++) {
    if ((sentence.codePointAt(i - 1) ?? 0) > 0xffff) {
      continue;
    }
    const sum =
      base +
      score("UW1", i - 3, i - 2) +
      score("UW2", i - 2, i - 1) +
      score("UW3", i - 1, i) +
      score("UW4", i, i + 1) +
      score("UW5", i + 1, i + 2) +
      score("UW6", i + 2, i + 3) +
      score("BW1", i - 2, i) +
      score("BW2", i - 1, i + 1) +
      score("BW3", i, i + 2) +
      score("TW1", i - 3, i) +
      score("TW2", i - 2, i + 1) +
      score("TW3", i - 1, i + 2) +
      score("TW4", i, i + 3);
    if (sum > 0) {
      boundaries.push(i);
    }
  }
  return boundaries;
}
