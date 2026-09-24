/**
 * Draws slide scripts' frames. The player calls these directly; pages without
 * the player (shots, lint --visual, PDF) embed the same functions as source
 * via `stillDrawScript`, so they reference nothing outside this file and use
 * only the global `DekSlide` types.
 */

/** A beat's motion in ms, keyed like `data-step`; 0 when it has none or it is not positive. */
export function stepMotionMs(module: DekSlide | undefined, step: string): number {
  const ms = module?.motion?.[step];
  return typeof ms === "number" && ms > 0 ? ms : 0;
}

/** The one place a slide's `draw` runs: a throw is reported, never passed to the player. */
export function drawFrame(
  module: DekSlide | undefined,
  slide: HTMLElement,
  frame: DekMotionFrame,
): void {
  if (!module || typeof module.draw !== "function") {
    return;
  }
  try {
    module.draw(slide, frame);
  } catch (error) {
    console.error(error);
  }
}

/** Draws a beat as it ends, for pages that show a still: thumbnails, previews, shots, PDF. */
export function drawAtEnd(
  module: DekSlide | undefined,
  slide: HTMLElement,
  index: number,
  step: string,
): void {
  drawFrame(module, slide, { index, step, t: stepMotionMs(module, step) });
}

/** Draws every slide `markBeat` marked, at the end of its beat. */
function drawMarkedSlides(): void {
  const modules = window.__dekSlides ?? {};
  for (const el of document.querySelectorAll<HTMLElement>(".slide[data-slug]")) {
    // markBeat writes the step key, so this page never derives one itself.
    const step = el.getAttribute("data-dek-step");
    if (step === null) {
      continue;
    }
    const module = modules[el.getAttribute("data-slug") ?? ""];
    drawAtEnd(module, el, Number(el.getAttribute("data-dek-beat") || 0), step);
  }
}

export function stillDrawScript(): string {
  return `(function () {
${stepMotionMs}
${drawFrame}
${drawAtEnd}
(${drawMarkedSlides})();
})();
`;
}
