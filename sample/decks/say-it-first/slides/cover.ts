// Types the heading as it appears in script.md, then lifts the title out from under its mask.
const TYPE_MS = 900;
const RISE_MS = 900;
const STAGGER_MS = 140;
const TOTAL_MS = TYPE_MS + RISE_MS + STAGGER_MS * 2;

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - (1 - clamp(x)) ** 4;

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    const typed = slide.querySelector<HTMLElement>("[data-typed]");
    if (typed) {
      const full = typed.dataset.typed ?? "";
      typed.textContent = full.slice(0, Math.round(full.length * clamp(t / TYPE_MS)));
    }
    for (const line of slide.querySelectorAll<HTMLElement>("[data-rise]")) {
      const start = TYPE_MS * 0.6 + Number(line.dataset.rise) * STAGGER_MS;
      const p = easeOut((t - start) / RISE_MS);
      line.style.transform = `translateY(${(1 - p) * 105}%)`;
    }
    const dot = slide.querySelector<HTMLElement>("[data-dot]");
    if (dot) {
      const p = easeOut((t - TYPE_MS - STAGGER_MS * 2) / (RISE_MS * 0.6));
      dot.style.display = "inline-block";
      dot.style.transform = `scale(${0.2 + p * 0.8})`;
      dot.style.opacity = String(p);
    }
    const foot = slide.querySelector<HTMLElement>("[data-rise-in]");
    if (foot) {
      const p = easeOut((t - TYPE_MS - STAGGER_MS) / RISE_MS);
      foot.style.opacity = String(p);
      foot.style.transform = `translateY(${(1 - p) * 16}px)`;
    }
  },
} satisfies DekSlide;
