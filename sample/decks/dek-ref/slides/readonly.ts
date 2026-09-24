// Grows each section's bar to its estimate when dek ls answers; budget ticks stay put.
const GROW_MS = 1100;
const STAGGER_MS = 35;
const SCALE_SECONDS = 80;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { ls: GROW_MS + STAGGER_MS * 14 },
  draw(slide, { index, t }) {
    const bars = slide.querySelectorAll<HTMLElement>("[data-est]");
    bars.forEach((bar, i) => {
      const p = index > 1 ? 1 : index === 1 ? easeOut((t - i * STAGGER_MS) / GROW_MS) : 0;
      bar.style.width = `${(Number(bar.dataset.est) / SCALE_SECONDS) * 100 * p}%`;
    });
    for (const tick of slide.querySelectorAll<HTMLElement>("[data-budget]")) {
      tick.style.left = `${(Number(tick.dataset.budget) / SCALE_SECONDS) * 100}%`;
    }
  },
} satisfies DekSlide;
