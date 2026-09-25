// The eleven skeletons land one after another, then the ls.html skeleton opens beside them.
const FIRST_MS = 300;
const EACH_MS = 110;
const FADE_MS = 240;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export default {
  motion: { "1": FIRST_MS + EACH_MS * 14 + FADE_MS },
  draw(slide, { t }) {
    slide.querySelectorAll<HTMLElement>("[data-file]").forEach((el, i) => {
      const p = clamp((t - FIRST_MS - i * EACH_MS) / FADE_MS);
      el.style.opacity = String(p);
      el.style.transform = `translateX(${(1 - p) * -0.6}em)`;
    });
  },
} satisfies DekSlide;
