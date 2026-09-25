// Bars grow to each section's estimate; the ribbon fills 12:00 in talk order; the total counts up.
const GROW_MS = 1400;
const SCALE_SECONDS = 70;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

export default {
  motion: { "1": GROW_MS },
  draw(slide, { t }) {
    const p = ease(t / GROW_MS);
    for (const bar of slide.querySelectorAll<HTMLElement>("[data-est]")) {
      bar.style.width = `${(Number(bar.dataset.est) / SCALE_SECONDS) * 100 * p}%`;
    }
    for (const tick of slide.querySelectorAll<HTMLElement>("[data-budget]")) {
      tick.style.left = `${(Number(tick.dataset.budget) / SCALE_SECONDS) * 100}%`;
    }
    const ribbon = slide.querySelector<HTMLElement>("[data-ribbon]");
    const span = Number(ribbon?.dataset.ribbon ?? 720);
    const total = Number(slide.querySelector<HTMLElement>("[data-total]")?.dataset.total ?? 0);
    const reach = total * p;
    for (const seg of slide.querySelectorAll<HTMLElement>("[data-start]")) {
      const start = Number(seg.dataset.start);
      const len = Number(seg.dataset.len);
      seg.style.left = `${(start / span) * 100}%`;
      seg.style.width = `${(Math.max(0, Math.min(len, reach - start)) / span) * 100}%`;
    }
    const readout = slide.querySelector<HTMLElement>("[data-total]");
    if (readout) readout.textContent = clock(Math.floor(reach));
  },
} satisfies DekSlide;
