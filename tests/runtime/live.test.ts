import { describe, expect, test } from "bun:test";
import {
  applyLiveEvent,
  hydrateLiveEvent,
  type LiveHost,
  type LiveSlide,
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
      const slide: LiveSlide = {
        querySelectorAll(selector) {
          if (selector !== "[data-step]") {
            return [];
          }
          return [...html.matchAll(/data-step="([^"]+)"/g)].map((match) => {
            let shown = false;
            return {
              getAttribute(name: string) {
                return name === "data-step" ? (match[1] ?? null) : null;
              },
              classList: {
                toggle(name: string, force?: boolean) {
                  if (name === "is-shown") {
                    shown = force ?? !shown;
                  }
                },
              },
            };
          });
        },
      };
      return slide;
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
      { shown: new Set(["hook"]) },
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
      { shown: new Set() },
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
          { id: "DEK040", message: "dictionary is missing English word: AI" },
          { id: "DEK010", message: 'class "x"' },
        ],
      },
      fakeHost(doc),
      { shown: new Set() },
    );
    expect(doc.diagnostics).toBe(
      'DEK040 warning: dictionary is missing English word: AI\nDEK010: class "x"',
    );
  });

  test("updates diagnostics and removes the overlay when empty", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: "DEK001: missing" };
    const host = fakeHost(doc);
    applyLiveEvent(
      { type: "diagnostics", diagnostics: [{ id: "DEK003", message: "bad step" }] },
      host,
      { shown: new Set() },
    );
    expect(doc.diagnostics).toBe("DEK003: bad step");
    applyLiveEvent({ type: "diagnostics", diagnostics: [] }, host, { shown: new Set() });
    expect(doc.diagnostics).toBeNull();
  });

  test("reloads the page when a slide script changes, since scripts register once", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: null };
    const result = applyLiveEvent({ type: "reload-script", slugs: ["intro"] }, fakeHost(doc), {
      shown: new Set(),
    });
    expect(result.reload).toBe(true);
  });

  test("reloads on any sync so presenter notes pick up script edits", () => {
    const doc: FakeDoc = { slides: new Map(), theme: "", diagnostics: null };
    const host = fakeHost(doc);
    expect(applyLiveEvent({ type: "sync", created: [] }, host, { shown: new Set() }).reload).toBe(
      true,
    );
    expect(
      applyLiveEvent({ type: "sync", created: ["/tmp/slides/extra.html"] }, host, {
        shown: new Set(),
      }).reload,
    ).toBe(true);
    expect(
      applyLiveEvent({ type: "sync", created: [], removed: ["intro"] }, host, {
        shown: new Set(),
      }).reload,
    ).toBe(true);
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
