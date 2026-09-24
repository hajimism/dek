// Lights the four moves in turn, clockwise from 読む, as the loop beat plays.
const TURN_MS = 380;
const POP_MS = 460;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const back = (x: number) => {
  const p = clamp(x) - 1;
  return 1 + 2.4 * p ** 3 + 1.4 * p ** 2;
};

export default {
  motion: { loop: TURN_MS * 3 + POP_MS },
  draw(slide, { step, index, t }) {
    const at = step === "loop" ? t : index > 1 ? Number.POSITIVE_INFINITY : -1;
    for (const turn of slide.querySelectorAll<HTMLElement>("[data-turn]")) {
      const i = Number(turn.dataset.turn);
      const p = at < 0 ? 0 : back((at - i * TURN_MS) / POP_MS);
      turn.style.opacity = String(clamp(p * 2));
      turn.style.transform = `scale(${0.7 + 0.3 * p})`;
    }
  },
} satisfies DekSlide;
