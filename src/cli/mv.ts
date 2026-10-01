import { renameSection, reorderSection } from "../core/mv.ts";
import type { DeckTarget } from "./scope.ts";
import { usageError } from "./usage.ts";

export type MvResult = {
  from: string;
  to?: string;
  before?: string;
  after?: string;
};

/** A rename to `to`, or a move before or after another section: exactly one of them. */
export function mvCommand(
  { project, deck }: DeckTarget,
  options: { slug: string; to?: string; before?: string; after?: string },
): MvResult {
  const { slug, to, before, after } = options;
  if (before && after) {
    throw usageError("mv", "use only one of --before or --after", { match: "--before" });
  }
  const place = before ? { before } : after ? { after } : undefined;
  if (place) {
    if (to !== undefined) {
      throw usageError("mv", `unexpected argument "${to}" for dekc mv --before|--after`, {
        match: "--before",
      });
    }
    reorderSection({ project, deck }, slug, place);
    return { from: slug, ...place };
  }

  if (to === undefined) {
    throw usageError("mv", "missing <new> for dekc mv", { match: "<new>" });
  }
  renameSection({ project, deck }, slug, to);
  return { from: slug, to };
}
