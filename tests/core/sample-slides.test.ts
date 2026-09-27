import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Window } from "happy-dom";

const decks = join(import.meta.dir, "..", "..", "sample", "decks");

async function mount(id: string, deck = "with-agents") {
  const slides = join(decks, deck, "slides");
  const window = new Window();
  window.document.body.innerHTML = await Bun.file(join(slides, `${id}.html`)).text();
  const slide = window.document.querySelector(".slide") as unknown as HTMLElement;
  const script = (await import(join(slides, `${id}.ts`))).default as Required<DekSlide>;
  return { slide, script };
}

describe("with-agents/loop", () => {
  const lit = (slide: HTMLElement) =>
    [...slide.querySelectorAll<HTMLElement>("[data-node]")]
      .filter((node) => node.classList.contains("is-lit"))
      .map((node) => node.dataset.node);
  const ok = (slide: HTMLElement) =>
    slide.querySelector<HTMLElement>('[data-hub="1"]')?.style.visibility === "visible";

  test("each beat ends on its own node of the ring", async () => {
    const { slide, script } = await mount("loop");
    const end = (step: string, index: number) =>
      script.draw(slide, { step, index, t: script.motion[step] ?? 0 });

    end("loop-write", 1);
    expect(lit(slide)).toEqual(["0"]);
    end("loop-check", 2);
    expect(lit(slide)).toEqual(["0", "1"]);
    expect(ok(slide)).toBe(false);
    end("loop-fix", 3);
    expect(lit(slide)).toEqual(["0", "1", "2"]);
    expect(ok(slide)).toBe(true);
  });
});

describe("lightning/lint", () => {
  const verdict = (slide: HTMLElement) => {
    const el = slide.querySelector<HTMLElement>("[data-verdict]");
    return { shown: Number(el?.style.opacity), text: el?.dataset.verdict };
  };

  test("gives no verdict before the failing run prints, and the fail verdict once it has", async () => {
    const { slide, script } = await mount("lint", "lightning");
    script.draw(slide, { step: "0", index: 0, t: 0 });
    expect(verdict(slide).shown).toBe(0);
    script.draw(slide, { step: "lint-fail", index: 1, t: 0 });
    expect(verdict(slide).shown).toBe(0);
    script.draw(slide, { step: "lint-fail", index: 1, t: script.motion["lint-fail"] ?? 0 });
    expect(verdict(slide)).toEqual({ shown: 1, text: "fail" });
    script.draw(slide, { step: "lint-pass", index: 2, t: script.motion["lint-pass"] ?? 0 });
    expect(verdict(slide)).toEqual({ shown: 1, text: "pass" });
  });
});
