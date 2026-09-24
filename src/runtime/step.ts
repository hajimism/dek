import type { Position } from "../core/step.ts";

export type StepElement = {
  getAttribute(name: string): string | null;
  classList: { toggle(name: string, force?: boolean): void };
};

export type MorphElement = {
  getAttribute(name: string): string | null;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): string };
};

export function applyIsShown(elements: StepElement[], shown: Set<string>): void {
  for (const el of elements) {
    const step = el.getAttribute("data-step");
    el.classList.toggle("is-shown", step !== null && shown.has(step));
  }
}

export function advance(pos: Position, slideBeatCounts: number[]): Position | null {
  const count = slideBeatCounts[pos.slideIndex];
  if (count === undefined) {
    return null;
  }
  if (pos.beatIndex + 1 < count) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex + 1 };
  }
  const nextSlide = pos.slideIndex + 1;
  if (nextSlide >= slideBeatCounts.length) {
    return null;
  }
  return { slideIndex: nextSlide, beatIndex: 0 };
}

export function retreat(pos: Position, slideBeatCounts: number[]): Position | null {
  if (pos.beatIndex > 0) {
    return { slideIndex: pos.slideIndex, beatIndex: pos.beatIndex - 1 };
  }
  const prevSlide = pos.slideIndex - 1;
  if (prevSlide < 0) {
    return null;
  }
  const prevCount = slideBeatCounts[prevSlide] ?? 0;
  return { slideIndex: prevSlide, beatIndex: Math.max(prevCount - 1, 0) };
}

export type Move = "advance" | "retreat";

export function keyToMove(key: string): Move | null {
  switch (key) {
    case "ArrowRight":
    case " ":
    case "PageDown":
      return "advance";
    case "ArrowLeft":
    case "PageUp":
    case "Backspace":
      return "retreat";
    default:
      return null;
  }
}

export function applyMorphNames(elements: MorphElement[]): void {
  for (const el of elements) {
    const name = el.getAttribute("data-morph");
    if (name) {
      // The browser reads the CSS property; an attribute of the same name does nothing.
      el.style.setProperty("view-transition-name", name);
    }
  }
}

export function clearMorphNames(elements: MorphElement[]): void {
  for (const el of elements) {
    el.style.removeProperty("view-transition-name");
  }
}

export function shouldUseViewTransition(fromSlide: number, toSlide: number): boolean {
  return fromSlide !== toSlide;
}
