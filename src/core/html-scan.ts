import { hasSlideClass, uniqueMark } from "./html.ts";
import { lineLocator } from "./lines.ts";
import { attributeUrls, type UrlUse } from "./url-attributes.ts";

/** Where something is written: 1-based line, and 1-based column in UTF-16 units, as editors count. */
export type SourceSpot = { line: number; column: number };

/** One attribute as the parser read it, located at its name. */
export type HtmlAttribute = SourceSpot & { name: string; value: string };

/**
 * One start tag, located at its `<`, with its attributes in source order, and whether it is in a
 * slide: the `<section class="slide">` itself or inside one, rather than a full document's head.
 */
type HtmlElement = SourceSpot & {
  tag: string;
  attributes: HtmlAttribute[];
  inSlide: boolean;
};

/** One URL an attribute names, located where the URL itself is written. */
export type HtmlRef = SourceSpot & { tag: string; attr: string; value: string; use: UrlUse };

export type HtmlScan = {
  /** Every start tag in the file, in document order. */
  elements: HtmlElement[];
  /** Every `<section class="slide">`; only the first is ever shown. */
  slides: HtmlElement[];
  slug?: string;
  /** The slide section's `data-layout`. */
  layout?: string;
  classes: string[];
  /** Every URL the markup names, a `srcset` candidate apiece. */
  refs: HtmlRef[];
  /** Headings with nothing to read: no text, no image, no `aria-label`. */
  emptyHeadings: HtmlElement[];
  /**
   * Each outermost `aria-hidden="true"` element that holds text, with that text, its whitespace
   * collapsed. An SVG's `<title>` and `<desc>` describe it and are never drawn, so they hold none.
   */
  hiddenTexts: Array<{ element: HtmlElement; text: string }>;
  /**
   * Each outermost picture a screen reader is not told to skip: an `<img>`, an `<svg>`, or an
   * element with `role="img"`, none of them under `aria-hidden="true"`. `text` says whether it
   * holds any text to read, and `titled` whether a `<title>` inside it names it.
   */
  pictures: Picture[];
};

/** A picture in the markup, with what it holds that a screen reader could say. */
export type Picture = { element: HtmlElement; text: boolean; titled: boolean };

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
/** Elements that give a heading something to show without any text. */
const CONTENT_TAGS = new Set(["img", "svg", "picture", "video", "canvas", "object", "math"]);
/** Elements whose text describes a picture rather than being drawn in it. */
const UNDRAWN_TAGS = new Set(["title", "desc"]);

/**
 * What a slide's markup uses and references, read in one pass of the real parser and located in
 * the source. The parser has no positions, so each start tag gets a marker in front of it; where
 * the markers land, less their own length, is where the tags were written.
 */
