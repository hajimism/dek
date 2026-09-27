import { bakeVideo } from "../video/bake.ts";
import type { DeckTarget } from "./scope.ts";

export type VideoCliResult = {
  out: string;
  vtt?: string;
  chapters?: string;
  credits?: string;
};

/** `fps` is checked on the command line: a positive number, 30 when left out. */
export async function videoCommand(
  target: DeckTarget,
  options: { slug?: string; fps?: number; rootDist?: boolean } = {},
): Promise<VideoCliResult> {
  return bakeVideo(target, options);
}
