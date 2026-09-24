// Types the command, then prints the result one line at a time.
const TYPE_MS = 900;
const LINE_MS = 220;
const LINES = 4;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export default {
  motion: { fetch: TYPE_MS + LINE_MS * (LINES + 1) },
  draw(slide, { index, t }) {
    const typing = index === 0;
    const typed = slide.querySelector<HTMLElement>("[data-typed]");
    if (typed) {
      const full = typed.dataset.typed ?? "";
      const p = typing ? clamp(t / TYPE_MS) : 1;
      typed.textContent = full.slice(0, Math.round(full.length * p));
    }
    for (const line of slide.querySelectorAll<HTMLElement>("[data-line]")) {
      const i = Number(line.dataset.line);
      const shown = !typing || t >= TYPE_MS + LINE_MS * (i + 1);
      line.style.opacity = shown ? "1" : "0";
    }
  },
} satisfies DekSlide;
