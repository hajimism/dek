// Blind: the dot stops at Render and the loop stays open. Measure: it runs the rest of the lap home.
const LAP_MS = 2400;
// Ring radius over the orbit box, in percent, so the dot is placed without measuring layout.
const RADIUS = (150 / 400) * 100;
const RENDERED = 0.25;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};

export default {
  motion: { measure: LAP_MS },
  draw(slide, { index, t }) {
    const lap = index === 0 ? RENDERED : RENDERED + (1 - RENDERED) * easeInOut(t / LAP_MS);
    const dot = slide.querySelector<HTMLElement>("[data-dot]");
    if (dot) {
      const angle = lap * 2 * Math.PI - Math.PI / 2;
      dot.style.left = `${50 + Math.cos(angle) * RADIUS}%`;
      dot.style.top = `${50 + Math.sin(angle) * RADIUS}%`;
    }
    const run = slide.querySelector<SVGCircleElement>("[data-run]");
    if (run) {
      run.style.strokeDasharray = `${lap * 100} 100`;
    }
    for (const node of slide.querySelectorAll<HTMLElement>("[data-node]")) {
      const at = Number(node.dataset.node) / 4;
      node.classList.toggle("is-lit", lap >= at - 0.001 && !(index === 0 && at > RENDERED));
    }
  },
} satisfies DekSlide;
