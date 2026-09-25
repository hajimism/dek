// The ask powers on, the window arrives, and the command types itself; the cursor stays.
const RISE_MS = 520;
const STAGGER_MS = 380;
const TYPE_AT = 900;
const CHAR_MS = 48;
const COMMAND = 29;
const TOTAL_MS = TYPE_AT + COMMAND * CHAR_MS + 600;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const rises = [...slide.querySelectorAll<HTMLElement>("[data-rise]")];
    rises.forEach((el, i) => {
      const at = i < 2 ? i * STAGGER_MS : TOTAL_MS - RISE_MS;
      const p = ease((t - at) / RISE_MS);
      el.style.opacity = String(p);
      el.style.transform = `translateY(${(1 - p) * 0.6}em)`;
    });
    const type = slide.querySelector<HTMLElement>("[data-type]");
    if (type) {
      if (type.dataset.full === undefined) type.dataset.full = type.textContent ?? "";
      const full = type.dataset.full;
      type.textContent = full.slice(0, Math.max(0, Math.min(full.length, Math.floor((t - TYPE_AT) / CHAR_MS))));
    }
  },
} satisfies DekSlide;
