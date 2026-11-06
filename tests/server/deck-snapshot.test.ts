import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lockText } from "../../src/core/plugin.ts";
import {
  type DeckSnapshot,
  diffSnapshot,
  mergeScope,
  takeSnapshot,
} from "../../src/server/deck-snapshot.ts";
import { withTempProject } from "../helpers/project.ts";

const base: DeckSnapshot = {
  script: 1,
  theme: 1,
  slides: { intro: 1, end: 1 },
  styles: { intro: 1 },
  scripts: { intro: 1 },
  javascript: {},
  voice: {},
  plugins: { "plugins/study/plugin.json": 1, "decks/demo/study.yaml": 1 },
};

const edit = (change: Partial<DeckSnapshot>): DeckSnapshot => ({ ...base, ...change });

describe("diffSnapshot", () => {
  test("reloads the page when a plugin's lock or data file changes, and lints nothing", () => {
    const changed: Array<Record<string, number>> = [
      { "plugins/study/plugin.json": 2, "decks/demo/study.yaml": 1 },
      { "plugins/study/plugin.json": 1 },
    ];
    for (const plugins of changed) {
      expect(diffSnapshot(base, edit({ plugins }))).toEqual({
        sync: false,
        events: [{ type: "reload-script", slugs: [] }],
        synth: false,
      });
    }
  });

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

describe("takeSnapshot", () => {
  test("watches each pinned plugin's lock, and the data files it declares in this deck", async () => {
    await withTempProject(
      {
        toml: "[plugins.study]\n",
        decks: [{ name: "demo", slides: { intro: '<section class="slide"></section>' } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        expect(takeSnapshot(deckDir).plugins).toEqual({});
        mkdirSync(join(root, "plugins", "study"), { recursive: true });
        writeFileSync(
          join(root, "plugins", "study", "plugin.json"),
          lockText({
            schema: 1,
            name: "study",
            version: "0.1.0",
            page: { api: 1, keys: ["r"] },
            data: [{ path: "study.yaml" }],
          }),
        );
        writeFileSync(join(deckDir, "study.yaml"), "version: 1\n");
        expect(Object.keys(takeSnapshot(deckDir).plugins).sort()).toEqual([
          "decks/demo/study.yaml",
          "plugins/study/plugin.json",
        ]);
      },
    );
  });
});
