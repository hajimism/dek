// Runs in the page; dom.iterable for older compilers, as in slide-measure.ts.
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
/**
 * Draws slide scripts' frames. The player calls these directly; pages without
 * the player (shots, lint --visual, PDF) embed the same functions as source
 * via `stillDrawScript`, so they reference nothing outside this file and use
 * only the global `DekSlide` types.
 */
import { finishBeat } from "./finish-beat.ts";

/** A beat's motion in ms, keyed like `data-step`; 0 when it has none or it is not positive. */
export function stepMotionMs(module: DekSlide | undefined, step: string): number {
  const ms = module?.motion?.[step];
  return typeof ms === "number" && ms > 0 ? ms : 0;
}

/**
 * The one place a slide's `draw` runs: a throw is logged and handed back, never passed to the
 * player, which keeps presenting whatever a slide does.
 */
export function drawFrame(
  module: DekSlide | undefined,
  slide: HTMLElement,
  frame: DekMotionFrame,
): { error: unknown } | undefined {
  if (!module || typeof module.draw !== "function") {
    return undefined;
  }
  try {
    module.draw(slide, frame);
    return undefined;
  } catch (error) {
    console.error(error);
    return { error };
  }
}

/** Draws a beat as it ends, for pages that show a still: thumbnails, previews, shots, PDF. */
export function drawAtEnd(
  module: DekSlide | undefined,
  slide: HTMLElement,
  index: number,
  step: string,
): { t: number; error: unknown } | undefined {
  const t = stepMotionMs(module, step);
  const failed = drawFrame(module, slide, { index, step, t });
  return failed && { t, error: failed.error };
}

/**
 * Draws every slide `markBeat` marked, at the end of its beat, and checks each draw as it goes. A
 * draw that throws leaves the slide as it was before; one that changes the page outside its slide
 * reaches another slide in the built deck; and one that draws the end of its beat differently after
 * drawing its start keeps state between calls, which a seek in video and shots cannot replay. Each
 * is kept in `window.__dekDrawErrors` for whoever measures the page. What the draws change in
 * attributes, inline styles above all, can be taken back with `window.__dekUndoDraw`, so a
 * measurement can tell what the script draws from what CSS does.
 */
function drawMarkedSlides(): void {
  const modules = window.__dekSlides ?? {};
  const errors: NonNullable<Window["__dekDrawErrors"]> = [];
  window.__dekDrawErrors = errors;
  const observer = new window.MutationObserver(() => {});
  observer.observe(document.documentElement, {
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  const changes: MutationRecord[] = [];
  /** What the draws since the last call changed, kept for the undo as well. */
  const taken = (): MutationRecord[] => {
    const records = observer.takeRecords();
    changes.push(...records);
    return records;
  };
  const describe = (node: Node): string => {
    const el = node instanceof Element ? node : node.parentElement;
    const tag = `<${(el?.tagName ?? "document").toLowerCase()}>`;
    const other = el?.closest(".slide[data-slug]")?.getAttribute("data-slug");
    return other ? `the "${other}" slide's ${tag}` : tag;
  };
  for (const el of document.querySelectorAll<HTMLElement>(".slide[data-slug]")) {
    // markBeat writes the step key, so this page never derives one itself.
    const step = el.getAttribute("data-dek-step");
    if (step === null) {
      continue;
    }
    const slug = el.getAttribute("data-slug") ?? "";
    const module = modules[slug];
    const index = Number(el.getAttribute("data-dek-beat") || 0);
    taken();
    const failed = drawAtEnd(module, el, index, step);
    const t = stepMotionMs(module, step);
    if (failed) {
      const { error } = failed;
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      errors.push({ slug, step, t, kind: "throw", message });
      continue;
    }
    if (typeof module?.draw !== "function") {
      continue;
    }
    const end = el.outerHTML;
    drawFrame(module, el, { index, step, t: 0 });
    drawFrame(module, el, { index, step, t });
    if (el.outerHTML !== end) {
      errors.push({
        slug,
        step,
        t,
        kind: "seek",
        message: "draws the end of the beat differently after drawing its start",
      });
    }
    const outside = new Set(
      taken()
        .filter((change) => !el.contains(change.target))
        .map((change) => describe(change.target)),
    );
    for (const where of outside) {
      errors.push({ slug, step, t, kind: "reach", message: `changes ${where} outside its slide` });
    }
  }
  taken();
  observer.disconnect();
  const attributeChanges = changes.filter((change) => change.type === "attributes");
  if (attributeChanges.length > 0) {
    window.__dekUndoDraw = () => {
      // The first old value of each attribute is what it held before any draw ran.
      const before = new Map<Element, Map<string, string | null>>();
      for (const change of attributeChanges) {
        const el = change.target as Element;
        const attrs = before.get(el) ?? new Map<string, string | null>();
        if (change.attributeName !== null && !attrs.has(change.attributeName)) {
          attrs.set(change.attributeName, change.oldValue);
        }
        before.set(el, attrs);
      }
      for (const [el, attrs] of before) {
        for (const [name, value] of attrs) {
          if (value === null) {
            el.removeAttribute(name);
          } else {
            el.setAttribute(name, value);
          }
        }
      }
    };
  }
}

/** What a still page runs: each marked slide drawn at the end of its beat, then every animation ended. */
export function stillDrawScript(): string {
  return `(function () {
${stepMotionMs}
${drawFrame}
${drawAtEnd}
(${drawMarkedSlides})();
(${finishBeat})();
})();
`;
}
