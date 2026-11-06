import { normalize } from "./place.ts";

/** Elements whose content no reader sees as words on the slide. */
const UNSEEN = "script, style, template, noscript";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * A slide's words as a reader sees them, in document order, with each run of whitespace as one
 * space: the text dek-study matches a sticker's words against.
 */
export async function slideText(html: string): Promise<string> {
  const parts: string[] = [];
  // How many unseen elements the parser is inside; text there is not the slide's words.
  let unseen = 0;
  await new HTMLRewriter()
    .on(UNSEEN, {
      element(element) {
        unseen += 1;
        element.onEndTag(() => {
          unseen -= 1;
        });
      },
    })
    .onDocument({
      text(chunk) {
        if (unseen === 0) {
          parts.push(chunk.text);
        }
      },
    })
    .transform(new Response(html))
    .text();
  return normalize(decode(parts.join("")));
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code =
        name[1] === "x" || name[1] === "X"
          ? Number.parseInt(name.slice(2), 16)
          : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}
