// Each file's bar grows to its line count, on one scale for the whole deck.
const GROW_MS = 1000;
const SCALE_LINES = 180;

export default {
  motion: { "1": GROW_MS },
  draw(slide, { t }) {
    const p = 1 - (1 - Math.min(1, t / GROW_MS)) ** 3;
    for (const bar of slide.querySelectorAll<HTMLElement>("[data-lines]")) {
      const n = Number(bar.dataset.lines);
      bar.style.width = `${Math.min(1, n / SCALE_LINES) * 100 * p}%`;
    }
  },
} satisfies DekSlide;
