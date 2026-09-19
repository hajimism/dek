import { describe, expect, test } from "bun:test";
import {
  elapsedTone,
  isPresenterToggleKey,
  presenterSearch,
  progressFill,
  totalBudgetSeconds,
} from "../../src/runtime/presenter.ts";

describe("isPresenterToggleKey", () => {
  test("maps p and P without modifiers", () => {
    expect(isPresenterToggleKey({ key: "p", altKey: false, ctrlKey: false, metaKey: false })).toBe(
      true,
    );
    expect(isPresenterToggleKey({ key: "P", altKey: false, ctrlKey: false, metaKey: false })).toBe(
      true,
    );
  });

  test("ignores modifiers, other keys, and key repeat", () => {
    expect(isPresenterToggleKey({ key: "p", altKey: false, ctrlKey: true, metaKey: false })).toBe(
      false,
    );
    expect(isPresenterToggleKey({ key: "p", altKey: false, ctrlKey: false, metaKey: true })).toBe(
      false,
    );
    expect(isPresenterToggleKey({ key: "p", altKey: true, ctrlKey: false, metaKey: false })).toBe(
      false,
    );
    expect(
      isPresenterToggleKey({
        key: "p",
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        repeat: true,
      }),
    ).toBe(false);
    expect(
      isPresenterToggleKey({ key: "Enter", altKey: false, ctrlKey: false, metaKey: false }),
    ).toBe(false);
  });
});

describe("presenterSearch", () => {
  test("adds a bare presenter query flag", () => {
    expect(presenterSearch("", true)).toBe("?presenter");
    expect(presenterSearch("?rehearse", true)).toBe("?rehearse&presenter");
  });

  test("removes the presenter flag and keeps other params", () => {
    expect(presenterSearch("?presenter", false)).toBe("");
    expect(presenterSearch("?rehearse&presenter", false)).toBe("?rehearse");
  });
});

describe("elapsedTone", () => {
  test("stays ok without a budget", () => {
    expect(elapsedTone(999, undefined)).toBe("ok");
  });

  test("warns after 80% and flags overage", () => {
    expect(elapsedTone(80, 100)).toBe("ok");
    expect(elapsedTone(81, 100)).toBe("warn");
    expect(elapsedTone(100, 100)).toBe("warn");
    expect(elapsedTone(101, 100)).toBe("over");
  });
});

describe("totalBudgetSeconds", () => {
  test("sums defined section budgets", () => {
    expect(totalBudgetSeconds([{ budgetSeconds: 10 }, { budgetSeconds: 20 }])).toBe(30);
    expect(totalBudgetSeconds([{}, { budgetSeconds: 5 }])).toBe(5);
    expect(totalBudgetSeconds([{}, {}])).toBeUndefined();
  });
});

describe("progressFill", () => {
  test("treats a beat-less slide as a single filled segment", () => {
    expect(progressFill(0, 0)).toBe(1);
  });

  test("is the fraction of beats including the current one", () => {
    expect(progressFill(0, 4)).toBe(0.25);
    expect(progressFill(3, 4)).toBe(1);
  });
});
