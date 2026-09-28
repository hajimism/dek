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
 * Draws every slide `markBeat` marked, at the end of its beat. A draw that throws leaves the slide
 * as it was before, so each throw is kept in `window.__dekDrawErrors` for whoever measures the page.
 */
function drawMarkedSlides(): void {
  const modules = window.__dekSlides ?? {};
  const errors: NonNullable<Window["__dekDrawErrors"]> = [];
  window.__dekDrawErrors = errors;
  for (const el of document.querySelectorAll<HTMLElement>(".slide[data-slug]")) {
    // markBeat writes the step key, so this page never derives one itself.
    const step = el.getAttribute("data-dek-step");
    if (step === null) {
      continue;
    }
    const slug = el.getAttribute("data-slug") ?? "";
    const failed = drawAtEnd(
      modules[slug],
      el,
      Number(el.getAttribute("data-dek-beat") || 0),
      step,
    );
    if (failed) {
      const { error } = failed;
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      errors.push({ slug, step, t: failed.t, message });
    }
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
