// "40 行" counts up as the slide enters; every later beat shows the final number.
const COUNT_MS = 900;

export default {
  motion: { "forty-lines": COUNT_MS },
  draw(slide, { index, t }) {
    const p = index === 0 ? t / COUNT_MS : 1;
    const eased = 1 - (1 - p) ** 3;
    for (const el of slide.querySelectorAll<HTMLElement>("[data-count]")) {
      el.textContent = String(Math.round(Number(el.dataset.count) * eased));
    }
  },
} satisfies DekSlide;
