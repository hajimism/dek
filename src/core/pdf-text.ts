/// <reference lib="dom" />
// What a PDF prints of a slide: a picture of the slide as the browser drew it, with its text laid
// over it, unseen, so a reader can still select, search, and copy it. Chromium writes a blurred
// box-shadow and `background-clip: text` into a PDF as soft masks, which Apple's viewers (Preview,
// Quick Look, Safari, iOS) draw as flat boxes; a picture looks the same in every viewer.

/** The slides of the print document, one PDF page each. */
export const PDF_SLIDES = "#deck > .slide";

/**
 * Leaves each slide's text where it was laid out and paints nothing else: no color, no
 * background, no border, no shadow, no picture. Only paint changes, never layout, so the text lies
 * where the picture under it shows it. In a layer, so that these `!important` declarations win
 * over any the theme or a slide writes, whatever their selectors weigh.
 */
export const PDF_TEXT_CSS = `@layer dek-pdf-text {
  #deck > .slide,
  #deck > .slide::before,
  #deck > .slide::after,
  #deck > .slide *,
  #deck > .slide *::before,
  #deck > .slide *::after,
  #deck > .slide *::marker,
  #deck > .slide *::first-letter,
  #deck > .slide *::first-line {
    color: transparent !important;
    -webkit-text-fill-color: transparent !important;
    -webkit-text-stroke-color: transparent !important;
    text-decoration-color: transparent !important;
    text-emphasis-color: transparent !important;
    text-shadow: none !important;
    border-color: transparent !important;
    border-image: none !important;
    outline-color: transparent !important;
    column-rule-color: transparent !important;
    box-shadow: none !important;
    transition: none !important;
  }
  #deck > .slide::before,
  #deck > .slide::after,
  #deck > .slide *,
  #deck > .slide *::before,
  #deck > .slide *::after,
  #deck > .slide *::first-letter,
  #deck > .slide *::first-line {
    background: none !important;
  }
  #deck > .slide {
    opacity: 1 !important;
    mix-blend-mode: normal !important;
  }
  #deck > .slide :is(img, video, canvas, iframe, embed, object, input, select, textarea, button, progress, meter),
  #deck > .slide svg image {
    opacity: 0 !important;
  }
  #deck > .slide svg * {
    fill: transparent !important;
    stroke: transparent !important;
  }
}`;

/**
 * Where each slide lies on the whole page, for its picture to be shot.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function slideBoxesInPage(
  selector: string,
): { x: number; y: number; width: number; height: number }[] {
  return [...document.querySelectorAll(selector)].map((slide) => {
    const box = slide.getBoundingClientRect();
    return {
      x: box.left + window.scrollX,
      y: box.top + window.scrollY,
      width: box.width,
      height: box.height,
    };
  });
}

/**
 * Takes every paint but the text away from the page's slides, once their pictures are shot. A
 * filter or a backdrop filter would draw over the picture, or turn the text under it into pixels,
 * so each goes; `will-change` keeps the box it made for its positioned descendants, so they stay
 * where they were laid out.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function keepOnlyTextInPage({ selector, css }: { selector: string; css: string }): void {
  for (const slide of document.querySelectorAll(selector)) {
    for (const el of [slide, ...slide.querySelectorAll("*")]) {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) {
        continue;
      }
      const style = getComputedStyle(el);
      const effects = (["filter", "backdrop-filter"] as const).filter(
        (property) => style.getPropertyValue(property) !== "none",
      );
      if (effects.length === 0) {
        continue;
      }
      const hints = style.willChange === "auto" ? [] : [style.willChange];
      for (const property of effects) {
        el.style.setProperty(property, "none", "important");
      }
      el.style.setProperty("will-change", [...hints, ...effects].join(", "), "important");
    }
  }
  const sheet = document.createElement("style");
  sheet.textContent = css;
  document.head.append(sheet);
}

/**
 * Sets a slide's picture, a PNG in base64, under its text: the `index`th of the page's slides.
 * One slide a call, so no message to the page carries more than one picture.
 *
 * Runs in the page, shipped by `page.evaluate`, so it references nothing outside itself.
 */
export function setSlidePictureInPage({
  selector,
  index,
  picture,
}: {
  selector: string;
  index: number;
  picture: string;
}): void {
  const slide = document.querySelectorAll(selector)[index];
  if (slide instanceof HTMLElement) {
    slide.style.setProperty(
      "background",
      `url("data:image/png;base64,${picture}") 0 0 / 100% 100% no-repeat border-box`,
      "important",
    );
  }
}
