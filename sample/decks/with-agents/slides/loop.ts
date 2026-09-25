// One lap of the ring across three beats: the dot rests on 書く, runs to 確かめる, then through 直す
// and home, where the hub turns from `dek check` to `ok: true`.
const CHECK_MS = 1400;
const FIX_MS = 2400;
const STOPS = [0, 1 / 3, 2 / 3];
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};

export default {
  motion: { "loop-check": CHECK_MS, "loop-fix": FIX_MS },
  draw(slide, { index, t }) {
    let lap = 0;
    if (index === 1) lap = STOPS[1] * easeInOut(t / CHECK_MS);
    if (index >= 2) lap = STOPS[1] + (1 - STOPS[1]) * easeInOut(t / FIX_MS);

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
    const home = index >= 2 && lap >= 0.999;
    for (const state of slide.querySelectorAll<HTMLElement>("[data-hub]")) {
      state.style.visibility = (state.dataset.hub === "1") === home ? "visible" : "hidden";
    }
  },
} satisfies DekSlide;
