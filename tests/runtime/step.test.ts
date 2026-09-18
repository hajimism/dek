import { describe, expect, test } from "bun:test";
import {
  advance,
  applyIsShown,
  applyMorphNames,
  clearMorphNames,
  keyToMove,
  type MorphElement,
  retreat,
  type StepElement,
  shouldUseViewTransition,
} from "../../src/runtime/step.ts";

function stepEl(step: string): StepElement & { shown: boolean } {
  const el = {
    shown: false,
    getAttribute(name: string) {
      return name === "data-step" ? step : null;
    },
    classList: {
      toggle(name: string, force?: boolean) {
        if (name !== "is-shown") {
          return;
        }
        if (force === undefined) {
          el.shown = !el.shown;
          return;
        }
        el.shown = force;
      },
    },
  };
  return el;
}

function morphEl(name: string): MorphElement & { attrs: Record<string, string> } {
  const attrs: Record<string, string> = { "data-morph": name };
  return {
    attrs,
    getAttribute(key: string) {
      return attrs[key] ?? null;
    },
    setAttribute(key: string, value: string) {
      attrs[key] = value;
    },
    removeAttribute(key: string) {
      delete attrs[key];
    },
  };
}

describe("applyIsShown", () => {
  test("toggles is-shown on elements whose data-step is in the shown set", () => {
    const hook = stepEl("hook");
    const second = stepEl("2");
    const missing = stepEl("missing");
    applyIsShown([hook, second, missing], new Set(["1", "hook"]));
    expect(hook.shown).toBe(true);
    expect(second.shown).toBe(false);
    expect(missing.shown).toBe(false);
  });
});

describe("advance", () => {
  const counts = [2, 1, 0];

  test("advances a beat on the same slide while beats remain", () => {
    expect(advance({ slideIndex: 0, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
  });

  test("moves to the next slide after the last beat", () => {
    expect(advance({ slideIndex: 0, beatIndex: 1 }, counts)).toEqual({
      slideIndex: 1,
      beatIndex: 0,
    });
  });

  test("skips a title slide with no beats on the next advance", () => {
    expect(advance({ slideIndex: 1, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 2,
      beatIndex: 0,
    });
  });

  test("stops on the last slide", () => {
    expect(advance({ slideIndex: 2, beatIndex: 0 }, counts)).toBeNull();
  });
});

describe("retreat", () => {
  const counts = [2, 1, 0];

  test("retreats a beat on the same slide while beats remain", () => {
    expect(retreat({ slideIndex: 0, beatIndex: 1 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
  });

  test("moves to the previous slide's last beat from the first beat", () => {
    expect(retreat({ slideIndex: 1, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 0,
      beatIndex: 1,
    });
  });

  test("lands on beat 0 when the previous slide has no beats", () => {
    expect(retreat({ slideIndex: 2, beatIndex: 0 }, counts)).toEqual({
      slideIndex: 1,
      beatIndex: 0,
    });
  });

  test("stops on the first slide", () => {
    expect(retreat({ slideIndex: 0, beatIndex: 0 }, counts)).toBeNull();
  });
});

describe("keyToMove", () => {
  test("maps forward keys to advance", () => {
    expect(keyToMove("ArrowRight")).toBe("advance");
    expect(keyToMove(" ")).toBe("advance");
    expect(keyToMove("PageDown")).toBe("advance");
  });

  test("maps backward keys to retreat", () => {
    expect(keyToMove("ArrowLeft")).toBe("retreat");
    expect(keyToMove("PageUp")).toBe("retreat");
    expect(keyToMove("Backspace")).toBe("retreat");
  });

  test("ignores other keys", () => {
    expect(keyToMove("ArrowUp")).toBeNull();
    expect(keyToMove("Enter")).toBeNull();
  });
});

describe("shouldUseViewTransition", () => {
  test("is true only when the slide index changes", () => {
    expect(shouldUseViewTransition(0, 0)).toBe(false);
    expect(shouldUseViewTransition(0, 1)).toBe(true);
  });
});

describe("applyMorphNames", () => {
  test("copies data-morph onto view-transition-name", () => {
    const pipeline = morphEl("pipeline");
    applyMorphNames([pipeline]);
    expect(pipeline.getAttribute("view-transition-name")).toBe("pipeline");
  });

  test("applies names only to the given elements", () => {
    const current = morphEl("pipeline");
    const other = morphEl("pipeline");
    applyMorphNames([current]);
    expect(current.getAttribute("view-transition-name")).toBe("pipeline");
    expect(other.getAttribute("view-transition-name")).toBeNull();
  });
});

describe("clearMorphNames", () => {
  test("removes view-transition-name from inactive slides", () => {
    const current = morphEl("pipeline");
    const other = morphEl("pipeline");
    applyMorphNames([current, other]);
    clearMorphNames([other]);
    expect(current.getAttribute("view-transition-name")).toBe("pipeline");
    expect(other.getAttribute("view-transition-name")).toBeNull();
  });
});
