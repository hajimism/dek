// Where annotate mode's popup goes: beside what was picked, never over it, inside the window.

type Rect = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };

/** How far the popup keeps from what was picked and from the window's edges. */
const GAP = 8;

/**
 * The popup's top left corner for a note on `picked`, the box around every element picked:
 * under it, else above it, else to its right, else to its left, on the first side it fits on
 * whole. Covering what the note is about would hide what the human is pointing at. When no side
 * fits, it goes under, held inside the window.
 */
export function placePopup(
  picked: Rect,
  size: Size,
  viewport: Size,
): { left: number; top: number } {
  const clampLeft = (left: number): number =>
    Math.max(GAP, Math.min(left, viewport.width - size.width - GAP));
  const clampTop = (top: number): number =>
    Math.max(GAP, Math.min(top, viewport.height - size.height - GAP));
  const fitsTop = (top: number): boolean =>
    top >= GAP && top + size.height <= viewport.height - GAP;
  const fitsLeft = (left: number): boolean =>
    left >= GAP && left + size.width <= viewport.width - GAP;

  const below = picked.bottom + GAP;
  if (fitsTop(below)) {
    return { left: clampLeft(picked.left), top: below };
  }
  const above = picked.top - GAP - size.height;
  if (fitsTop(above)) {
    return { left: clampLeft(picked.left), top: above };
  }
  const right = picked.right + GAP;
  if (fitsLeft(right)) {
    return { left: right, top: clampTop(picked.top) };
  }
  const left = picked.left - GAP - size.width;
  if (fitsLeft(left)) {
    return { left, top: clampTop(picked.top) };
  }
  return { left: clampLeft(picked.left), top: clampTop(below) };
}
