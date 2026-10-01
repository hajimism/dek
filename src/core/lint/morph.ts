import { type Diagnostic, diag } from "../diagnostic.ts";
import type { HtmlAttribute } from "../html-scan.ts";
import { suggest } from "../suggest.ts";
import type { LintContext } from "./context.ts";

/** Names the player takes for the page itself, and the CSS keywords of `view-transition-name`. */
export const RESERVED_MORPHS = new Set(["slide", "root", "none", "auto", "match-element"]);

/**
 * DEKC028: a data-morph that no slide beside it names. The browser morphs an element only into
 * the element of the same name on the slide it goes to, so a name with no partner on the slide
 * before or after is a plain fade, however it is spelled. A partner that is one typo away is the
 * likeliest fix; otherwise the hint names the files a partner could go in.
 */
export function unpairedMorphDiagnostics(ctx: LintContext): Diagnostic[] {
  const order = [...ctx.sectionsBySlug.keys()];
  const morphs = order.map((slug) => morphsOf(ctx, slug));
  return order.flatMap((slug, index) => {
    const own = morphs[index];
    const path = ctx.slidesBySlug.get(slug)?.path;
    if (!own || !path) {
      return [];
    }
    const neighbors = [index - 1, index + 1].flatMap((at) => {
      const names = morphs[at];
      const neighbor = order[at];
      return names && neighbor ? [{ slug: neighbor, names }] : [];
    });
    return [...own].flatMap(([morph, attribute]) => {
      if (neighbors.some((neighbor) => neighbor.names.has(morph))) {
        return [];
      }
      return [
        diag("DEKC028", {
          message: `data-morph "${morph}" is on neither slide beside it, so nothing morphs`,
          path,
          line: attribute.line,
          column: attribute.column,
          slug,
          hint: partnerHint(morph, neighbors, own),
          data: { morph, neighbors: neighbors.map((neighbor) => neighbor.slug) },
        }),
      ];
    });
  });
}

/** Each data-morph a slide names, at its first use; reserved names are DEKC005's. */
function morphsOf(ctx: LintContext, slug: string): Map<string, HtmlAttribute> | undefined {
  const scan = ctx.slideSource(slug)?.scan;
  if (!scan) {
    return undefined;
  }
  const morphs = new Map<string, HtmlAttribute>();
  for (const element of scan.elements) {
    for (const attribute of element.attributes) {
      const morph = attribute.value;
      if (
        element.inSlide &&
        attribute.name === "data-morph" &&
        !RESERVED_MORPHS.has(morph) &&
        !morphs.has(morph)
      ) {
        morphs.set(morph, attribute);
      }
    }
  }
  return morphs;
}

function partnerHint(
  morph: string,
  neighbors: { slug: string; names: Map<string, HtmlAttribute> }[],
  own: Map<string, HtmlAttribute>,
): string {
  for (const neighbor of neighbors) {
    // A name this slide already uses is some other element's partner, not this one's.
    const guess = suggest(
      morph,
      [...neighbor.names.keys()].filter((name) => !own.has(name)),
    );
    if (guess) {
      return `did you mean "${guess}", as in slides/${neighbor.slug}.html?`;
    }
  }
  if (neighbors.length === 0) {
    return "remove it; a morph carries an element into the slide before or after, and this deck has no other";
  }
  const files = neighbors.map((neighbor) => `slides/${neighbor.slug}.html`).join(" or ");
  return `give its partner data-morph="${morph}" in ${files}, or remove it`;
}
