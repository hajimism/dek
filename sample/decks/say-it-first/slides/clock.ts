// The arcs draw round the dial in talk order while the readout counts up to the estimate.
const SWEEP_MS = 1800;
const GAP = 0.9;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};

export default {
  motion: { "1": SWEEP_MS },
  draw(slide, { t }) {
    const readout = slide.querySelector<HTMLElement>("[data-total]");
    const total = Number(readout?.dataset.total ?? 0);
    const reach = total * easeInOut(t / SWEEP_MS);
    for (const seg of slide.querySelectorAll<SVGCircleElement>("[data-est]")) {
      const start = Number(seg.dataset.start);
      const est = Number(seg.dataset.est);
      const lap = Number(seg.getAttribute("pathLength"));
      const drawn = Math.max(0, Math.min(est - GAP, reach - start));
      seg.style.strokeDasharray = `${drawn} ${lap}`;
      seg.style.strokeDashoffset = String(-start);
    }
    if (readout) {
      const s = Math.round(reach);
      readout.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    }
  },
} satisfies DekSlide;
