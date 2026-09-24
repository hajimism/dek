// Every figure counts up as the page lands; each starts a little after the one to its left.
const COUNT_MS = 1200;
const STAGGER_MS = 150;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 4;

export default {
  motion: { "1": COUNT_MS + STAGGER_MS * 3 },
  draw(slide, { t }) {
    const figures = [...slide.querySelectorAll<HTMLElement>("[data-to]")];
    for (const [i, el] of figures.entries()) {
      const p = easeOut((t - i * STAGGER_MS) / COUNT_MS);
      el.textContent = String(Math.round(Number(el.dataset.to) * p));
    }
  },
} satisfies DekSlide;
