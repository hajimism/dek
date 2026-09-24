// Bars grow to each section's estimate as the slide enters; budget ticks stay put.
const GROW_MS = 1200;
const SCALE_SECONDS = 80;

export default {
  motion: { "1": GROW_MS },
  draw(slide, { t }) {
    const p = Math.min(1, t / GROW_MS);
    const eased = 1 - (1 - p) ** 3;
    for (const bar of slide.querySelectorAll<HTMLElement>("[data-est]")) {
      const est = Number(bar.dataset.est);
      bar.style.width = `${(est / SCALE_SECONDS) * 100 * eased}%`;
    }
    for (const tick of slide.querySelectorAll<HTMLElement>("[data-budget]")) {
      tick.style.left = `${(Number(tick.dataset.budget) / SCALE_SECONDS) * 100}%`;
    }
  },
} satisfies DekSlide;
