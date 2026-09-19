import type { Size } from "../core/size.ts";

export function deckScale(options: {
  viewport: Size;
  logical: Size;
  reservedRight?: number;
}): number {
  const availableWidth = options.viewport.width - (options.reservedRight ?? 0);
  const { width, height } = options.logical;
  if (width <= 0 || height <= 0 || availableWidth <= 0 || options.viewport.height <= 0) {
    return 0;
  }
  return Math.min(availableWidth / width, options.viewport.height / height);
}

export function deckFitTransform(viewport: Size, logical: Size): string {
  const scale = deckScale({ viewport, logical });
  const x = (viewport.width - logical.width * scale) / 2;
  const y = (viewport.height - logical.height * scale) / 2;
  return `translate(${x}px, ${y}px) scale(${scale})`;
}
