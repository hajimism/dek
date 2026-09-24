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
  fg: string;
  bg: string;
  fontSize: number;
  fontWeight: number;
  opacity: number;
};

export type SlideMeasure = {
  slideBox: Box | undefined;
  elements: MeasuredElement[];
};

/**
 * Measures the first `.slide` in the current document. It runs inside the page
 * through `page.evaluate`, which serializes only this function, so it must not
 * reference anything outside its own body.
 */
export function measureSlideInPage(): SlideMeasure {
  const slide = document.querySelector(".slide");
  if (!slide) {
    return { slideBox: undefined, elements: [] };
  }
  const runtimeClasses = new Set(["is-current", "is-shown"]);
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
  const backgroundOf = (el: Element): string => {
    let background = getComputedStyle(el).backgroundColor;
    let current: Element | null = el.parentElement;
    while (current && (!background || background === "transparent" || /,\s*0\)/.test(background))) {
      background = getComputedStyle(current).backgroundColor;
      current = current.parentElement;
    }
    return background;
  };

  const all = [...slide.querySelectorAll("*")];
  const indexOf = new Map(all.map((el, index) => [el, index]));
  const elements = all.map((el): MeasuredElement => {
    const style = getComputedStyle(el);
    const textNodes = [...el.childNodes].filter(
      (node) => node.nodeType === Node.TEXT_NODE && squash(node.textContent ?? "") !== "",
    );
    const own = squash(textNodes.map((node) => node.textContent ?? "").join(" "));
    // innerText separates block children; textContent would run "item 0item 1" together.
    const text = own || squash((el as HTMLElement).innerText ?? el.textContent ?? "");
    const parentEl = el.parentElement;
    return {
      box: describe(el),
      parent: parentEl ? (indexOf.get(parentEl) ?? -1) : -1,
      rect: extent(el, textNodes),
      ...(text ? { text } : {}),
      ownText: own !== "",
      fg: style.color,
      bg: backgroundOf(el),
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number(style.fontWeight) || 400,
      opacity: style.opacity === "" ? 1 : Number(style.opacity),
    };
  });
  return { slideBox: toBox(slide.getBoundingClientRect()), elements };
}
