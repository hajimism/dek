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
  /** In pixels, where it is set apart. */
  letterSpacing?: number;
};

/** A stretch of a line set without a gap, and where the browser set it. */
export type SpecPagePiece = SpecPageRect & { text: string };

/** A block's text: its runs in order, a line break as `\n`, and how the browser set it. */
export type SpecPageText = {
  runs: SpecPageRun[];
  align: string;
  /** In pixels; not a number when it is `normal`. */
  lineHeight: number;
  /** How many lines the browser broke it into. */
  lines: number;
  /**
   * Its own characters as the browser placed them: each stretch of a line set without a gap, in
   * reading order. A gutter, a swatch, or a margin between words starts a stretch of its own.
   */
  pieces: SpecPagePiece[];
  /** Whether the browser keeps its spaces and breaks, as in `<pre>`. */
  pre: boolean;
  /**
   * How much wider its lines are set without the font's features and the browser's spacing of
   * punctuation, as PowerPoint sets them: 1.08 is 8% wider. Absent when it is no wider.
   */
  widen?: number;
};

/** Why a node is offered as a picture: what it shows that a shape and its text cannot say. */
type SpecPagePicture = "image" | "svg" | "canvas" | "video" | "background" | "drawn";

/** A border, as one side or all four draw it. */
type SpecPageBorder = { width: number; color: string; style?: "dashed" | "dotted" };

/** One of a box's shadows, as CSS casts it: its color, offset, blur, and spread. */
export type SpecPageShadow = {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  inset?: true;
};

/**
 * A pseudo-element that writes text or paints: how it is set, what it paints, and, once read from
 * Chromium's layout, what it says and where its box lies.
 */
type SpecPageMark = {
  pseudo: "before" | "after";
  run: Omit<SpecPageRun, "text">;
  lineHeight: number;
  paint?: {
    fill?: string;
    border?: SpecPageBorder;
    radius?: number;
    rotate?: number;
    /** What a shape cannot draw of it, as a node's `drawn`. */
    drawn?: string[];
  };
  text?: string;
  lines?: number;
  rect?: SpecPageRect;
};

