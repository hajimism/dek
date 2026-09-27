import { describe, expect, test } from "bun:test";
import { type DeckSnapshot, diffSnapshot, mergeScope } from "../../src/server/deck-snapshot.ts";

const base: DeckSnapshot = {
  script: 1,
  theme: 1,
  slides: { intro: 1, end: 1 },
  styles: { intro: 1 },
  scripts: { intro: 1 },
  javascript: {},
  voice: {},
};

const edit = (change: Partial<DeckSnapshot>): DeckSnapshot => ({ ...base, ...change });

describe("diffSnapshot", () => {
  test("nothing changed: no events and no work", () => {
    expect(diffSnapshot(base, base)).toEqual({ sync: false, events: [], synth: false });
  });

  test("a script edit syncs, lints every slide, and synthesizes the voice", () => {
    expect(diffSnapshot(base, edit({ script: 2 }))).toEqual({
      sync: true,
      events: [],
      diagnose: {},
      synth: true,
    });
  });

  test("a sync reloads the page, so the slides it wrote are no reload of their own", () => {
    const change = diffSnapshot(base, edit({ script: 2, slides: { intro: 2, two: 2 } }));
    expect(change.events).toEqual([]);
  });

  test("a saved slide reloads that slide and lints only it", () => {
    expect(diffSnapshot(base, edit({ slides: { intro: 2, end: 1 } }))).toEqual({
      sync: false,
      events: [{ type: "reload-slide", slug: "intro" }],
      diagnose: { slug: "intro" },
      synth: false,
    });
  });

  test("two saved slides lint the whole deck", () => {
    expect(diffSnapshot(base, edit({ slides: { intro: 2, end: 2 } })).diagnose).toEqual({});
  });

  test("a slide restored to an older copy still reloads", () => {
    expect(diffSnapshot(base, edit({ slides: { intro: 0.5, end: 1 } })).events).toEqual([
      { type: "reload-slide", slug: "intro" },
    ]);
  });

  test("a deleted slide reloads the page and lints the deck", () => {
    expect(diffSnapshot(base, edit({ slides: { intro: 1 } }))).toEqual({
      sync: false,
      events: [{ type: "sync", created: [], removed: ["end"] }],
      diagnose: {},
      synth: false,
    });
  });

  test("the theme and a slide stylesheet saved together reload the theme once", () => {
    expect(diffSnapshot(base, edit({ theme: 2, styles: { intro: 2 } }))).toEqual({
      sync: false,
      events: [{ type: "reload-theme" }],
      diagnose: {},
      synth: false,
    });
  });

  test("a deleted theme reloads the theme", () => {
    expect(diffSnapshot(base, edit({ theme: 0 })).events).toEqual([{ type: "reload-theme" }]);
  });

  test("a slide script, added or saved, reloads the page for its slug", () => {
    expect(diffSnapshot(base, edit({ scripts: { intro: 2, end: 1 } })).events).toEqual([
      { type: "reload-script", slugs: ["end", "intro"] },
    ]);
  });

  test("a .js slide script reloads nothing but is linted", () => {
    expect(diffSnapshot(base, edit({ javascript: { intro: 1 } }))).toEqual({
      sync: false,
      events: [],
      diagnose: {},
      synth: false,
    });
  });

  test("a voice file edit synthesizes the voice and nothing else", () => {
    expect(diffSnapshot(base, edit({ voice: { "voice.toml": 1 } }))).toEqual({
      sync: false,
      events: [],
      synth: true,
    });
  });
});

describe("mergeScope", () => {
  test("one slide stays one slide; anything more is the whole deck", () => {
    expect(mergeScope({ slug: "a" }, { slug: "a" })).toEqual({ slug: "a" });
    expect(mergeScope({ slug: "a" }, { slug: "b" })).toEqual({});
    expect(mergeScope({}, { slug: "a" })).toEqual({});
    expect(mergeScope(undefined, { slug: "a" })).toEqual({ slug: "a" });
  });
});
