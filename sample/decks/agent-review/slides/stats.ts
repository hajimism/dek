const COUNT_MS = 800;
export default {
  motion: { "1": COUNT_MS },
  draw(slide, { t }) {
    const p = Math.min(1, t / COUNT_MS);
    for (const el of slide.querySelectorAll<HTMLElement>("[data-count]")) {
      el.textContent = String(Math.round(Number(el.dataset.count) * p));
    }
  },
} satisfies DekSlide;
