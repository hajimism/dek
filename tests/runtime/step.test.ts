import { describe, expect, test } from "bun:test";
import {
  advance,
  applyIsShown,
  applyMorphNames,
  clearMorphNames,
  isInteractive,
  isTextEntry,
  keyToMove,
  type MorphElement,
  moveTarget,
  pointerMove,
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

function morphEl(name: string): MorphElement & { props: Record<string, string> } {
  const attrs: Record<string, string> = { "data-morph": name };
  const props: Record<string, string> = {};
  return {
    props,
    getAttribute(key: string) {
      return attrs[key] ?? null;
    },
    style: {
      setProperty(key: string, value: string) {
        props[key] = value;
      },
      removeProperty(key: string) {
        const value = props[key] ?? "";
        delete props[key];
        return value;
      },
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
    expect(keyToMove({ key: "ArrowRight" })).toBe("advance");
    expect(keyToMove({ key: " " })).toBe("advance");
    expect(keyToMove({ key: "PageDown" })).toBe("advance");
  });

  test("maps backward keys to retreat, Shift+Space included", () => {
    expect(keyToMove({ key: "ArrowLeft" })).toBe("retreat");
    expect(keyToMove({ key: "PageUp" })).toBe("retreat");
    expect(keyToMove({ key: "Backspace" })).toBe("retreat");
    expect(keyToMove({ key: " ", shiftKey: true })).toBe("retreat");
  });

  test("maps Home and End to the ends of the talk", () => {
    expect(keyToMove({ key: "Home" })).toBe("first");
    expect(keyToMove({ key: "End" })).toBe("last");
  });

  test("leaves Alt, Ctrl, and Cmd chords to the browser", () => {
    expect(keyToMove({ key: "ArrowLeft", altKey: true })).toBeNull();
    expect(keyToMove({ key: "ArrowRight", ctrlKey: true })).toBeNull();
    expect(keyToMove({ key: "ArrowRight", metaKey: true })).toBeNull();
  });

  test("ignores other keys", () => {
    expect(keyToMove({ key: "ArrowUp" })).toBeNull();
    expect(keyToMove({ key: "Enter" })).toBeNull();
  });
});

describe("moveTarget", () => {
  const beats = [0, 3, 0];

  test("steps one beat either way", () => {
    expect(moveTarget("advance", { slideIndex: 1, beatIndex: 0 }, beats)).toEqual({
      slideIndex: 1,
      beatIndex: 1,
    });
    expect(moveTarget("retreat", { slideIndex: 1, beatIndex: 0 }, beats)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
  });

  test("jumps to the first beat of the talk and to the last beat of the last slide", () => {
    expect(moveTarget("first", { slideIndex: 1, beatIndex: 2 }, beats)).toEqual({
      slideIndex: 0,
      beatIndex: 0,
    });
    expect(moveTarget("last", { slideIndex: 0, beatIndex: 0 }, [0, 3, 2])).toEqual({
      slideIndex: 2,
      beatIndex: 1,
    });
  });
});

describe("isTextEntry", () => {
  test("is true for fields and editable text, where keys are typing", () => {
    expect(isTextEntry({ tagName: "INPUT" })).toBe(true);
    expect(isTextEntry({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntry({ tagName: "SELECT" })).toBe(true);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  test("is false for the page, links, and buttons", () => {
    expect(isTextEntry({ tagName: "A" })).toBe(false);
    expect(isTextEntry({ tagName: "BUTTON" })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe("shouldUseViewTransition", () => {
  test("is true only when the slide index changes", () => {
    expect(shouldUseViewTransition(0, 0)).toBe(false);
    expect(shouldUseViewTransition(0, 1)).toBe(true);
  });
});

describe("applyMorphNames", () => {
  test("copies data-morph onto the view-transition-name CSS property, which is what the browser reads", () => {
    const pipeline = morphEl("pipeline");
    applyMorphNames([pipeline]);
    expect(pipeline.props["view-transition-name"]).toBe("pipeline");
  });

  test("applies names only to the given elements", () => {
    const current = morphEl("pipeline");
    const other = morphEl("pipeline");
    applyMorphNames([current]);
    expect(current.props["view-transition-name"]).toBe("pipeline");
    expect(other.props["view-transition-name"]).toBeUndefined();
  });
});

describe("clearMorphNames", () => {
  test("removes view-transition-name from inactive slides", () => {
    const current = morphEl("pipeline");
    const other = morphEl("pipeline");
    applyMorphNames([current, other]);
    clearMorphNames([other]);
    expect(current.props["view-transition-name"]).toBe("pipeline");
    expect(other.props["view-transition-name"]).toBeUndefined();
  });
});

describe("pointerMove", () => {
  const stage = { width: 900, height: 500 };

  test("a tap on the right two thirds goes forward, on the left third back", () => {
    expect(pointerMove({ x: 700, y: 200, dx: 0, dy: 0 }, stage)).toBe("advance");
    expect(pointerMove({ x: 400, y: 200, dx: 0, dy: 0 }, stage)).toBe("advance");
    expect(pointerMove({ x: 100, y: 200, dx: 0, dy: 0 }, stage)).toBe("retreat");
  });

  test("a sideways swipe turns the page the way a book does", () => {
    expect(pointerMove({ x: 300, y: 200, dx: -120, dy: 10 }, stage)).toBe("advance");
    expect(pointerMove({ x: 300, y: 200, dx: 120, dy: -10 }, stage)).toBe("retreat");
  });

  test("a drag that is mostly vertical, or too short to be a swipe or a tap, does nothing", () => {
    expect(pointerMove({ x: 300, y: 200, dx: 20, dy: 140 }, stage)).toBeNull();
    expect(pointerMove({ x: 300, y: 200, dx: 30, dy: 0 }, stage)).toBeNull();
  });
});

describe("isInteractive", () => {
  const within = (match: boolean) => ({ closest: () => (match ? {} : null) });

  test("is true inside a link, a control, or media, whose touches are their own", () => {
    expect(isInteractive(within(true))).toBe(true);
  });

  test("is false on plain slide content and on anything that is not an element", () => {
    expect(isInteractive(within(false))).toBe(false);
    expect(isInteractive(null)).toBe(false);
  });
});
