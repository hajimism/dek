// Each line powers on in turn; then a red line strikes through "スライド".
const RISE_MS = 520;
const STAGGER_MS = 420;
const STRIKE_AT = 1300;
const STRIKE_MS = 420;
const TOTAL_MS = STRIKE_AT + STRIKE_MS + STAGGER_MS + RISE_MS;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const rows = slide.querySelectorAll<HTMLElement>("[data-rise]");
    rows.forEach((row, i) => {
      const at = i < 2 ? i * STAGGER_MS : STRIKE_AT + STRIKE_MS;
      const p = ease((t - at) / RISE_MS);
      row.style.opacity = String(p);
      row.style.transform = `translateY(${(1 - p) * 0.25}em)`;
    });
    const strike = slide.querySelector<HTMLElement>("[data-strike]");
    if (strike) strike.style.transform = `scaleX(${ease((t - STRIKE_AT) / STRIKE_MS)})`;
  },
} satisfies DekSlide;
