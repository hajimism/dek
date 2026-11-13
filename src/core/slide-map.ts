// The slide map: what each slide of a build holds, in the shape dek.pub reads to lay out a talk's
// script article and to place comments on it. It follows the build's reader, so a map made for an
// audience carries the script without its stage directions, as that build's page does, and one
// made for nobody carries no script at all.

import type { SlideMap } from "../pub/protocol.ts";
import { spokenParagraphs } from "./cue.ts";
import { type ScriptReader, scriptFor } from "./presenter.ts";
import type { Deck } from "./schema.ts";
import { stepKey } from "./step.ts";
import { formatSectionScript } from "./timing.ts";

export function slideMap(
  deck: { name: string; deck: Pick<Deck, "sections"> },
  out: string,
  reader: ScriptReader,
): SlideMap {
  return {
    deck: deck.name,
    out,
    slides: deck.deck.sections.map((section) => {
      const script = scriptFor(formatSectionScript(section), reader);
      return {
        slug: section.slug,
        title: section.title,
        line: section.line,
        steps: [
          { step: "0", title: section.title },
          ...section.beats.map((beat, index) => ({
            step: stepKey(section.beats, index + 1),
            ...(beat.id ? { id: beat.id } : {}),
            title: reader === "nobody" ? "" : beat.title,
          })),
        ],
        script,
        paragraphs: spokenParagraphs(script),
      };
    }),
  };
}
