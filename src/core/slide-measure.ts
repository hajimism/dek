// This runs in the page. TypeScript 6 and later fold dom.iterable into dom; naming it keeps the
// spreads of NodeLists and DOMTokenLists typed for any compiler that reads the file.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * The id of a still page's `<style>` holding the slide's own CSS, apart from the theme, so a
 * measurement can take it away and see what the theme alone draws.
 */
export const SLIDE_CSS_ID = "dek-slide-css";

/** A rectangle in viewport pixels. */
export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** One element inside `.slide`, as the page lays it out. */
export type MeasuredElement = {
  /** A short, readable selector: tag, id, first authored class, data-step. */
  box: string;
  /** Index of the nearest measured ancestor, or -1 when that is the slide itself. */
  parent: number;
  rect: Box;
  /** The element's own text, or its whole text when it has none of its own. */
  text?: string;
  /** Whether `text` comes from the element's own text nodes. */
  ownText: boolean;
  /** The line boxes of the element's own text, where its glyphs are drawn. */
  textRects: Box[];
  /** Its opacity with every ancestor's multiplied in: how faint the page draws it. */
  opacity: number;
  fontSize: number;
  fontWeight: number;
  /**
   * Whether it is decoration: it or an ancestor is `aria-hidden="true"`, as a glow or a sample of
   * bad contrast is. Neither overflow nor contrast is measured on decoration.
   */
  decorative: boolean;
  /**
   * Whether it draws a picture the audience looks at: an image, an SVG, a video, a canvas, an
   * embedded frame or object, or an image set as its background.
   */
  picture: boolean;
  /** Whether it paints its own box: a background, or a border in a color that shows. */
  paints: boolean;
  /**
   * What an ancestor inside the slide cuts it to, with `overflow` other than `visible`: the
   * nearest such ancestor, and the box every one of them leaves visible. `intended` when the cut is
   * a truncation the author asked for, an ellipsis or a line clamp.
   */
  clip?: { box: string; rect: Box; intended: boolean };
};

/**
 * Text a `::before` or `::after` draws, such as a folio from `counter()` or a running head. The page
 * gives no box for it; the worker asks Chromium for one, by the mark this leaves on its host.
 */
type PseudoText = {
  /** The host's mark, `data-dek-text` on the element, shared by both of its pseudo-elements. */
  host: string;
  pseudo: "before" | "after";
  /** The host's short selector with the pseudo-element, as `section.slide::after`. */
  box: string;
  /** The `content` it draws, as the page computes it, its strings unquoted. */
  text: string;
  opacity: number;
  fontSize: number;
  fontWeight: number;
};

/** The attribute a pseudo text's host carries while it is measured; see `PseudoText`. */
export const PSEUDO_TEXT_HOST = "data-dek-text";

export type SlideMeasure = {
  slideBox: Box | undefined;
  elements: MeasuredElement[];
  pseudoTexts: PseudoText[];
};

/**
 * Measures the first `.slide` in the current document, and marks each element that draws a pseudo
 * text with `data-dek-text` (and `data-dek-text-before` or `-after`) for the worker to find. It runs
 * inside the page through `page.evaluate`, which serializes only this function, so it must not
 * reference anything outside its own body.
 */
