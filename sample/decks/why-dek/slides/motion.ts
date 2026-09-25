// One function of t draws every frame on this slide: three fixed ones and the live one.
const MS = 1200;
const BARS = [0.5, 0.8, 0.6, 1, 0.7];
const frames = (slide: HTMLElement) => slide.querySelectorAll<HTMLElement>("[data-t]");

function paint(frame: Element, t: number) {
  // t だけから棒の高さを決める
  const p = Math.min(1, Math.max(0, t / MS));
  const bars = frame.querySelectorAll<SVGRectElement>("[data-bar]");
  bars.forEach((bar, i) => {
    const local = Math.min(1, Math.max(0, p * 2 - i * 0.25));
    const h = (BARS[i] ?? 0) * 110 * (1 - (1 - local) ** 3);
    bar.setAttribute("y", String(130 - h));
    bar.setAttribute("height", String(h));
  });
  const readout = frame.querySelector("[data-readout]");
  if (readout) readout.textContent = `t = ${Math.round(p * MS)}`;
}

export default {
  motion: { "1": MS },
  draw(slide, { t }) {
    for (const frame of frames(slide)) {
      paint(frame, Number(frame.dataset.t));
    }
    const live = slide.querySelector("[data-live]");
    if (live) paint(live, t);
  },
} satisfies DekSlide;
