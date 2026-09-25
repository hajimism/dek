/// <reference lib="dom" />

/**
 * A copy of a slide to look at, never to use: a rail thumbnail or the presenter's next preview.
 * It shows as the stage would (theme CSS reveals steps only on `.is-current`), takes no ids or
 * morph names from the real slide, loads no media, and is inert and hidden from assistive tech,
 * so focus and the accessibility tree meet each slide once, on the stage.
 */
export function visualClone(source: HTMLElement): HTMLElement | undefined {
  const clone = source.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return undefined;
  }
  clone.classList.add("is-current");
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>("[id], [data-morph]")]) {
    el.removeAttribute("id");
    el.style.removeProperty("view-transition-name");
  }
  for (const el of clone.querySelectorAll("video, audio, iframe, object, embed")) {
    el.removeAttribute("src");
    el.removeAttribute("srcdoc");
    el.replaceChildren();
  }
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  return clone;
}
