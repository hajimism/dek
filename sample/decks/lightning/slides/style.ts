// The tokens power on one by one under the file that uses them.
const FIRST_MS = 500;
const EACH_MS = 180;
const FADE_MS = 360;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export default {
  motion: { "1": FIRST_MS + EACH_MS * 4 + FADE_MS },
  draw(slide, { t }) {
    slide.querySelectorAll<HTMLElement>("[data-token]").forEach((el, i) => {
      const p = clamp((t - FIRST_MS - i * EACH_MS) / FADE_MS);
      el.style.opacity = String(p);
      el.style.transform = `translateY(${(1 - p) * 0.8}em)`;
    });
  },
} satisfies DekSlide;
