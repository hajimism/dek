import { describe, expect, test } from "bun:test";
import type { Position } from "../../src/core/step.ts";
import { createDeckControl } from "../../src/runtime/deck-control.ts";
import type { GoOrigin } from "../../src/runtime/navigator.ts";

const at = (slideIndex: number): Position => ({ slideIndex, beatIndex: 0 });

function setup(ready: boolean) {
  const went: Array<[Position, GoOrigin]> = [];
  const moved: Array<[Position, GoOrigin]> = [];
  let toggles = 0;
  const control = createDeckControl({
    go: async (position, origin) => {
      went.push([position, origin]);
    },
    rehearse: {
      ready: () => ready,
      move: (position, origin) => moved.push([position, origin]),
      toggle: () => {
        toggles += 1;
      },
    },
  });
  return { control, went, moved, toggles: () => toggles };
}

describe("createDeckControl", () => {
  test("without a rehearsal, a move goes straight to the deck with its origin", () => {
    const { control, went, moved } = setup(false);
    control.request(at(1), "local");
    control.request(at(2), "remote");
    control.request(null, "local");
    expect(went).toEqual([
      [at(1), "local"],
      [at(2), "remote"],
    ]);
    expect(moved).toEqual([]);
  });

  test("while a rehearsal is loaded, a move goes through its clock", () => {
    const { control, went, moved } = setup(true);
    control.request(at(1), "local");
    control.request(at(2), "remote");
    expect(moved).toEqual([
      [at(1), "local"],
      [at(2), "remote"],
    ]);
    expect(went).toEqual([]);
  });

  test("a page with no rehearsal to load moves the deck and leaves the play key alone", () => {
    const went: Array<[Position, GoOrigin]> = [];
    const control = createDeckControl({
      go: async (position, origin) => {
        went.push([position, origin]);
      },
    });
    control.request(at(1), "local");
    expect(went).toEqual([[at(1), "local"]]);
    expect(control.togglePlay()).toBe(false);
  });

  test("play and pause belong to a loaded rehearsal only", () => {
    const off = setup(false);
    expect(off.control.togglePlay()).toBe(false);
    expect(off.toggles()).toBe(0);
    const on = setup(true);
    expect(on.control.togglePlay()).toBe(true);
    expect(on.toggles()).toBe(1);
  });
});
