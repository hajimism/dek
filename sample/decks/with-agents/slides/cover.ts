// The agent's reply types itself as the cover arrives, then its lint call appears underneath.
const TYPE_MS = 1800;
const TOOL_AT = 2000;
const TOTAL = 2600;

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export default {
  motion: { "1": TOTAL },
  draw(slide, { t }) {
    const reply = slide.querySelector<HTMLElement>("[data-type]");
    if (reply) {
      const full = reply.dataset.text ?? "";
      const n = Math.round(full.length * clamp(t / TYPE_MS));
      reply.textContent = n >= full.length ? full : `${full.slice(0, n)}▍`;
    }
    const tool = slide.querySelector<HTMLElement>("[data-tool]");
    if (tool) {
      tool.style.opacity = String(clamp((t - TOOL_AT) / (TOTAL - TOOL_AT)));
    }
  },
} satisfies DekSlide;
