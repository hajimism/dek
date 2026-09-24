// Deals the three question cards in, each landing with a small tilt.
const POP_MS = 520;
const STAGGER_MS = 150;
const TILTS = [-2, 1.5, -1];

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const back = (x: number) => {
  const p = clamp(x) - 1;
  return 1 + 2.4 * p ** 3 + 1.4 * p ** 2;
};

export default {
  motion: { "1": 300 + POP_MS + STAGGER_MS * 2 },
  draw(slide, { t }) {
    for (const card of slide.querySelectorAll<HTMLElement>("[data-q]")) {
      const i = Number(card.dataset.q);
      const p = back((t - 300 - i * STAGGER_MS) / POP_MS);
      card.style.opacity = String(clamp(p * 2));
      card.style.transform = `translateY(${(1 - p) * 60}px) rotate(${TILTS[i] ?? 0}deg)`;
    }
  },
} satisfies DekSlide;