export function measureSlideInPage(): SlideMeasure {
  const slide = document.querySelector(".slide");
  if (!slide) {
    return { slideBox: undefined, elements: [], pseudoTexts: [] };
  }
  // RUNTIME_CLASSES from theme-facts.ts, written out: this function cannot import.
  const runtimeClasses = new Set(["is-current", "is-shown"]);
  const pictures = new Set(["img", "svg", "video", "canvas", "iframe", "object", "embed"]);
  // Computed colors come back as rgba() or, from a newer syntax, with a "/ alpha" at the end.
  const shows = (color: string): boolean =>
    color !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(color) && !/\/\s*0\)$/.test(color);
  const paints = (style: CSSStyleDeclaration): boolean =>
    style.backgroundImage !== "none" ||
    shows(style.backgroundColor) ||
    (["Top", "Right", "Bottom", "Left"] as const).some(
      (side) =>
        Number.parseFloat(style[`border${side}Width`]) > 0 &&
        style[`border${side}Style`] !== "none" &&
        shows(style[`border${side}Color`]),
    );
  const toBox = (rect: DOMRect): Box => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  });
  const squash = (text: string): string => text.replace(/\s+/g, " ").trim();
  // An unbreakable string (a URL, a code line) runs sideways past its box
  // without growing it, so the element's own text widens the box. Only
  // sideways: glyphs rise above a tight line box without overflowing anything.
  const extent = (el: Element, textNodes: Node[]): Box => {
    const box = toBox(el.getBoundingClientRect());
    // An element that clips its own content shows none of its text past its box.
    if (getComputedStyle(el).overflowX !== "visible") {
      return box;
    }
    for (const node of textNodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }
      box.left = Math.min(box.left, rect.left);
      box.right = Math.max(box.right, rect.right);
    }
    return box;
  };
  const describe = (el: Element): string => {
    let box = el.tagName.toLowerCase();
    if (el.id) {
      box += `#${el.id}`;
    }
    const authored = [...el.classList].find((name) => !runtimeClasses.has(name));
    if (authored) {
      box += `.${authored}`;
    }
    const step = el.getAttribute("data-step");
    if (step) {
      box += `[data-step="${step}"]`;
    }
    return box;
  };
  const opacityOf = (el: Element): number => {
    // Hidden text is not drawn at all, however opaque.
    if (getComputedStyle(el).visibility !== "visible") {
      return 0;
    }
    let opacity = 1;
    for (let current: Element | null = el; current; current = current.parentElement) {
      const own = Number.parseFloat(getComputedStyle(current).opacity);
      opacity *= Number.isNaN(own) ? 1 : own;
    }
    return opacity;
  };
  const clipped = (clip: MeasuredElement["clip"]) => (clip ? { clip } : {});
  const truncates = (style: CSSStyleDeclaration): boolean =>
    style.textOverflow === "ellipsis" ||
    (style.getPropertyValue("-webkit-line-clamp") || "none") !== "none";
  const clipOf = (el: Element): MeasuredElement["clip"] => {
    let found: MeasuredElement["clip"];
    for (let at = el.parentElement; at && at !== slide; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.overflowX === "visible" && style.overflowY === "visible") {
        continue;
      }
      const rect = toBox(at.getBoundingClientRect());
      found = found
        ? {
            ...found,
            rect: {
              left: Math.max(found.rect.left, rect.left),
              top: Math.max(found.rect.top, rect.top),
              right: Math.min(found.rect.right, rect.right),
              bottom: Math.min(found.rect.bottom, rect.bottom),
            },
            intended: found.intended || truncates(style),
          }
        : { box: describe(at), rect, intended: truncates(style) };
    }
    return found && { ...found, intended: found.intended || truncates(getComputedStyle(el)) };
  };
  const lineBoxes = (textNodes: Node[]): Box[] =>
    textNodes.flatMap((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map(toBox);
    });

  const all = [...slide.querySelectorAll("*")];
  const indexOf = new Map(all.map((el, index) => [el, index]));
  const elements = all.map((el): MeasuredElement => {
    const style = getComputedStyle(el);
    const textNodes = [...el.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && squash(node.textContent ?? "") !== "",
    );
    const own = squash(textNodes.map((node) => node.textContent ?? "").join(" "));
    // innerText separates block children; textContent would run "item 0item 1" together.
    // SVG and MathML have no innerText, so they fall back to textContent.
    const whole = el instanceof HTMLElement ? el.innerText : el.textContent;
    const text = own || squash(whole ?? "");
    const parentEl = el.parentElement;
    return {
      box: describe(el),
      parent: parentEl ? (indexOf.get(parentEl) ?? -1) : -1,
      rect: extent(el, textNodes),
      ...(text ? { text } : {}),
      ownText: own !== "",
      textRects: lineBoxes(textNodes),
      opacity: opacityOf(el),
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || 400,
      decorative: el.closest('[aria-hidden="true"]') !== null,
      picture: pictures.has(el.tagName.toLowerCase()) || style.backgroundImage.includes("url("),
      paints: paints(style),
      ...clipped(clipOf(el)),
    };
  });
  // A pseudo-element draws text when its content has a letter or a digit, or comes from a
  // counter or an attribute. A quote mark or an arrow on its own is ornament, and stays with
  // the background as a glow or a rule does.
  const readable = (content: string): boolean =>
    /\b(?:counters?|attr)\(/.test(content) ||
    [...content.matchAll(/"((?:[^"\\]|\\.)*)"/g)].some(([, text]) =>
      /[\p{L}\p{N}]/u.test(text ?? ""),
    );
  const pseudoTexts: PseudoText[] = [];
  for (const [index, el] of [slide, ...all].entries()) {
    if (el.closest('[aria-hidden="true"]') !== null) {
      continue;
    }
    for (const pseudo of ["before", "after"] as const) {
      const style = getComputedStyle(el, `::${pseudo}`);
      const { content } = style;
      if (content === "none" || content === "normal" || !readable(content)) {
        continue;
      }
      const host = String(index);
      el.setAttribute("data-dek-text", host);
      el.setAttribute(`data-dek-text-${pseudo}`, "");
      const own = Number.parseFloat(style.opacity);
      pseudoTexts.push({
        host,
        pseudo,
        box: `${describe(el)}::${pseudo}`,
        // As the audience reads it: the strings without their quotes, a counter as written.
        text: squash(content.replace(/"((?:[^"\\]|\\.)*)"/g, "$1")),
        opacity: opacityOf(el) * (Number.isNaN(own) ? 1 : own),
        fontSize: Number.parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || 400,
      });
    }
  }
  return { slideBox: toBox(slide.getBoundingClientRect()), elements, pseudoTexts };
}

/** Runs in the page: takes away the marks `measureSlideInPage` left for pseudo texts. */
export function unmarkPseudoTextsInPage(): void {
  for (const el of document.querySelectorAll("[data-dek-text]")) {
    for (const name of ["data-dek-text", "data-dek-text-before", "data-dek-text-after"]) {
      el.removeAttribute(name);
    }
  }
}
