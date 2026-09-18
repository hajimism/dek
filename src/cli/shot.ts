import { type ShotFile, shotDeck } from "../core/shot.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type ShotCliResult = {
  shots: ShotFile[];
};

export async function shotCommand(options: {
  cwd: string;
  slug?: string;
  step?: string;
  deck?: string;
}): Promise<ShotCliResult> {
  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  const shots = await shotDeck(
    { project, deck },
    {
      slug: options.slug,
      step: options.step,
    },
  );
  return { shots };
}
