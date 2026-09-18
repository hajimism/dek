import type { Size } from "../core/size.ts";

export const PRESENTER_RESERVED_RIGHT = 28 * 16;

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
  return Math.min(1, availableWidth / width, options.viewport.height / height);
}
