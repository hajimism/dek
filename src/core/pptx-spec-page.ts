// What a slide is made of, read in its page for an agent to build the slide again in PowerPoint:
// its elements as the browser laid them out, each with what it paints and the text it sets, in
// reading order. The functions here run inside the page, so each holds everything it uses.

/** A box on the slide, in the slide's own pixels from its top left corner. */
type SpecPageRect = { x: number; y: number; width: number; height: number };

/** One run of a block's text: characters set alike, as computed values. */
export type SpecPageRun = {
  text: string;
  /** In pixels. */
  size: number;
  weight: number;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** A CSS color, as `getComputedStyle` gives it. */
  color: string;
  /** The `font-family` it is set in. */
  family: string;
  /** The color behind it, when an element inside the block paints one: a marker or a chip. */
  background?: string;
  /** Set in `<code>` or `<kbd>`. */
  code?: true;
  /** Where its link goes. */
  link?: string;
};

/** A block's text: its runs in order, a line break as `\n`, and how the browser set it. */
export type SpecPageText = {
  runs: SpecPageRun[];
  align: string;
  /** In pixels; not a number when it is `normal`. */
  lineHeight: number;
  /** How many lines the browser broke it into. */
  lines: number;
  /** Whether the browser keeps its spaces and breaks, as in `<pre>`. */
  pre: boolean;
};

/** Why a node is offered as a picture: what it shows that a shape and its text cannot say. */
type SpecPagePicture = "image" | "svg" | "canvas" | "video" | "background" | "drawn";

export type SpecPageNode = {
  /** Its place in the page's walk, to find its element again. */
  index: number;
  tag: string;
  classes: string[];
  rect: SpecPageRect;
  /** Its background color, when it paints one. */
  fill?: string;
  border?: { width: number; color: string };
  /** Borders that differ per side. */
  sides?: Partial<Record<"top" | "right" | "bottom" | "left", { width: number; color: string }>>;
  radius?: number;
  shadow?: string;
  opacity?: number;
  /** Its heading level, for `<h1>` to `<h6>`. */
  heading?: number;
  /** Under `aria-hidden="true"`: decoration. */
  decoration?: true;
  alt?: string;
  picture?: SpecPagePicture;
  /** What its `::before` and `::after` write. */
  before?: string;
  after?: string;
  text?: SpecPageText;
  children: SpecPageNode[];
};

export type SpecPage = {
  slide: SpecPageNode;
  /** Where the slide's corner lies in the viewport. */
  origin: { left: number; top: number };
  /** The slide's `data-layout`. */
  layout?: string;
  /** Each custom property whose value is a color, as a computed color. */
  colors: Record<string, string>;
  /** Each `--font-*` custom property, as the `font-family` it is. */
  fonts: Record<string, string>;
};

export const SPEC_NODE_ATTR = "data-dek-spec";

