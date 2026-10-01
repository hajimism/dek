// The dekc show panel slides in as its beat begins, then the used-rules bar fills.
const SHOW_MS = 600;
const FILL_MS = 900;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { "small-show": SHOW_MS + FILL_MS },
  draw(slide, { t }) {
    const panel = slide.querySelector<HTMLElement>("[data-show]");
    const p = ease(t / SHOW_MS);
    if (panel) {
      panel.style.opacity = String(p);
      panel.style.transform = `translateX(${(1 - p) * 24}px)`;
    }
    const fill = slide.querySelector<HTMLElement>("[data-used]");
    if (fill) {
      const pct = Number(fill.dataset.used ?? "0");
      fill.style.width = `${pct * ease((t - SHOW_MS) / FILL_MS)}%`;
    }
  },
} satisfies DekSlide;
