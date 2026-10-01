import { describe, expect, test } from "bun:test";
import {
  applyLiveEvent,
  hydrateLiveEvent,
  type LiveHost,
  liveSlidePath,
  liveThemePath,
  slideSelector,
} from "../../src/runtime/live.ts";

type FakeDoc = {
  slides: Map<string, string>;
  theme: string;
  diagnostics: string | null;
};

function fakeHost(doc: FakeDoc): LiveHost {
  return {
    replaceSlide(slug, html) {
      doc.slides.set(slug, html);
    },
    setTheme(css) {
      doc.theme = css;
    },
    setDiagnostics(text) {
      doc.diagnostics = text;
    },
  };
}

describe("hydrateLiveEvent", () => {
  test("does not apply a 404 body as slide HTML", async () => {
    const hydrated = await hydrateLiveEvent(
      { type: "reload-slide", slug: "intro" },
      "/",
      async () => new Response("Not found", { status: 404 }),
    );
    expect(hydrated).toBeUndefined();
  });

  test("does not apply a 500 body as theme CSS", async () => {
    const hydrated = await hydrateLiveEvent(
      { type: "reload-theme" },
      "/",
      async () => new Response("Internal Server Error", { status: 500 }),
    );
    expect(hydrated).toBeUndefined();
  });

  test("keeps the fragment when fetch succeeds", async () => {
    const html = `<section class="slide" data-slug="intro">ok</section>`;
    const hydrated = await hydrateLiveEvent(
      { type: "reload-slide", slug: "intro" },
      "/",
      async () => new Response(html, { status: 200 }),
    );
    expect(hydrated).toEqual({ type: "reload-slide", slug: "intro", html });
  });
});

describe("applyLiveEvent", () => {
  test("replaces a slide fragment and keeps its slug", () => {
    const doc: FakeDoc = {
      slides: new Map([["intro", `<section class="slide" data-slug="intro">old</section>`]]),
      theme: "",
      diagnostics: null,
    };
    const result = applyLiveEvent(
      {
        type: "reload-slide",
        slug: "intro",
        html: `<section class="slide" data-slug="intro"><h2 data-step="hook">new</h2></section>`,
      },
      fakeHost(doc),
    );
    expect(result.reload).toBe(false);
    expect(doc.slides.get("intro")).toContain("new");
    expect(doc.slides.get("intro")).toContain('data-slug="intro"');
  });

  test("replaces theme CSS", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "old", diagnostics: null };
    const result = applyLiveEvent(
      { type: "reload-theme", css: ".slide { background: red; }" },
      fakeHost(doc),
    );
    expect(result.reload).toBe(false);
    expect(doc.theme).toBe(".slide { background: red; }");
  });

  test("labels warnings in the overlay", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: null };
    applyLiveEvent(
      {
        type: "diagnostics",
        diagnostics: [
          { id: "DEKC040", severity: "warning", message: "dictionary is missing English word: AI" },
          { id: "DEKC010", severity: "error", message: 'class "x"' },
        ],
      },
      fakeHost(doc),
    );
    expect(doc.diagnostics).toBe(
      'DEKC040 warning: dictionary is missing English word: AI\nDEKC010: class "x"',
    );
  });

  test("updates diagnostics and removes the overlay when empty", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: "DEKC001: missing" };
    const host = fakeHost(doc);
    applyLiveEvent(
      {
        type: "diagnostics",
        diagnostics: [{ id: "DEKC003", severity: "error", message: "bad step" }],
      },
      host,
    );
    expect(doc.diagnostics).toBe("DEKC003: bad step");
    applyLiveEvent({ type: "diagnostics", diagnostics: [] }, host);
    expect(doc.diagnostics).toBeNull();
  });

  test("reloads the page when a slide script changes, since scripts register once", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: null };
    const result = applyLiveEvent({ type: "reload-script", slugs: ["intro"] }, fakeHost(doc));
    expect(result.reload).toBe(true);
  });

  test("reloads on any sync so presenter notes pick up script edits", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: null };
    const host = fakeHost(doc);
    expect(applyLiveEvent({ type: "sync", created: [] }, host).reload).toBe(true);
    expect(applyLiveEvent({ type: "sync", created: ["/tmp/slides/extra.html"] }, host).reload).toBe(
      true,
    );
    expect(applyLiveEvent({ type: "sync", created: [], removed: ["intro"] }, host).reload).toBe(
      true,
    );
  });
});

describe("live paths", () => {
  test("uses the deck prefix when serving from the project root", () => {
    expect(liveSlidePath("/decks/demo/", "intro")).toBe("/decks/demo/slide/intro");
    expect(liveThemePath("/decks/demo/presenter")).toBe("/decks/demo/theme");
  });

  test("uses short paths when the server is bound to one deck", () => {
    expect(liveSlidePath("/presenter", "intro")).toBe("/slide/intro");
    expect(liveThemePath("/")).toBe("/theme");
  });
});

describe("slideSelector", () => {
  test("targets a slide by data-slug", () => {
    expect(slideSelector("intro")).toBe(`#deck > .slide[data-slug="intro"]`);
    expect(slideSelector(`a"b`)).toBe(`#deck > .slide[data-slug="a\\"b"]`);
  });
});
