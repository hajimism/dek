// The prompt types `dek`, then the title types itself; the lede powers on after it.
const CHAR_MS = 70;
const START_MS = 500;
const RISE_MS = 600;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

function typed(slide: HTMLElement, t: number): number {
  let clock = START_MS;
  for (const el of slide.querySelectorAll<HTMLElement>("[data-type]")) {
    if (el.dataset.full === undefined) el.dataset.full = el.textContent ?? "";
    const full = el.dataset.full;
    const n = Math.max(0, Math.min(full.length, Math.floor((t - clock) / CHAR_MS)));
    el.textContent = full.slice(0, n);
    clock += full.length * CHAR_MS + 180;
  }
  return clock;
}

const TOTAL_MS = START_MS + 15 * CHAR_MS + 3 * 180 + RISE_MS * 2;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const done = typed(slide, t);
    slide.querySelectorAll<HTMLElement>("[data-rise]").forEach((el, i) => {
      const p = clamp((t - done - i * 200) / RISE_MS);
      el.style.opacity = String(p);
    });
  },
} satisfies DekSlide;