/** The slide's elements, walked in reading order, each marked with its index for a crop. */
export function measurePptxSpecInPage(): SpecPage | null {
  const NODE_ATTR = "data-dek-spec";
  const slide = document.querySelector<HTMLElement>("section.slide");
  if (!slide) {
    return null;
  }
  const origin = slide.getBoundingClientRect();
  const REPLACED: Record<string, SpecPagePicture> = {
    img: "image",
    svg: "svg",
    canvas: "canvas",
    video: "video",
    picture: "image",
    object: "image",
    iframe: "image",
  };
  const SEMANTIC = new Set([
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "figure",
    "figcaption",
    "pre",
    "blockquote",
    "dl",
    "dt",
    "dd",
  ]);
  let next = 0;

  const visible = (color: string): boolean => {
    if (!color || color === "transparent") {
      return false;
    }
    const alpha = /rgba?\([^)]*[,/]\s*([\d.]+)\s*\)/.exec(color);
    return !alpha || Number(alpha[1]) > 0;
  };
  const rectOf = (box: DOMRect): SpecPageRect => ({
    x: box.left - origin.left,
    y: box.top - origin.top,
    width: box.width,
    height: box.height,
  });
  const inline = (style: CSSStyleDeclaration): boolean => style.display.startsWith("inline");
  const pseudoText = (element: Element, pseudo: "::before" | "::after"): string | undefined => {
    const content = getComputedStyle(element, pseudo).content;
    const quoted = /^"(.*)"$/s.exec(content);
    return quoted?.[1] ? quoted[1] : undefined;
  };
  const pseudoPaints = (element: Element): boolean =>
    (["::before", "::after"] as const).some((pseudo) => {
      const style = getComputedStyle(element, pseudo);
      if (style.content === "none" || style.content === "normal") {
        return false;
      }
      return (
        visible(style.backgroundColor) ||
        style.backgroundImage !== "none" ||
        ["Top", "Right", "Bottom", "Left"].some(
          (side) =>
            Number.parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 &&
            visible(style.getPropertyValue(`border-${side.toLowerCase()}-color`)),
        )
      );
    });

  /** The text an element sets as one block, with what its inline elements paint. */
  const textOf = (element: HTMLElement, style: CSSStyleDeclaration): SpecPageText | undefined => {
    const pre = /^(pre|pre-wrap|break-spaces|pre-line)$/.test(style.whiteSpace);
    const runs: SpecPageRun[] = [];
    const push = (text: string, owner: Element, background?: string) => {
      const own = getComputedStyle(owner);
      const link = owner.closest("a[href]")?.getAttribute("href") ?? undefined;
      const run: SpecPageRun = {
        text,
        size: Number.parseFloat(own.fontSize),
        weight: Number(own.fontWeight) || 400,
        italic: own.fontStyle === "italic" || own.fontStyle.startsWith("oblique"),
        underline: own.textDecorationLine.includes("underline"),
        strike: own.textDecorationLine.includes("line-through"),
        color: own.color,
        family: own.fontFamily,
        ...(background ? { background } : {}),
        ...(owner.closest("code, kbd") ? { code: true as const } : {}),
        ...(link ? { link } : {}),
      };
      const last = runs.at(-1);
      const { text: _a, ...a } = run;
      const same =
        last !== undefined &&
        (() => {
          const { text: _b, ...b } = last;
          return JSON.stringify(a) === JSON.stringify(b);
        })();
      if (same && last) {
        last.text += text;
      } else {
        runs.push(run);
      }
    };
    const walk = (node: Node, background?: string) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const raw = child.textContent ?? "";
          const text = pre ? raw : raw.replace(/\s+/g, " ");
          if (text) {
            push(text, child.parentElement ?? element, background);
          }
        } else if (child instanceof HTMLElement || child instanceof SVGElement) {
          const own = getComputedStyle(child);
          if (own.display === "none" || own.visibility === "hidden") {
            continue;
          }
          if (child.tagName === "BR") {
            push("\n", element, background);
          } else if (inline(own) && !(child.tagName.toLowerCase() in REPLACED)) {
            const before = pseudoText(child, "::before");
            if (before) {
              push(before, child, background);
            }
            walk(child, visible(own.backgroundColor) ? own.backgroundColor : background);
            const after = pseudoText(child, "::after");
            if (after) {
              push(after, child, background);
            }
          }
        }
      }
    };
    walk(element);
    // Spaces the browser drops: at the ends of the block and around a line break.
    if (!pre) {
      for (const [i, run] of runs.entries()) {
        if (i === 0 || runs[i - 1]?.text.endsWith("\n") || runs[i - 1]?.text.endsWith(" ")) {
          run.text = run.text.replace(/^ +/, "");
        }
        run.text = run.text.replace(/ *\n */g, "\n");
      }
      const last = runs.at(-1);
      if (last) {
        last.text = last.text.replace(/ +$/, "");
      }
    }
    const kept = runs.filter((run) => run.text !== "");
    if (!kept.some((run) => run.text.trim() !== "")) {
      return undefined;
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops: number[] = [];
    for (const box of range.getClientRects()) {
      if (box.width > 0 && !tops.some((top) => Math.abs(top - box.top) < box.height / 2)) {
        tops.push(box.top);
      }
    }
    return {
      runs: kept,
      align:
        style.textAlign === "start"
          ? "left"
          : style.textAlign === "end"
            ? "right"
            : style.textAlign,
      lineHeight: Number.parseFloat(style.lineHeight),
      lines: Math.max(1, tops.length),
      pre,
    };
  };

  /** Whether an element sets text of its own, beside or instead of blocks inside it. */
  const setsText = (element: Element): boolean =>
    [...element.childNodes].some((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        return (child.textContent ?? "").trim() !== "";
      }
      if (!(child instanceof HTMLElement)) {
        return false;
      }
      const own = getComputedStyle(child);
      return (
        own.display !== "none" &&
        (child.tagName === "BR" ||
          (inline(own) && !(child.tagName.toLowerCase() in REPLACED) && setsText(child)) ||
          (inline(own) &&
            (pseudoText(child, "::before") ?? pseudoText(child, "::after")) !== undefined))
      );
    });

  const visit = (element: Element, hidden: boolean, root: boolean): SpecPageNode[] => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return [];
    }
    const box = element.getBoundingClientRect();
    const tag = element.tagName.toLowerCase();
    const decoration = hidden || element.getAttribute("aria-hidden") === "true";
    const node: SpecPageNode = {
      index: next++,
      tag,
      classes: [...element.classList],
      rect: rectOf(box),
      children: [],
    };
    element.setAttribute(NODE_ATTR, String(node.index));
    if (decoration) {
      node.decoration = true;
    }
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      node.heading = Number(heading[1]);
    }
    if (visible(style.backgroundColor)) {
      node.fill = style.backgroundColor;
    }
    const sides = (["top", "right", "bottom", "left"] as const).flatMap((side) => {
      const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
      const color = style.getPropertyValue(`border-${side}-color`);
      return width > 0 &&
        visible(color) &&
        style.getPropertyValue(`border-${side}-style`) !== "none"
        ? [[side, { width, color }] as const]
        : [];
    });
    if (
      sides.length === 4 &&
      sides.every(([, side]) => JSON.stringify(side) === JSON.stringify(sides[0]?.[1]))
    ) {
      node.border = sides[0]?.[1];
    } else if (sides.length > 0) {
      node.sides = Object.fromEntries(sides);
    }
    const radius = Number.parseFloat(style.borderTopLeftRadius);
    if (radius > 0) {
      node.radius = radius;
    }
    if (style.boxShadow !== "none") {
      node.shadow = style.boxShadow;
    }
    if (Number(style.opacity) < 1) {
      node.opacity = Number(style.opacity);
    }
    const before = pseudoText(element, "::before");
    const after = pseudoText(element, "::after");
    if (before) {
      node.before = before;
    }
    if (after) {
      node.after = after;
    }
    const replaced = REPLACED[tag];
    if (replaced) {
      node.picture = replaced;
      const alt =
        element.getAttribute("alt") ??
        element.getAttribute("aria-label") ??
        element.querySelector("title")?.textContent ??
        undefined;
      if (alt) {
        node.alt = alt;
      }
      return [node];
    }
    if (/url\(/.test(style.backgroundImage)) {
      node.picture = "background";
    } else if (
      style.backgroundImage !== "none" ||
      style.clipPath !== "none" ||
      style.maskImage !== "none" ||
      (style.transform !== "none" && !/^matrix\(1, 0, 0, 1,/.test(style.transform)) ||
      style.filter !== "none" ||
      pseudoPaints(element)
    ) {
      node.picture = "drawn";
    }
    if (setsText(element)) {
      const text = textOf(element as HTMLElement, style);
      if (text) {
        node.text = text;
      }
    }
    for (const child of element.children) {
      const own = getComputedStyle(child);
      // Inline elements with text are runs of this block's text; one that paints but says
      // nothing, such as a badge, is a node of its own.
      if (
        node.text &&
        inline(own) &&
        !(child.tagName.toLowerCase() in REPLACED) &&
        (setsText(child) || child.tagName === "BR")
      ) {
        continue;
      }
      node.children.push(...visit(child, decoration, false));
    }
    const kept =
      root ||
      node.fill !== undefined ||
      node.border !== undefined ||
      node.sides !== undefined ||
      node.shadow !== undefined ||
      node.picture !== undefined ||
      node.text !== undefined ||
      node.before !== undefined ||
      node.after !== undefined ||
      (SEMANTIC.has(tag) && node.children.length > 0) ||
      node.children.length >= 2;
    return kept ? [node] : node.children;
  };

  const [root] = visit(slide, false, true);
  if (!root) {
    return null;
  }
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  const rootStyle = getComputedStyle(slide);
  const probe = document.createElement("span");
  slide.append(probe);
  for (let i = 0; i < rootStyle.length; i++) {
    const name = rootStyle.item(i);
    if (!name.startsWith("--")) {
      continue;
    }
    const value = rootStyle.getPropertyValue(name).trim();
    if (name.startsWith("--font-")) {
      fonts[name.slice(2)] = value;
      continue;
    }
    probe.style.color = "";
    probe.style.color = `var(${name})`;
    probe.style.setProperty("--dek-spec-probe", "1");
    if (value && !/^-?[\d.]+[a-z%]*$/.test(value) && CSS.supports("color", value)) {
      colors[name.slice(2)] = getComputedStyle(probe).color;
    }
  }
  probe.remove();
  const layout = slide.getAttribute("data-layout") ?? undefined;
  return {
    slide: root,
    origin: { left: origin.left, top: origin.top },
    ...(layout ? { layout } : {}),
    colors,
    fonts,
  };
}

/**
 * Shows one node alone for its picture: everything else hidden, and for a node drawn of its own
 * paint, the elements and text inside it too, which are nodes of their own. `null` shows all.
 */
export function showPptxSpecNodeInPage(target: { index: number; alone: boolean } | null): void {
  const NODE_ATTR = "data-dek-spec";
  const CROP_ATTR = "data-dek-spec-crop";
  const STYLE_ID = "dek-spec-crop-style";
  document.getElementById(STYLE_ID)?.remove();
  for (const element of document.querySelectorAll(`[${CROP_ATTR}]`)) {
    element.removeAttribute(CROP_ATTR);
  }
  if (!target) {
    return;
  }
  const element = document.querySelector(`[${NODE_ATTR}="${target.index}"]`);
  if (!element) {
    return;
  }
  element.setAttribute(CROP_ATTR, "");
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    "html, body { background: transparent !important; }",
    "body * { visibility: hidden !important; }",
    `[${CROP_ATTR}]${target.alone ? "" : `, [${CROP_ATTR}] *`} { visibility: visible !important; }`,
    target.alone
      ? `[${CROP_ATTR}] { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`
      : "",
  ].join("\n");
  document.head.append(style);
}
