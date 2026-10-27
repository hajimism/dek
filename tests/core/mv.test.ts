import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { renameSection, reorderSection } from "../../src/core/mv.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { hintCommands } from "../helpers/shell.ts";

const problemHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">keep heading</h2>
</section>`);

describe("renameSection", () => {
  test("renames the id and HTML file without changing the heading text", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## 発表の前日に何をしていますか {#problem}

みなさん
`,
            slides: { problem: problemHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        renameSection(deckDir, "problem", "the-problem");
        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script).toContain("## 発表の前日に何をしていますか {#the-problem}");
        expect(script).not.toContain("{#problem}");
        expect(existsSync(join(deckDir, "slides", "problem.html"))).toBe(false);
        expect(await readFile(join(deckDir, "slides", "the-problem.html"), "utf8")).toBe(
          problemHtml,
        );
      },
    );
  });

  test("does not rewrite script.md when the destination HTML already exists", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## problem

body
`,
            slides: { problem: problemHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const dest = join(deckDir, "slides", "the-problem.html");
        await writeFile(dest, problemHtml);
        const before = await readFile(join(deckDir, "script.md"), "utf8");
        try {
          renameSection(deckDir, "problem", "the-problem");
          throw new Error("expected renameSection to fail");
        } catch (error) {
          expect(error).toBeInstanceOf(DekError);
          expect((error as DekError).message).toBe(
            "slides/problem.html and slides/the-problem.html both hold a slide you wrote",
          );
        }
        expect(await readFile(join(deckDir, "script.md"), "utf8")).toBe(before);
        expect(existsSync(join(deckDir, "slides", "problem.html"))).toBe(true);
        expect(await readFile(dest, "utf8")).toBe(problemHtml);
      },
    );
  });

  test("names a slide file a shell reads as one word in the command to run again", async () => {
    const file = "x`;echo hi;`";
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: problemHtml, [file]: problemHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        try {
          renameSection(deckDir, file, "intro");
          throw new Error("expected renameSection to fail");
        } catch (error) {
          const { hint } = error as DekError;
          expect(hintCommands(hint)).toEqual([["dekc", "mv", file, "intro"]]);
          expect(hint).toStartWith(
            "merge them into slides/intro.html and remove the other, then run ",
          );
        }
      },
    );
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: problemHtml, "it's": problemHtml } }] },
      async (root) => {
        try {
          renameSection(join(root, "decks", "demo"), "it's", "intro");
          throw new Error("expected renameSection to fail");
        } catch (error) {
          expect((error as DekError).hint).toEndWith(", then run that `dekc mv` again");
        }
      },
    );
  });

  test("rewrites data-slug in the moved HTML so DEK006 does not fire", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(
                `<section class="slide" data-slug="intro" data-layout="title"><h2 class="slide-title">x</h2></section>`,
              ),
            },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        renameSection(deckDir, "intro", "cover");
        const html = await readFile(join(deckDir, "slides", "cover.html"), "utf8");
        expect(html).toContain('data-slug="cover"');
        expect(html).not.toContain('data-slug="intro"');
        expect(lintDeck(deckDir)).toEqual([]);
      },
    );
  });
});

describe("renameSection and voice.toml", () => {
  test("refuses a voice.toml that links out of the project, and leaves what it points at", async () => {
    await withTempDir(async (outside) => {
      const elsewhere = join(outside, "voice.toml");
      const kept = "[beats.intro]\nlead = 600\n";
      await writeFile(elsewhere, kept);
      await withTempProject(
        { decks: [{ name: "demo", slides: { intro: problemHtml } }] },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"));
          await symlink(elsewhere, join(deckDir, "voice", "voice.toml"));
          expect(() => renameSection(deckDir, "intro", "cover")).toThrow(
            expect.objectContaining({
              message: "decks/demo/voice/voice.toml leads outside the project",
              hint: expect.stringContaining("copy the file instead"),
            }),
          );
          expect(await readFile(elsewhere, "utf8")).toBe(kept);
          expect(existsSync(join(deckDir, "slides", "intro.html"))).toBe(true);
        },
      );
    });
  });

  test("rewrites [beats] keys for the slide and its beats, leaving other slides alone", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: slideDocument(
                `<section class="slide" data-layout="title"><h2 class="slide-title">x</h2></section>`,
              ),
            },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const voiceToml = join(deckDir, "voice", "voice.toml");
        await Bun.write(
          voiceToml,
          [
            'engine = "voicevox"',
            "",
            "# the cover [beats.intro] holds longer",
            "[beats.intro]",
            "lead = 600",
            "",
            '[beats."intro/2"]',
            "pause = 900",
            "",
            "[beats.intro-two]",
            "lead = 1",
            "",
            "[beats]",
            "'intro/3' = { lead = 2 }",
            "",
          ].join("\n"),
        );
        renameSection(deckDir, "intro", "cover");
        expect(await readFile(voiceToml, "utf8")).toBe(
          [
            'engine = "voicevox"',
            "",
            "# the cover [beats.intro] holds longer",
            "[beats.cover]",
            "lead = 600",
            "",
            '[beats."cover/2"]',
            "pause = 900",
            "",
            "[beats.intro-two]",
            "lead = 1",
            "",
            "[beats]",
            "'cover/3' = { lead = 2 }",
            "",
          ].join("\n"),
        );
      },
    );
  });

  // One test per form: TOML forbids a [beats] header after top-level beats.* keys defined the table.
  test("rewrites dotted keys from the top level", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      await Bun.write(
        voiceToml,
        [
          "beats.intro.lead = 1",
          'beats . "intro/2" . pause = 2',
          "beats.intro-two.lead = 5",
          "",
        ].join("\n"),
      );
      renameSection(deckDir, "intro", "cover");
      expect(await readFile(voiceToml, "utf8")).toBe(
        [
          "beats.cover.lead = 1",
          'beats . "cover/2" . pause = 2',
          "beats.intro-two.lead = 5",
          "",
        ].join("\n"),
      );
    });
  });

  test("rewrites dotted keys under [beats]", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      await Bun.write(
        voiceToml,
        ["[beats]", "intro.pause = 3", '"intro/3".lead = 4', "intro-two.lead = 5", ""].join("\n"),
      );
      renameSection(deckDir, "intro", "cover");
      expect(await readFile(voiceToml, "utf8")).toBe(
        ["[beats]", "cover.pause = 3", '"cover/3".lead = 4', "intro-two.lead = 5", ""].join("\n"),
      );
    });
  });

  test("leaves keys outside [beats] and text inside strings alone", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      const source = [
        'speaker = "intro"',
        "[pause]",
        "intro = 1",
        "[beats.other]",
        'note = """',
        "[beats.intro]",
        'intro.lead = 1"""',
        "",
      ].join("\n");
      await Bun.write(voiceToml, source);
      renameSection(deckDir, "intro", "cover");
      expect(await readFile(voiceToml, "utf8")).toBe(source);
    });
  });

  test("refuses a layout it cannot rewrite before touching any file", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      const source = "beats = { intro = { lead = 1 } }\n";
      await Bun.write(voiceToml, source);
      expect(() => renameSection(deckDir, "intro", "cover")).toThrow(
        expect.objectContaining({ name: "DekError", path: voiceToml }),
      );
      expect(await readFile(voiceToml, "utf8")).toBe(source);
      expect(existsSync(join(deckDir, "slides", "intro.html"))).toBe(true);
      expect(await readFile(join(deckDir, "script.md"), "utf8")).toContain("## intro");
    });
  });
});

describe("renameSection when a write fails", () => {
  // chmod does not stop root from writing, so the failure cannot be staged there.
  test.skipIf(process.getuid?.() === 0)("puts every file back as it was", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      const slides = join(deckDir, "slides");
      await Bun.write(join(slides, "intro.css"), ".x { color: var(--c); }\n");
      await Bun.write(join(slides, "intro.ts"), "export default {};\n");
      await Bun.write(voiceToml, "[beats.intro]\nlead = 1\n");
      const script = await readFile(join(deckDir, "script.md"), "utf8");
      const html = await readFile(join(slides, "intro.html"), "utf8");
      // A write goes to a new file beside voice.toml, which a read-only folder refuses.
      await chmod(join(deckDir, "voice"), 0o555);
      try {
        expect(() => renameSection(deckDir, "intro", "cover")).toThrow();
      } finally {
        await chmod(join(deckDir, "voice"), 0o755);
      }
      expect(await readFile(join(deckDir, "script.md"), "utf8")).toBe(script);
      expect(await readFile(join(slides, "intro.html"), "utf8")).toBe(html);
      expect(existsSync(join(slides, "intro.css"))).toBe(true);
      expect(existsSync(join(slides, "intro.ts"))).toBe(true);
      for (const ext of [".html", ".css", ".ts"]) {
        expect(existsSync(join(slides, `cover${ext}`))).toBe(false);
      }
      expect(await readFile(voiceToml, "utf8")).toBe("[beats.intro]\nlead = 1\n");
    });
  });
});

describe("renameSection and reorderSection", () => {
  // A file written in place keeps its inode, and a crash part way leaves it cut short; one
  // renamed into place is new, and a reader sees the old file or the new one, whole.
  test("write script.md and voice.toml to a new file renamed into place, mode kept", async () => {
    await withIntroDeck(async (deckDir, voiceToml) => {
      const script = join(deckDir, "script.md");
      await writeFile(script, `${await readFile(script, "utf8")}\n## outro\n\nbye\n`);
      await Bun.write(voiceToml, "[beats.intro]\nlead = 1\n");
      await chmod(script, 0o600);
      const before = { script: statSync(script).ino, voice: statSync(voiceToml).ino };
      renameSection(deckDir, "intro", "cover");
      const renamed = statSync(script).ino;
      expect(renamed).not.toBe(before.script);
      expect(statSync(voiceToml).ino).not.toBe(before.voice);
      reorderSection(deckDir, "outro", { before: "cover" });
      expect(statSync(script).ino).not.toBe(renamed);
      expect(statSync(script).mode & 0o777).toBe(0o600);
      const leftovers = [deckDir, join(deckDir, "slides"), join(deckDir, "voice")].flatMap((dir) =>
        readdirSync(dir).filter((name) => name.endsWith(".tmp")),
      );
      expect(leftovers).toEqual([]);
    });
  });

  // Renaming a file into place needs a folder that can be written, not the file: a read-only
  // script.md is replaced, read-only still, where a write in place failed and took the move back.
  test.skipIf(process.getuid?.() === 0)(
    "rename in a read-only script.md, keeping it so",
    async () => {
      await withIntroDeck(async (deckDir) => {
        const script = join(deckDir, "script.md");
        await chmod(script, 0o444);
        renameSection(deckDir, "intro", "cover");
        expect(await readFile(script, "utf8")).toContain("{#cover}");
        expect(statSync(script).mode & 0o777).toBe(0o444);
      });
    },
  );
});

async function withIntroDeck(fn: (deckDir: string, voiceToml: string) => Promise<void>) {
  await withTempProject(
    {
      decks: [
        {
          name: "demo",
          slides: {
            intro: slideDocument(
              `<section class="slide" data-layout="title"><h2 class="slide-title">x</h2></section>`,
            ),
          },
        },
      ],
    },
    async (root) => {
      const deckDir = join(root, "decks", "demo");
      await fn(deckDir, join(deckDir, "voice", "voice.toml"));
    },
  );
}

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);

describe("reorderSection", () => {
  test("moves a section before another and keeps HTML files in place", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        reorderSection(deckDir, "architecture", { before: "intro" });
        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script.indexOf("## architecture")).toBeLessThan(script.indexOf("## intro"));
        expect(existsSync(join(deckDir, "slides", "intro.html"))).toBe(true);
        expect(existsSync(join(deckDir, "slides", "architecture.html"))).toBe(true);
      },
    );
  });

  test("moves a section after another", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## architecture

body

## intro

hello
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        reorderSection(deckDir, "architecture", { after: "intro" });
        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script.indexOf("## intro")).toBeLessThan(script.indexOf("## architecture"));
      },
    );
  });
});