export type SpecPageNode = {
  /** Its place in the page's walk, to find its element again. */
  index: number;
  tag: string;
  classes: string[];
  rect: SpecPageRect;
  /** Its background color, when it paints one. */
  fill?: string;
  border?: SpecPageBorder;
  /** Borders that differ per side. */
  sides?: Partial<Record<"top" | "right" | "bottom" | "left", SpecPageBorder>>;
  radius?: number;
  /** From the border to the content, where it has any. */
  padding?: { top: number; right: number; bottom: number; left: number };
  /** A CSS outline: drawn outside the border, by `offset` more. */
  outline?: { width: number; color: string; offset: number };
  shadow?: SpecPageShadow[];
  opacity?: number;
  /** How far a transform turns it, in degrees clockwise. */
  rotate?: number;
  /** Its heading level, for `<h1>` to `<h6>`. */
  heading?: number;
  /** Under `aria-hidden="true"`: decoration. */
  decoration?: true;
  alt?: string;
  picture?: SpecPagePicture;
  /** For paint a shape cannot draw: what it is, such as `gradient` or `::before`. */
  drawn?: string[];
  /** An inline box in its block's line, such as a chip, whose text is in the block's text too. */
  inline?: true;
  /**
   * Its `::before` and `::after` that write text or paint, as they are set; what each writes,
   * counters counted, and where its box lies are read from Chromium's layout after the walk.
   */
  marks?: SpecPageMark[];
  /** An image's source, as the page has it. */
  src?: string;
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

/** A part drawn alone: a node's, or one of its pseudo-elements'. */
export type PptxSpecPart = { node: number; pseudo?: "before" | "after"; png: string };

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
    // Its alpha is rgba()'s fourth number, or what follows a slash: `rgb(255, 0, 0)` is red.
    const alpha = /^rgba\(.*,\s*([\d.]+)\s*\)$|\/\s*([\d.]+)%?\s*\)$/.exec(color.trim());
    return !alpha || Number(alpha[1] ?? alpha[2]) > 0;
  };
  const rectOf = (box: DOMRect): SpecPageRect => ({
    x: box.left - origin.left,
    y: box.top - origin.top,
    width: box.width,
    height: box.height,
  });
  const inline = (style: CSSStyleDeclaration): boolean => style.display.startsWith("inline");
  const borderOf = (
    style: CSSStyleDeclaration,
    side: "top" | "right" | "bottom" | "left",
  ): SpecPageBorder | undefined => {
    const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
    const color = style.getPropertyValue(`border-${side}-color`);
    const line = style.getPropertyValue(`border-${side}-style`);
    return width > 0 && visible(color) && line !== "none" && line !== "hidden"
      ? { width, color, ...(line === "dashed" || line === "dotted" ? { style: line } : {}) }
      : undefined;
  };
  /** Each of a `box-shadow`'s shadows, as Chromium computes it: a color, then its lengths. */
  const shadowsOf = (value: string): SpecPageShadow[] => {
    if (value === "none") {
      return [];
    }
    const shadows: SpecPageShadow[] = [];
    for (const each of value.split(/,(?![^(]*\))/)) {
      const color = /(rgba?\([^)]*\)|#[0-9a-f]+|[a-z]+)(?=\s|$)/i.exec(each.trim())?.[1] ?? "";
      const lengths = [...each.replace(color, "").matchAll(/(-?[\d.]+)px/g)].map((match) =>
        Number(match[1]),
      );
      if (!visible(color) || lengths.length < 2) {
        continue;
      }
      shadows.push({
        x: lengths[0] ?? 0,
        y: lengths[1] ?? 0,
        blur: lengths[2] ?? 0,
        spread: lengths[3] ?? 0,
        color,
        ...(/\binset\b/.test(each) ? { inset: true as const } : {}),
      });
    }
    return shadows;
  };
  /** The color a gradient paints where it paints: a marker drawn under part of a line. */
  const gradientColor = (image: string): string | undefined =>
    image.includes("gradient(")
      ? (image.match(/rgba?\([^)]*\)/g) ?? []).find((color) => visible(color))
      : undefined;
  const turnOf = (transform: string): number | undefined => {
    const turn = /^matrix\(([-\d.e]+), ([-\d.e]+),/.exec(transform);
    if (!turn) {
      return undefined;
    }
    const degrees =
      Math.round(((Math.atan2(Number(turn[2]), Number(turn[1])) * 180) / Math.PI) * 10) / 10;
    return degrees === 0 ? undefined : degrees;
  };
  const pseudoText = (element: Element, pseudo: "::before" | "::after"): string | undefined => {
    const content = getComputedStyle(element, pseudo).content;
    const quoted = /^"(.*)"$/s.exec(content);
    return quoted?.[1] ? quoted[1] : undefined;
  };
  const pseudoPaints = (element: Element): string[] =>
    (["::before", "::after"] as const).filter((pseudo) => {
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

  /**
   * An inline element that draws a box of its own around its text, a chip or a pill: a node of
   * its own, not runs of its block's text. A plain marker behind words stays a run's highlight.
   */
  const boxy = (style: CSSStyleDeclaration): boolean =>
    inline(style) &&
    ((visible(style.backgroundColor) &&
      (style.display !== "inline" || Number.parseFloat(style.borderTopLeftRadius) > 0)) ||
      ["top", "right", "bottom", "left"].some(
        (side) =>
          Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
          visible(style.getPropertyValue(`border-${side}-color`)) &&
          style.getPropertyValue(`border-${side}-style`) !== "none",
      ));

  /** The text an element sets as one block, with what its inline elements paint. */
  const textOf = (element: HTMLElement, style: CSSStyleDeclaration): SpecPageText | undefined => {
    const pre = /^(pre|pre-wrap|break-spaces|pre-line)$/.test(style.whiteSpace);
    const runs: SpecPageRun[] = [];
    const push = (
      text: string,
      owner: Element,
      background?: string,
      pseudo?: "::before" | "::after",
    ) => {
      const own = getComputedStyle(owner, pseudo);
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
        ...(Number.parseFloat(own.letterSpacing)
          ? { letterSpacing: Number.parseFloat(own.letterSpacing) }
          : {}),
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
              push(before, child, background, "::before");
            }
            walk(
              child,
              visible(own.backgroundColor)
                ? own.backgroundColor
                : (gradientColor(own.backgroundImage) ?? background),
            );
            const after = pseudoText(child, "::after");
            if (after) {
              push(after, child, background, "::after");
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
    // A blank line of preformatted text, as a terminal's, is a line all the same.
    const blank = pre && element.children.length === 0 && kept.length > 0;
    if (!blank && !kept.some((run) => run.text.trim() !== "")) {
      return undefined;
    }
    // Where each of its own characters lies: lines are what share a height, and a stretch of
    // a line ends where a gap opens, as a gutter, a swatch, or a margin leaves one.
    type Line = { top: number; bottom: number; left: number; right: number; pieces: Piece[] };
    type Piece = { text: string; left: number; right: number; top: number; bottom: number };
    const lines: Line[] = [];
    const range = document.createRange();
    const place = (char: string, box: DOMRect, size: number) => {
      const overlap = (line: Line) =>
        Math.min(line.bottom, box.bottom) - Math.max(line.top, box.top);
      const line = lines
        .filter((each) => overlap(each) > Math.min(each.bottom - each.top, box.height) / 2)
        .sort((a, b) => overlap(b) - overlap(a))[0];
      if (!line) {
        const piece = {
          text: char,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        };
        lines.push({
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          pieces: [piece],
        });
        return;
      }
      line.top = Math.min(line.top, box.top);
      line.bottom = Math.max(line.bottom, box.bottom);
      line.left = Math.min(line.left, box.left);
      line.right = Math.max(line.right, box.right);
      const last = line.pieces.at(-1);
      if (last && box.left >= last.right - 1 && box.left - last.right <= size * 0.4) {
        last.text += char;
        last.right = Math.max(last.right, box.right);
        last.top = Math.min(last.top, box.top);
        last.bottom = Math.max(last.bottom, box.bottom);
      } else {
        line.pieces.push({
          text: char,
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom,
        });
      }
    };
    const count = (node: Node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          const data = child.textContent ?? "";
          const size = Number.parseFloat(getComputedStyle(child.parentElement ?? element).fontSize);
          for (let i = 0; i < data.length; ) {
            const step = (data.codePointAt(i) ?? 0) > 0xffff ? 2 : 1;
            const char = data.slice(i, i + step);
            range.setStart(child, i);
            range.setEnd(child, i + step);
            i += step;
            const box = [...range.getClientRects()].find((each) => each.height > 0);
            // A space the browser collapsed, or one it hangs past a line's end, takes no room.
            if (box && (box.width > 0 || char.trim() !== "")) {
              place(/\s/.test(char) ? " " : char, box, size);
            }
          }
        } else if (child instanceof HTMLElement) {
          const own = getComputedStyle(child);
          if (inline(own) && !(child.tagName.toLowerCase() in REPLACED)) {
            count(child);
          }
        }
      }
    };
    count(element);
    lines.sort((a, b) => a.top - b.top);
    const pieces = lines.flatMap((line) =>
      line.pieces.flatMap((piece): SpecPagePiece[] => {
        const text = pre ? piece.text.replace(/\s+$/, "") : piece.text.trim();
        return text === ""
          ? []
          : [
              {
                text,
                x: piece.left - origin.left,
                y: piece.top - origin.top,
                width: piece.right - piece.left,
                height: piece.bottom - piece.top,
              },
            ];
      }),
    );
    // Where the lines sit in the content box says how they are set, a flexbox's centering too.
    const outer = element.getBoundingClientRect();
    const px = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
    const contentLeft = outer.left + px("border-left-width") + px("padding-left");
    const contentRight = outer.right - px("border-right-width") - px("padding-right");
    const css =
      style.textAlign === "start" ? "left" : style.textAlign === "end" ? "right" : style.textAlign;
    const gaps = lines.map((line) => ({
      before: line.left - contentLeft,
      after: contentRight - line.right,
    }));
    const align =
      gaps.length > 0 &&
      gaps.every((gap) => gap.before > 2 && Math.abs(gap.before - gap.after) <= 3)
        ? "center"
        : gaps.length > 0 && gaps.every((gap) => gap.before > 2 && gap.after <= 2)
          ? "right"
          : css;
    // The same text on one line, as the page sets it and as PowerPoint would: no font features,
    // no kerning, and punctuation spaced whole.
    const measure = (plain: boolean): number => {
      const probe = element.cloneNode(true) as HTMLElement;
      probe.removeAttribute(NODE_ATTR);
      Object.assign(probe.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "max-content",
        maxWidth: "none",
        whiteSpace: pre ? "pre" : "nowrap",
        visibility: "hidden",
        padding: "0",
        border: "0",
      });
      if (plain) {
        for (const each of [probe, ...probe.querySelectorAll<HTMLElement>("*")]) {
          each.style.setProperty("font-feature-settings", "normal", "important");
          each.style.setProperty("font-kerning", "none", "important");
          each.style.setProperty("text-spacing-trim", "space-all", "important");
        }
      }
      element.parentElement?.append(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return width;
    };
    const set = measure(false);
    const widen = set > 0 ? Math.round((measure(true) / set) * 100) / 100 : 1;
    return {
      runs: kept,
      align,
      lineHeight: Number.parseFloat(style.lineHeight),
      lines: Math.max(1, lines.length),
      pieces,
      pre,
      ...(widen > 1 ? { widen } : {}),
    };
  };

  /** Whether an element sets text of its own, beside or instead of blocks inside it. */
  const setsText = (element: Element): boolean =>
    [...element.childNodes].some((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent ?? "";
        return (
          text.trim() !== "" ||
          (text !== "" &&
            element.children.length === 0 &&
            /^(pre|pre-wrap|break-spaces)$/.test(getComputedStyle(element).whiteSpace))
        );
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

  /** What paints inside an inline run of a block's text without being text of it. */
  const painted = (element: Element, hidden: boolean): SpecPageNode[] =>
    [...element.children].flatMap((child) => {
      const own = getComputedStyle(child);
      return inline(own) &&
        !(child.tagName.toLowerCase() in REPLACED) &&
        (setsText(child) || child.tagName === "BR")
        ? painted(child, hidden)
        : visit(child, hidden, false);
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
      const border = borderOf(style, side);
      return border ? [[side, border] as const] : [];
    });
    if (
      sides.length === 4 &&
      sides.every(([, side]) => JSON.stringify(side) === JSON.stringify(sides[0]?.[1]))
    ) {
      node.border = sides[0]?.[1] ?? { width: 0, color: "" };
    } else if (sides.length > 0) {
      node.sides = Object.fromEntries(sides);
    }
    const radius = Number.parseFloat(style.borderTopLeftRadius);
    if (radius > 0) {
      node.radius = radius;
    }
    const padding = {
      top: Number.parseFloat(style.paddingTop) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
    };
    if (Object.values(padding).some((side) => side > 0)) {
      node.padding = padding;
    }
    const shadows = shadowsOf(style.boxShadow);
    if (shadows.length > 0) {
      node.shadow = shadows;
    }
    const outlineWidth = Number.parseFloat(style.outlineWidth);
    if (outlineWidth > 0 && style.outlineStyle !== "none" && visible(style.outlineColor)) {
      node.outline = {
        width: outlineWidth,
        color: style.outlineColor,
        offset: Number.parseFloat(style.outlineOffset) || 0,
      };
    }
    const rotate = turnOf(style.transform);
    if (rotate !== undefined) {
      node.rotate = rotate;
    }
    if (Number(style.opacity) < 1) {
      node.opacity = Number(style.opacity);
    }
    // What the slide's own pseudo-elements paint is its backdrop, drawn into its part; another
    // element's is a node of its own, which may reach past its host's box.
    const painting = pseudoPaints(element);
    const marks = (["before", "after"] as const).flatMap((pseudo): SpecPageMark[] => {
      const own = getComputedStyle(element, `::${pseudo}`);
      const paints = !root && painting.includes(`::${pseudo}`);
      if (own.content === "none" || own.content === "normal" || (own.content === '""' && !paints)) {
        return [];
      }
      const spacing = Number.parseFloat(own.letterSpacing);
      const sides = (["top", "right", "bottom", "left"] as const).map((side) =>
        borderOf(own, side),
      );
      const border = sides.every((side) => JSON.stringify(side) === JSON.stringify(sides[0]))
        ? sides[0]
        : undefined;
      const radius = Number.parseFloat(own.borderTopLeftRadius);
      const turn = turnOf(own.transform);
      const drawn = [
        ...(own.backgroundImage !== "none" ? ["gradient"] : []),
        ...(own.clipPath !== "none" ? ["clip-path"] : []),
        ...(own.maskImage !== "none" ? ["mask"] : []),
        ...(own.filter !== "none" ? ["filter"] : []),
        ...(sides.some(Boolean) && !border ? ["sides"] : []),
      ];
      return [
        {
          pseudo,
          run: {
            size: Number.parseFloat(own.fontSize),
            weight: Number(own.fontWeight) || 400,
            italic: own.fontStyle === "italic",
            underline: own.textDecorationLine.includes("underline"),
            strike: own.textDecorationLine.includes("line-through"),
            color: own.color,
            family: own.fontFamily,
            ...(spacing ? { letterSpacing: spacing } : {}),
          },
          lineHeight: Number.parseFloat(own.lineHeight),
          ...(paints
            ? {
                paint: {
                  ...(visible(own.backgroundColor) ? { fill: own.backgroundColor } : {}),
                  ...(border ? { border } : {}),
                  ...(radius > 0 ? { radius } : {}),
                  ...(turn === undefined ? {} : { rotate: turn }),
                  ...(drawn.length > 0 ? { drawn } : {}),
                },
              }
            : {}),
        },
      ];
    });
    if (marks.length > 0) {
      node.marks = marks;
    }
    const replaced = REPLACED[tag];
    if (replaced) {
      node.picture = replaced;
      const src = element.getAttribute("src");
      if (src && !src.startsWith("data:")) {
        node.src = src;
      }
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
    const drawn = [
      ...(style.backgroundImage.includes("gradient(") ? ["gradient"] : []),
      ...(style.clipPath !== "none" ? ["clip-path"] : []),
      ...(style.maskImage !== "none" ? ["mask"] : []),
      ...(style.transform !== "none" && !/^matrix\(1, 0, 0, 1,/.test(style.transform)
        ? ["transform"]
        : []),
      ...(style.filter !== "none" ? ["filter"] : []),
      ...(root ? painting : []),
    ];
    if (/url\(/.test(style.backgroundImage)) {
      node.picture = "background";
    } else if (drawn.length > 0) {
      node.picture = "drawn";
      node.drawn = drawn;
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
        // A chip in the line is a node of its own too, for its box, as is a box set to a width
        // of its own, a gutter's; its text stays the block's. What paints inside the line's
        // words and says nothing, such as a strike drawn by an empty element, is a node.
        if (boxy(own) || /^inline-(block|flex|grid)$/.test(own.display)) {
          for (const inner of visit(child, decoration, false)) {
            inner.inline = true;
            node.children.push(inner);
          }
        } else {
          node.children.push(...painted(child, decoration));
        }
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
      node.outline !== undefined ||
      node.marks !== undefined ||
      node.picture !== undefined ||
      node.text !== undefined ||
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
 * paint, the elements and text inside it too, which are nodes of their own, and its
 * pseudo-elements unless they are its paint, as the slide's are; or one of its pseudo-elements
 * alone. `null` shows all.
 */
export function showPptxSpecNodeInPage(
  target: { index: number; alone: boolean; marks?: boolean; pseudo?: "before" | "after" } | null,
): void {
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
  const crop = `[${CROP_ATTR}]`;
  const other = target.pseudo === "before" ? "after" : "before";
  style.textContent = [
    "html, body { background: transparent !important; }",
    "body * { visibility: hidden !important; }",
    `${crop}${target.alone ? "" : `, ${crop} *`} { visibility: visible !important; }`,
    target.alone
      ? // The text's fill alone: currentColor, which a pseudo-element's dot may paint in, stays.
        `${crop} { -webkit-text-fill-color: transparent !important; text-shadow: none !important; }`
      : "",
    target.pseudo
      ? `${crop} { background: none !important; border-color: transparent !important; box-shadow: none !important; outline: none !important; } ${crop}::${other} { visibility: hidden !important; }`
      : target.alone && target.marks
        ? `${crop}::before, ${crop}::after { visibility: hidden !important; }`
        : "",
  ].join("\n");
  document.head.append(style);
}
