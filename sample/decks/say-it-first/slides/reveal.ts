// "deck" holds, the c tumbles out, and the k slides left to close the gap: "dek".
const HOLD_MS = 500;
const DROP_MS = 900;
const CLOSE_MS = 700;
const TOTAL_MS = HOLD_MS + DROP_MS + CLOSE_MS + 300;
// Advance of the c in the wordmark, in em, so the gap closes without measuring layout.
const C_WIDTH_EM = 0.515;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeIn = (x: number) => clamp(x) ** 2;
const easeInOut = (x: number) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
};
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 3;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const drop = slide.querySelector<HTMLElement>("[data-drop]");
    const close = slide.querySelector<HTMLElement>("[data-close]");
    if (!drop || !close) {
      return;
    }
    const fall = easeIn((t - HOLD_MS) / DROP_MS);
    drop.style.transform = `translate(${fall * 0.06}em, ${fall * 0.38}em) rotate(${fall * 28}deg) scale(${1 - fall * 0.6})`;
        const shut = easeInOut((t - HOLD_MS - DROP_MS * 0.55) / CLOSE_MS);
    close.style.transform = `translateX(${-C_WIDTH_EM * shut}em)`;
    const caption = slide.querySelector<HTMLElement>("[data-rise-in]");
    if (caption) {
      const p = easeOut((t - HOLD_MS - DROP_MS) / CLOSE_MS);
      caption.style.opacity = String(p);
      caption.style.transform = `translateX(${(1 - p) * 30}px)`;
    }
  },
} satisfies DekSlide;
