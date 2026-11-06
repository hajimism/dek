import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { CheckInput } from "../../../src/plugin-api.ts";
import { check } from "../../../src/plugins/words/check.ts";

const PLUGIN_DIR = "/talks/plugins/words";
const LIST_URI = pathToFileURL(join(PLUGIN_DIR, "words.yaml")).href;

const LIST = [
  "version: 1",
  "words:",
  "  - word: 効く",
  "    verb: godan",
  "    use: 何が起きるかを書く",
  "  - word: 物差し",
  "  - word: 〇〇",
  "    in: slides",
].join("\n");

const input = (): CheckInput => ({
  protocol: 1,
  dek: "0.6.0",
  deck: {
    name: "talk",
    lang: "ja",
    slides: [
      { slug: "cover", title: "表紙", html: "slides/cover.html", css: null, ts: null },
      { slug: "empty", title: "空", html: null, css: null, ts: null },
    ],
  },
  pluginDir: PLUGIN_DIR,
});

function reader(files: Record<string, string>) {
  return async (path: string) => files[path];
}

describe("check", () => {
  test("finds each listed word in the slides and the script, at its line and column", async () => {
    const findings = await check(
      input(),
      reader({
        [join(PLUGIN_DIR, "words.yaml")]: LIST,
        "script.md": "## 表紙 {#cover}\n\n自チームの外まで効いている。〇〇は台本では見ない\n",
        "slides/cover.html":
          '<section class="slide">\n  <p>物差しが<b>効</b>きます。〇〇</p>\n</section>',
      }),
    );
    expect(findings).toEqual([
      {
        rule: "WORDS001",
        message: '効く is on the word list, as "効い"',
        path: "script.md",
        line: 3,
        column: 9,
        hint: "何が起きるかを書く",
      },
      {
        rule: "WORDS001",
        message: "物差し is on the word list",
        path: "slides/cover.html",
        line: 2,
        column: 6,
        hint: "write the sentence without it",
      },
      {
        rule: "WORDS001",
        message: '効く is on the word list, as "効き"',
        path: "slides/cover.html",
        line: 2,
        column: 13,
        hint: "何が起きるかを書く",
      },
      {
        rule: "WORDS001",
        message: "〇〇 is on the word list",
        path: "slides/cover.html",
        line: 2,
        column: 22,
        hint: "write the sentence without it",
      },
    ]);
  });

  test("has no finding for a word the deck allows", async () => {
    const findings = await check(
      input(),
      reader({
        [join(PLUGIN_DIR, "words.yaml")]: LIST,
        "words.yaml": "version: 1\nallow:\n  - 物差し\n",
        "slides/cover.html": "<p>物差し</p>",
      }),
    );
    expect(findings).toEqual([]);
  });

  test("reports a list or allows that do not read as WORDS002, where the mistake is", async () => {
    const findings = await check(
      input(),
      reader({
        [join(PLUGIN_DIR, "words.yaml")]: `${LIST}\n  - word: 刺さる\n    verb: five\n`,
        "words.yaml": "version: 1\nallow:\n  - 物指し\n",
        "slides/cover.html": "<p>刺さる</p>",
      }),
    );
    expect(findings).toEqual([
      {
        rule: "WORDS002",
        message: "entry 刺さる: `verb` is godan or ichidan, not five",
        path: LIST_URI,
        line: 9,
        hint: "write plugins/words/words.yaml as https://hajimism.github.io/dek/reference/plugins.html#dek-words shows",
      },
      {
        rule: "WORDS002",
        message: "words.yaml allows 物指し, which is no entry on plugins/words/words.yaml",
        path: "words.yaml",
        line: 3,
        hint: "write words.yaml as https://hajimism.github.io/dek/reference/plugins.html#dek-words shows",
      },
    ]);
  });

  test("reports a project with no list as WORDS002, since nothing was checked", async () => {
    const slides = { "slides/cover.html": "<p>物差し</p>", "words.yaml": "version: 9\n" };
    expect(await check(input(), reader(slides))).toEqual([
      {
        rule: "WORDS002",
        message:
          "plugins/words/words.yaml is not there, and [plugins.words] checks each deck against it",
        path: LIST_URI,
        hint: "ask the user for the team's words and write them there as https://hajimism.github.io/dek/reference/plugins.html#dek-words shows, or take [plugins.words] out of dek.toml",
      },
    ]);
  });

  test("has nothing to check with a dek that gives no folder", async () => {
    const listed = { "slides/cover.html": "<p>物差し</p>", [join(PLUGIN_DIR, "words.yaml")]: LIST };
    const { pluginDir: _, ...older } = input();
    expect(await check(older, reader(listed))).toEqual([]);
  });
});
