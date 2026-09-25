// Each section's bar draws in order at its place on the three-minute track,
// while the total counts up to 2:42. Widths come from each lane's data-s seconds.
const BUDGET_S = 180;
const START_MS = 250;
const DRAW_MS = 2400;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default {
  motion: { "1": START_MS + DRAW_MS },
  draw(slide, { t }) {
    const lanes = [...slide.querySelectorAll<HTMLElement>("[data-s]")];
    const total = lanes.reduce((sum, lane) => sum + Number(lane.dataset.s), 0);
    const now = clamp((t - START_MS) / DRAW_MS) * total;
    let start = 0;
    for (const lane of lanes) {
      const s = Number(lane.dataset.s);
      const seg = lane.querySelector<HTMLElement>("[data-seg]");
      if (seg) {
        seg.style.left = `${(start / BUDGET_S) * 100}%`;
        seg.style.width = `${(clamp((now - start) / s) * s * 100) / BUDGET_S}%`;
      }
      start += s;
    }
    const count = slide.querySelector<HTMLElement>("[data-count]");
    if (count) count.textContent = clock(now);
  },
} satisfies DekSlide;
