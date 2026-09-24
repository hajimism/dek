// Columns rise to each slide's line count and the totals count up as the slide enters.
const RISE_MS = 1100;

export default {
  motion: { "1": RISE_MS },
  draw(slide, { t }) {
    const p = Math.min(1, t / RISE_MS);
    const eased = 1 - (1 - p) ** 3;
    const chart = slide.querySelector<HTMLElement>("[data-max]");
    const max = Number(chart?.dataset.max ?? 1);
    for (const seg of slide.querySelectorAll<HTMLElement>("[data-lines]")) {
      seg.style.height = `${(Number(seg.dataset.lines) / max) * 100 * eased}%`;
    }
    for (const num of slide.querySelectorAll<HTMLElement>("[data-count]")) {
      const value = Math.round(Number(num.dataset.count) * eased);
      num.textContent = value.toLocaleString("en-US");
    }
  },
} satisfies DekSlide;
