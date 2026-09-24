// Deals the three promises onto the table one after another.
const POP_MS = 520;
const STAGGER_MS = 160;
const TILTS = [-3, 2, -2];

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const back = (x: number) => {
  const p = clamp(x) - 1;
  return 1 + 2.4 * p ** 3 + 1.4 * p ** 2;
};

export default {
  motion: { "1": POP_MS + STAGGER_MS * 2 },
  draw(slide, { t }) {
    for (const vow of slide.querySelectorAll<HTMLElement>("[data-vow]")) {
      const i = Number(vow.dataset.vow);
      const p = back((t - i * STAGGER_MS) / POP_MS);
      vow.style.opacity = String(clamp(p * 2));
      vow.style.transform = `translateY(${(1 - p) * 40}px) rotate(${(1 - p) * (TILTS[i] ?? 0)}deg)`;
    }
  },
} satisfies DekSlide;
