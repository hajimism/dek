// One command, typed live, then the real output of `dek init` prints line by line.
// A terminal session drawn from t. In each [data-scene], [data-type] text is typed
// a character at a time, then each [data-out] line prints after its delay (ms in the
// attribute). A [data-caret] right after a command blinks only while it is typed.
// If the natural timing runs past the beat's motion, it is compressed to fit.
const CHAR_MS = 42;
const ENTER_MS = 320;
const OUT_MS = 70;

function plan(scene: HTMLElement): number {
  let clock = 0;
  for (const el of scene.querySelectorAll<HTMLElement>("[data-type], [data-out]")) {
    if (el.dataset.full === undefined && el.hasAttribute("data-type")) el.dataset.full = el.textContent ?? "";
    clock += el.hasAttribute("data-type") ? (el.dataset.full ?? "").length * CHAR_MS + ENTER_MS : Number(el.dataset.out || OUT_MS);
  }
  return clock;
}

function play(scene: HTMLElement, t: number, motion: number) {
  const natural = plan(scene);
  const k = natural > motion && motion > 0 ? motion / natural : 1;
  let clock = 0;
  for (const el of scene.querySelectorAll<HTMLElement>("[data-type], [data-out]")) {
    if (el.hasAttribute("data-type")) {
      const full = el.dataset.full ?? "";
      const n = Math.max(0, Math.min(full.length, Math.floor((t - clock) / (CHAR_MS * k))));
      el.textContent = full.slice(0, n);
      const end = clock + full.length * CHAR_MS * k;
      const caret = el.nextElementSibling as HTMLElement | null;
      if (caret?.hasAttribute("data-caret")) caret.style.display = t < end + ENTER_MS * k * 0.8 ? "" : "none";
      clock = end + ENTER_MS * k;
    } else {
      clock += Number(el.dataset.out || OUT_MS) * k;
      el.style.opacity = t >= clock ? "1" : "0";
    }
  }
}

function scenes(slide: HTMLElement, step: string, t: number, motion: Record<string, number>) {
  const order = Object.keys(motion);
  const now = order.indexOf(step);
  for (const scene of slide.querySelectorAll<HTMLElement>("[data-scene]")) {
    const at = order.indexOf(scene.dataset.scene ?? "");
    const m = motion[scene.dataset.scene ?? ""] ?? 0;
    play(scene, at < now ? m : at === now ? t : -1, m);
  }
}

const MOTION = { "1": 4200 };

export default {
  motion: MOTION,
  draw(slide, { step, t }) {
    scenes(slide, step, t, MOTION);
  },
} satisfies DekSlide;
