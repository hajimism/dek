import { DekError } from "../core/error.ts";
import { bakeVideo } from "../video/bake.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type VideoCliResult = {
  out: string;
  vtt?: string;
  chapters?: string;
  credits?: string;
};

export async function videoCommand(options: {
  cwd: string;
  slug?: string;
  deck?: string;
  fps?: string;
}): Promise<VideoCliResult> {
  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  const fps = options.fps ? Number(options.fps) : undefined;
  if (fps !== undefined && (!Number.isFinite(fps) || fps <= 0)) {
    throw new DekError("invalid --fps", { hint: "use a positive number, e.g. --fps 30" });
  }
  return bakeVideo({ project, deck }, { slug: options.slug, fps });
}
