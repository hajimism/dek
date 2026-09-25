// The legend reads top to bottom; as each entry powers on, the lines it names light up.
const STEP_MS = 900;
const RISE_MS = 450;
const MARKS = ["h2", "h3", "p"];
const TOTAL_MS = 400 + STEP_MS * 3;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const active = Math.min(2, Math.floor((t - 400) / STEP_MS));
    for (const el of slide.querySelectorAll<HTMLElement>("[data-legend]")) {
      const i = Number(el.dataset.legend);
      const p = clamp((t - 400 - i * STEP_MS) / RISE_MS);
      el.style.opacity = String(0.15 + 0.85 * p);
    }
    const done = t >= TOTAL_MS;
    for (const line of slide.querySelectorAll<HTMLElement>("[data-mark]")) {
      const lit = !done && active >= 0 && line.dataset.mark === MARKS[active];
      line.toggleAttribute("data-lit", lit);
    }
  },
} satisfies DekSlide;
