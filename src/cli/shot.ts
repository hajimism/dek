import { DekError } from "../core/error.ts";
import { parseMorphAt, type ShotFile, shotDeck, shotMorph } from "../core/shot.ts";
import { playerScript } from "../runtime/player.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type ShotCliResult = {
  shots: ShotFile[];
};

export async function shotCommand(options: {
  cwd: string;
  slug?: string;
  step?: string;
  to?: string;
  at?: string;
  deck?: string;
}): Promise<ShotCliResult> {
  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  if (options.to !== undefined) {
    if (!options.slug) {
      throw new DekError("usage: dek shot <slug> --to <slug> [--at 0..1]", {
        hint: "usage: dek shot <slug> --to <slug> [--at 0..1]",
      });
    }
    if (options.step !== undefined) {
      throw new DekError("--to cannot be combined with --step", {
        hint: "a morph frame always starts from the last beat; drop --step",
      });
    }
    const shots = await shotMorph(
      { project, deck },
      {
        from: options.slug,
        to: options.to,
        at: parseMorphAt(options.at),
        playerScript: await playerScript(),
      },
    );
    return { shots };
  }
  if (options.at !== undefined) {
    throw new DekError("--at needs --to", {
      hint: "usage: dek shot <slug> --to <slug> --at 0.5",
    });
  }
  const shots = await shotDeck(
    { project, deck },
    {
      slug: options.slug,
      step: options.step,
    },
  );
  return { shots };
}
