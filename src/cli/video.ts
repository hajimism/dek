import { trackDrawing, type Unsandboxed } from "../core/sandbox.ts";
import { bakeVideo } from "../video/bake.ts";
import type { DeckTarget } from "./scope.ts";

export type VideoCliResult = {
  out: string;
  vtt?: string;
  chapters?: string;
  credits?: string;
  unsandboxed?: Unsandboxed;
};

/** `fps` is checked on the command line: a positive number, 30 when left out. */
export async function videoCommand(
  target: DeckTarget,
  options: { slug?: string; fps?: number; rootDist?: boolean } = {},
): Promise<VideoCliResult> {
  const { value, unsandboxed } = await trackDrawing(() => bakeVideo(target, options));
  return { ...value, ...(unsandboxed ? { unsandboxed } : {}) };
}
