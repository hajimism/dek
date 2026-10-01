// One lap of the ring across three beats: the dot rests on 書く, runs to 確かめる, then through 直す
// and home, where the hub turns from `dekc check` to `ok: true`.
const STOPS = [0, 1 / 3, 2 / 3];
// Each beat runs the dot one leg of the lap, keyed by beat id.
const LEGS: Record<string, { from: number; to: number; ms: number }> = {
  "loop-check": { from: 0, to: STOPS[1], ms: 1400 },
  "loop-fix": { from: STOPS[1], to: 1, ms: 2400 },
};
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};

export default {
  motion: Object.fromEntries(Object.entries(LEGS).map(([step, leg]) => [step, leg.ms])),
  draw(slide, { step, t }) {
    const leg = LEGS[step];
    const lap = leg ? leg.from + (leg.to - leg.from) * easeInOut(t / leg.ms) : 0;

    const dot = slide.querySelector<HTMLElement>("[data-dot]");
    if (dot) {
      const angle = lap * 2 * Math.PI - Math.PI / 2;
      const r = (118 / 300) * 100;
      dot.style.left = `${50 + Math.cos(angle) * r}%`;
      dot.style.top = `${50 + Math.sin(angle) * r}%`;
    }
    const run = slide.querySelector<SVGCircleElement>("[data-run]");
    if (run) run.style.strokeDasharray = `${lap * 100} 100`;

    for (const node of slide.querySelectorAll<HTMLElement>("[data-node]")) {
      const at = STOPS[Number(node.dataset.node)] ?? 0;
      node.classList.toggle("is-lit", lap >= at - 0.001);
    }
    const home = lap >= 0.999;
    for (const state of slide.querySelectorAll<HTMLElement>("[data-hub]")) {
      state.style.visibility = (state.dataset.hub === "1") === home ? "visible" : "hidden";
    }
  },
} satisfies DekcSlide;
