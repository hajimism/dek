// Each beat counts its number up from zero; the last one also runs the bar past the budget.
const COUNT_MS = 1100;
const BAR_MS = 1600;
const LIMIT = 2 / 3;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { slides: COUNT_MS, budget: COUNT_MS, actual: BAR_MS },
  draw(slide, { index, t }) {
    for (const el of slide.querySelectorAll<HTMLElement>("[data-count]")) {
      const beat = Number(el.dataset.beat);
      const p = beat < index ? 1 : beat === index ? easeOut(t / COUNT_MS) : 0;
      el.textContent = String(Math.round(Number(el.dataset.count) * p));
    }
    const run = index === 2 ? clamp(t / BAR_MS) : index > 2 ? 1 : 0;
    const fill = slide.querySelector<HTMLElement>("[data-fill]");
    const over = slide.querySelector<HTMLElement>("[data-over]");
    if (fill) {
      fill.style.width = `${Math.min(run / LIMIT, 1) * LIMIT * 100}%`;
    }
    if (over) {
      const past = clamp((run - LIMIT) / (1 - LIMIT));
      over.style.width = `${easeOut(past) * (1 - LIMIT) * 100}%`;
    }
  },
} satisfies DekSlide;
