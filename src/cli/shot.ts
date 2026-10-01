import { DekcError } from "../core/error.ts";
import { parseMorphAt, shotMorph } from "../core/shot/morph.ts";
import { type ShotMotion, shotMotion } from "../core/shot/motion.ts";
import { type ShotFile, shotDeck, shotSheet } from "../core/shot/still.ts";
import { playerScript } from "../runtime/player.ts";
import type { ReadableDeck } from "./scope.ts";
import { usageError } from "./usage.ts";

export type ShotCliResult = {
  shots: ShotFile[];
  /** Contact sheets, from --sheet or --motion; what text output prints when present. */
  sheets?: string[];
  /** With --motion, each beat's frames and the ms into its go each shows. */
  motion?: ShotMotion["beats"];
};

type ShotCommandOptions = {
  slug?: string;
  step?: string;
  to?: string;
  at?: string;
  sheet?: boolean;
  motion?: boolean;
};

/** What `dekc shot` was asked to take, once its flags are known to fit together. */
export type ShotMode =
  | { kind: "still"; slug?: string; step?: string }
  | { kind: "sheet" }
  | { kind: "motion"; slug: string; step?: string }
  | { kind: "morph"; from: string; to: string; at: number };

export async function shotCommand(
  { project, deck }: ReadableDeck,
  options: ShotCommandOptions,
): Promise<ShotCliResult> {
  const mode = parseShotMode(options);
  switch (mode.kind) {
    case "sheet": {
      const { sheets, shots } = await shotSheet({ project, deck });
      return { shots, sheets };
    }
    case "motion": {
      const { sheets, beats } = await shotMotion(
        { project, deck },
        {
          slug: mode.slug,
          ...(mode.step === undefined ? {} : { step: mode.step }),
          playerScript: await playerScript(),
        },
      );
      return { shots: [], sheets, motion: beats };
    }
    case "morph": {
      const shots = await shotMorph(
        { project, deck },
        { from: mode.from, to: mode.to, at: mode.at, playerScript: await playerScript() },
      );
      return { shots };
    }
    case "still": {
      const shots = await shotDeck({ project, deck }, { slug: mode.slug, step: mode.step });
      return { shots };
    }
  }
}

function refuse(message: string, hint: string): never {
  throw new DekcError(message, { hint });
}

/**
 * The one mode the flags name: --sheet is the whole deck at its last beats, --motion one slide's
 * beats, --to a frame of the move to another slide, and none of them a still.
 */
export function parseShotMode(options: ShotCommandOptions): ShotMode {
  const { slug, step, to, at } = options;
  if (options.sheet && options.motion) {
    refuse(
      "--sheet and --motion together",
      "use one of --sheet and --motion: --sheet tiles every slide, --motion one slide's beats",
    );
  }
  if (options.sheet) {
    if (to !== undefined || at !== undefined) {
      refuse("--sheet with --to or --at", "--sheet takes no --to or --at; drop them");
    }
    if (step !== undefined) {
      refuse("--sheet with --step", "--sheet shows every slide at its last beat; drop --step");
    }
    if (slug) {
      refuse(
        "--sheet with a slug",
        `--sheet tiles every slide; for one slide's beats, run \`dekc shot ${slug} --motion\``,
      );
    }
    return { kind: "sheet" };
  }
  if (options.motion) {
    if (to !== undefined) {
      refuse(
        "--motion with --to",
        "the move from the slide before is row 1 of --motion; for a jump to any slide, use `dekc shot <a> --to <b>`",
      );
    }
    if (at !== undefined) {
      refuse("--motion with --at", "--motion holds each beat at several moments; drop --at");
    }
    if (!slug) {
      throw usageError("shot", "--motion needs a slide", { match: "--motion" });
    }
    return { kind: "motion", slug, ...(step === undefined ? {} : { step }) };
  }
  if (to !== undefined) {
    if (!slug) {
      throw usageError("shot", "--to needs the slide it starts from", { match: "--to" });
    }
    if (step !== undefined) {
      refuse(
        "--to cannot be combined with --step",
        "a morph frame always starts from the last beat; drop --step",
      );
    }
    return { kind: "morph", from: slug, to, at: parseMorphAt(at) };
  }
  if (at !== undefined) {
    throw usageError("shot", "--at needs --to", { match: "--to" });
  }
  return {
    kind: "still",
    ...(slug ? { slug } : {}),
    ...(step === undefined ? {} : { step }),
  };
}
