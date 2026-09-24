// The ask rises line by line, then the command arrives under it.
const RISE_MS = 1000;
const STAGGER_MS = 220;
const TOTAL_MS = RISE_MS * 1.6 + STAGGER_MS;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 4;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    for (const line of slide.querySelectorAll<HTMLElement>("[data-rise]")) {
      const p = easeOut((t - Number(line.dataset.rise) * STAGGER_MS) / RISE_MS);
      line.style.transform = `translateY(${(1 - p) * 110}%)`;
    }
    const footing = slide.querySelector<HTMLElement>("[data-rise-in]");
    if (footing) {
      const p = easeOut((t - RISE_MS * 0.6 - STAGGER_MS) / RISE_MS);
      footing.style.opacity = String(p);
      footing.style.transform = `translateY(${(1 - p) * 20}px)`;
    }
  },
} satisfies DekSlide;
