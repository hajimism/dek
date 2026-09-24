// Deals the three decks into a fan, pops the words in, then types the command.
const DEAL_MS = 1100;
const POP_MS = 700;
const STAGGER_MS = 120;
const TYPE_MS = 900;
const TOTAL_MS = DEAL_MS + TYPE_MS;

const FAN = [
  { x: -64, y: -108, r: -8 },
  { x: -36, y: -56, r: 5 },
  { x: -52, y: -2, r: -3 },
];

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const back = (x: number) => {
  const p = clamp(x) - 1;
  return 1 + 2.4 * p ** 3 + 1.4 * p ** 2;
};

export default {
  motion: { "1": TOTAL_MS },
  draw(slide, { t }) {
    for (const deck of slide.querySelectorAll<HTMLElement>("[data-fan]")) {
      const i = Number(deck.dataset.fan);
      const f = FAN[i] ?? FAN[0];
      const p = back((t - i * STAGGER_MS * 1.5) / (DEAL_MS * 0.7));
      const x = -50 + (f.x + 50) * p;
      const y = -50 + (f.y + 50) * p + (1 - clamp(p)) * 40;
      deck.style.transform = `translate(${x}%, ${y}%) rotate(${f.r * p}deg)`;
      deck.style.opacity = String(clamp(p * 3));
    }
    for (const el of slide.querySelectorAll<HTMLElement>("[data-pop]")) {
      const i = Number(el.dataset.pop);
      const p = back((t - 150 - i * STAGGER_MS) / POP_MS);
      el.style.opacity = String(clamp(p * 2));
      el.style.transform = `translateY(${(1 - p) * 24}px) scale(${0.94 + 0.06 * p})`;
    }
    const typed = slide.querySelector<HTMLElement>("[data-typed]");
    if (typed) {
      const full = typed.dataset.typed ?? "";
      const p = clamp((t - DEAL_MS) / TYPE_MS);
      typed.textContent = full.slice(0, Math.round(full.length * p));
    }
  },
} satisfies DekSlide;
