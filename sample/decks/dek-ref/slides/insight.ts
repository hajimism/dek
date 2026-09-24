// Drops the four layers onto the stack one after another.
const DROP_MS = 520;
const STAGGER_MS = 170;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const back = (x: number) => {
  const p = clamp(x) - 1;
  return 1 + 2.4 * p ** 3 + 1.4 * p ** 2;
};

export default {
  motion: { layers: DROP_MS + STAGGER_MS * 4 },
  draw(slide, { step, t }) {
    const active = step === "layers";
    for (const layer of slide.querySelectorAll<HTMLElement>("[data-layer]")) {
      const i = Number(layer.dataset.layer);
      const p = active ? back((t - i * STAGGER_MS) / DROP_MS) : 0;
      layer.style.opacity = String(clamp(p * 2));
      layer.style.transform = `translateY(${(1 - p) * -40}px) rotate(${(1 - p) * (i % 2 ? 4 : -4)}deg)`;
    }
  },
} satisfies DekSlide;