export function scanSlideHtml(html: string): HtmlScan {
  const mark = uniqueMark(html);
  const parsed: Array<{ tag: string; attributes: Array<[string, string]>; inSlide: boolean }> = [];
  let slidesOpen = 0;
  const headings: Array<{ index: number; content: boolean }> = [];
  const open: Array<{ index: number; content: boolean }> = [];
  const hidden: Array<{ index: number; text: string }> = [];
  // The outermost aria-hidden element still open, and how many undrawn elements are open in it.
  let hiding: { index: number; text: string } | undefined;
  let undrawn = 0;
  // The outermost picture still open, and whether a <title> inside it is open.
  const pictures: Array<{ index: number; text: boolean; titled: boolean }> = [];
  let picture: { index: number; text: boolean; titled: boolean } | undefined;
  let titles = 0;

  const transformed = new HTMLRewriter()
    .on("*", {
      element(el) {
        el.before(mark, { html: true });
        const tag = el.tagName.toLowerCase();
        const attributes = [...el.attributes].map(([name, value]): [string, string] => [
          name.toLowerCase(),
          value,
        ]);
        if (CONTENT_TAGS.has(tag)) {
          for (const heading of open) {
            heading.content = true;
          }
        }
        if (hiding) {
          // Two elements' texts are two words, whatever whitespace the source puts between them.
          hiding.text += " ";
          if (UNDRAWN_TAGS.has(tag) && el.canHaveContent) {
            undrawn++;
            el.onEndTag(() => {
              undrawn--;
            });
          }
        } else if (el.getAttribute("aria-hidden")?.trim() === "true" && el.canHaveContent) {
          const entry = { index: parsed.length, text: "" };
          hidden.push(entry);
          hiding = entry;
          el.onEndTag(() => {
            hiding = undefined;
          });
        }
        if (picture) {
          if (tag === "title" && el.canHaveContent) {
            titles++;
            el.onEndTag(() => {
              titles--;
            });
          }
        } else if (
          !hiding &&
          el.getAttribute("aria-hidden")?.trim() !== "true" &&
          isPicture(tag, el.getAttribute("role"))
        ) {
          const entry = { index: parsed.length, text: false, titled: false };
          pictures.push(entry);
          if (el.canHaveContent) {
            picture = entry;
            el.onEndTag(() => {
              picture = undefined;
            });
          }
        }
        if (HEADING_TAGS.has(tag) && el.canHaveContent) {
          const heading = {
            index: parsed.length,
            content: (el.getAttribute("aria-label") ?? "").trim() !== "",
          };
          headings.push(heading);
          open.push(heading);
          el.onEndTag(() => {
            open.splice(open.indexOf(heading), 1);
          });
        }
        if (tag === "section" && hasSlideClass(el.getAttribute("class")) && el.canHaveContent) {
          slidesOpen++;
          el.onEndTag(() => {
            slidesOpen--;
          });
        }
        parsed.push({ tag, attributes, inSlide: slidesOpen > 0 });
      },
    })
    .onDocument({
      text(chunk) {
        if (hiding && undrawn === 0) {
          hiding.text += chunk.text;
        }
        if (picture && !hiding && chunk.text.trim() !== "") {
          picture.text = true;
          picture.titled ||= titles > 0;
        }
        if (open.length > 0 && chunk.text.trim() !== "") {
          for (const heading of open) {
            heading.content = true;
          }
        }
      },
    })
    .transform(html);
  if (typeof transformed !== "string") {
    throw new Error("HTMLRewriter.transform expected a string");
  }

  const spot = lineLocator(html);
  const elements: HtmlElement[] = [];
  const refs: HtmlRef[] = [];
  let start = 0;
  for (const [index, before] of transformed.split(mark).slice(0, -1).entries()) {
    start += before.length;
    const { tag, attributes, inSlide } = parsed[index] ?? {
      tag: "",
      attributes: [],
      inSlide: false,
    };
    const offsets = attributeOffsets(html, start);
    const element: HtmlElement = {
      tag,
      inSlide,
      ...spot(start),
      attributes: attributes.map(([name, value]) => ({
        name,
        value,
        ...spot(offsets.get(name)?.name ?? start),
      })),
    };
    elements.push(element);
    for (const attribute of element.attributes) {
      const valueAt = offsets.get(attribute.name)?.value;
      refs.push(
        ...attributeRefs(element.tag, attribute).map(({ ref, offset }) => ({
          ...ref,
          ...(valueAt === undefined ? spot(start) : spot(valueAt + offset)),
        })),
      );
    }
  }

  const slides = elements.filter(
    (element) => element.tag === "section" && hasSlideClass(attributeValue(element, "class")),
  );
  const slug = slides.map((element) => attributeValue(element, "data-slug")).find(isDefined);
  const layout = slides[0] && attributeValue(slides[0], "data-layout");
  return {
    elements,
    slides,
    ...(slug === undefined ? {} : { slug }),
    ...(layout === undefined ? {} : { layout }),
    classes: elements.flatMap((element) =>
      (attributeValue(element, "class") ?? "").split(/\s+/).filter(Boolean),
    ),
    refs,
    emptyHeadings: headings
      .filter((heading) => !heading.content)
      .flatMap((heading) => elements[heading.index] ?? []),
    hiddenTexts: hidden.flatMap(({ index, text }) => {
      const element = elements[index];
      const squashed = text.replace(/\s+/g, " ").trim();
      return element && squashed !== "" ? [{ element, text: squashed }] : [];
    }),
    pictures: pictures.flatMap(({ index, text, titled }) => {
      const element = elements[index];
      return element ? [{ element, text, titled }] : [];
    }),
  };
}

/**
 * Whether an element draws a picture a screen reader must be told about. `role="presentation"`
 * or `"none"` says it is decoration, as `aria-hidden` does.
 */
function isPicture(tag: string, role: string | null): boolean {
  const roles = (role ?? "").trim().toLowerCase().split(/\s+/);
  if (roles[0] === "presentation" || roles[0] === "none") {
    return false;
  }
  return tag === "img" || tag === "svg" || roles[0] === "img";
}

/** The value of `name` on `element`, as the parser read it. */
function attributeValue(element: HtmlElement, name: string): string | undefined {
  return element.attributes.find((attribute) => attribute.name === name)?.value;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/** The URLs one attribute names, each with its offset into the value. */
function attributeRefs(
  tag: string,
  attribute: HtmlAttribute,
): Array<{ ref: Omit<HtmlRef, keyof SourceSpot>; offset: number }> {
  const named = attributeUrls(tag, attribute.name, attribute.value);
  if (!named) {
    return [];
  }
  return named.urls.map(({ url, offset }) => ({
    ref: { tag, attr: attribute.name, value: url, use: named.use },
    offset,
  }));
}

/**
 * Where each attribute of the start tag at `start` is written: its name, and its value when it
 * has one. Only positions come from here; names and values are the parser's.
 */
function attributeOffsets(
  html: string,
  start: number,
): Map<string, { name: number; value?: number }> {
  const offsets = new Map<string, { name: number; value?: number }>();
  const re = /\s*(?:([^\s"'>/=]+)(?:(\s*=\s*)(["']?))?|\/)/y;
  re.lastIndex = start + 1 + (html.slice(start + 1).match(/^[^\s/>]*/)?.[0].length ?? 0);
  while (re.lastIndex < html.length && html[re.lastIndex] !== ">") {
    const at = re.lastIndex;
    const match = re.exec(html);
    if (!match || match[0].length === 0) {
      break;
    }
    const [whole, attr, equals, quote] = match;
    if (attr === undefined) {
      continue;
    }
    const nameAt = at + whole.indexOf(attr);
    let valueAt: number | undefined;
    if (equals !== undefined) {
      valueAt = nameAt + attr.length + equals.length + (quote ? 1 : 0);
      const end = quote
        ? html.indexOf(quote, valueAt)
        : valueAt + Math.max(0, html.slice(valueAt).search(/[\s>]/));
      re.lastIndex = end === -1 ? html.length : quote ? end + 1 : end;
    }
    const key = attr.toLowerCase();
    if (!offsets.has(key)) {
      offsets.set(key, valueAt === undefined ? { name: nameAt } : { name: nameAt, value: valueAt });
    }
  }
  return offsets;
}
