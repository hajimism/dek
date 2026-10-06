import { describe, expect, test } from "bun:test";
import { placePopup } from "../../src/runtime/annotate-place.ts";

const viewport = { width: 1280, height: 720 };
const size = { width: 340, height: 160 };

/** Whether the popup at `at` would cover any of `rect`. */
function covers(
  at: { left: number; top: number },
  rect: { left: number; top: number; right: number; bottom: number },
) {
  return (
    at.left < rect.right &&
    at.left + size.width > rect.left &&
    at.top < rect.bottom &&
    at.top + size.height > rect.top
  );
}

describe("placePopup", () => {
  test("goes under what was picked, lined up with its left edge", () => {
    const picked = { left: 200, top: 100, right: 500, bottom: 140 };
    const at = placePopup(picked, size, viewport);
    expect(at).toEqual({ left: 200, top: 148 });
    expect(covers(at, picked)).toBe(false);
  });

  test("goes above when there is no room under it", () => {
    const picked = { left: 200, top: 600, right: 500, bottom: 640 };
    expect(placePopup(picked, size, viewport)).toEqual({ left: 200, top: 432 });
  });

  test("goes beside it when it is too tall for either", () => {
    const picked = { left: 200, top: 150, right: 500, bottom: 600 };
    const at = placePopup(picked, size, viewport);
    expect(at).toEqual({ left: 508, top: 150 });
    expect(covers(at, picked)).toBe(false);
  });

  test("goes to its left when the right has no room", () => {
    const picked = { left: 800, top: 150, right: 1100, bottom: 600 };
    expect(placePopup(picked, size, viewport)).toEqual({ left: 452, top: 150 });
  });

  test("stays inside the window", () => {
    const picked = { left: 1150, top: 100, right: 1270, bottom: 140 };
    expect(placePopup(picked, size, viewport)).toEqual({ left: 932, top: 148 });
  });

  test("goes under it, inside the window, when nothing fits on any side", () => {
    const picked = { left: 0, top: 0, right: 1280, bottom: 720 };
    expect(placePopup(picked, size, viewport)).toEqual({ left: 8, top: 552 });
  });
});
