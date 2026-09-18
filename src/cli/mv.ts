import { DekError } from "../core/error.ts";
import { renameSection, reorderSection } from "../core/mv.ts";
import { requireDeckFromCwd } from "./scope.ts";

export type MvResult = {
  from: string;
  to?: string;
  before?: string;
  after?: string;
};

export function mvCommand(options: {
  cwd: string;
  slug?: string;
  to?: string;
  before?: string;
  after?: string;
  deck?: string;
}): MvResult {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek mv <old> <new> | dek mv <slug> --before|--after <slug>", {
      hint: "usage: dek mv <old> <new> | dek mv <slug> --before|--after <slug>",
    });
  }

  const { deck } = requireDeckFromCwd(options.cwd, options.deck);

  if (options.before || options.after) {
    if (options.before && options.after) {
      throw new DekError("use only one of --before or --after", {
        hint: "usage: dek mv <slug> --before|--after <slug>",
      });
    }
    reorderSection(deck.dir, slug, { before: options.before, after: options.after });
    return {
      from: slug,
      ...(options.before ? { before: options.before } : {}),
      ...(options.after ? { after: options.after } : {}),
    };
  }

  const to = options.to?.trim();
  if (!to) {
    throw new DekError("usage: dek mv <old> <new>", { hint: "usage: dek mv <old> <new>" });
  }
  renameSection(deck.dir, slug, to);
  return { from: slug, to };
}
