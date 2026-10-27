import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultTheme } from "../../src/cli/files.ts";
import { newCommand } from "../../src/cli/new.ts";
import { resolveScope, resolveTarget } from "../../src/cli/scope.ts";
import { formatNew } from "../../src/cli/text.ts";
import { themeCommand } from "../../src/cli/theme.ts";
import { DekError } from "../../src/core/error.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { jsonStdout, runDek, runMain } from "../helpers/cli.ts";
import { deckRepoFiles, SHA_A, withFakeGithub } from "../helpers/fake-github.ts";
import { withTempDir } from "../helpers/fs.ts";
import { REF_SHA, type RefSpec, withTempProject } from "../helpers/project.ts";

type NewOk = {
  ok: true;
  name: string;
  dir: string;
  created: string[];
};

describe("dekc new", () => {
  test("creates a deck that already passes lint, voice included", async () => {
    await withTempProject(
      {
        toml: '[voice]\nengine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\n',
        theme: defaultTheme(),
      },
      async (root) => {
        const result = newCommand({ cwd: root, name: "talk" });
        expect(result.next).toEqual([
          "bun add -d @hajimism/dek",
          "cd decks/talk",
          "$EDITOR script.md",
          "bunx dekc",
        ]);
        expect(result.created).toContain(join(root, "decks", "talk", "slides", "intro.html"));
        expect(existsSync(join(root, "decks", "talk", "voice", "voice.toml"))).toBe(true);
        expect(lintDeck(join(root, "decks", "talk"))).toEqual([]);
      },
    );
  });

  test("creates a deck that passes lint in a theme without the bundled layouts", async () => {
    // The bundled theme with its title and default layouts renamed, as a grown theme may have them.
    const theme = defaultTheme()
      .replaceAll("@layout title", "@layout cover")
      .replaceAll('data-layout="title"', 'data-layout="cover"')
      .replaceAll("@layout default", "@layout center")
      .replaceAll('data-layout="default"', 'data-layout="center"');
    await withTempProject({ theme }, async (root) => {
      newCommand({ cwd: root, name: "talk" });
      const deckDir = join(root, "decks", "talk");
      expect(await readFile(join(deckDir, "slides", "intro.html"), "utf8")).toStartWith(
        '<section class="slide">\n',
      );
      expect(lintDeck(deckDir)).toEqual([]);
    });
  });

  test("adds a deck and copies the project theme.css", async () => {
    await withTempProject(
      {
        theme: "/* project theme */\n",
        decks: [{ name: "demo", theme: "/* project theme */\n" }],
      },
      async (root) => {
        const result = await runDek(["new", "2026-09-dek", "--json"], { cwd: root });
        expect(result).toMatchObject({ exitCode: 0 });

        const json = jsonStdout<NewOk>(result);
        expect(json.ok).toBe(true);
        expect(json.name).toBe("2026-09-dek");
        expect(json.dir).toBe(join(root, "decks", "2026-09-dek"));

        expect(existsSync(join(root, "decks", "2026-09-dek", "script.md"))).toBe(true);
        expect(existsSync(join(root, "decks", "2026-09-dek", "slides"))).toBe(true);
        expect(await readFile(join(root, "decks", "2026-09-dek", "theme.css"), "utf8")).toBe(
          "/* project theme */\n",
        );
      },
    );
  });
  // dek.toml seeds a new deck the way [voice] does; from then on the deck owns its copy.
  test("copies the deck settings dek.toml sets into the new deck's frontmatter", async () => {
    await withTempProject(
      { toml: "max_classes = 30\nlatin_per_minute = 140\n", theme: defaultTheme() },
      async (root) => {
        newCommand({ cwd: root, name: "talk" });
        const deckDir = join(root, "decks", "talk");
        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script).toContain("\nduration: 1m\nmax_classes: 30\nlatin_per_minute: 140\n---\n");
        expect(script).not.toContain("cjk_per_minute");
        expect(lintDeck(deckDir)).toEqual([]);
      },
    );
  });

  test("writes no deck settings when dek.toml sets none", async () => {
    await withTempProject({ theme: defaultTheme() }, async (root) => {
      newCommand({ cwd: root, name: "talk" });
      const script = await readFile(join(root, "decks", "talk", "script.md"), "utf8");
      expect(script).not.toMatch(/max_classes|per_minute/);
    });
  });
});

describe("newCommand", () => {
  test("copies theme.css from themeFrom", async () => {
    await withTempProject(
      {
        theme: "/* project */\n",
        decks: [{ name: "old", theme: "/* from-old */\n" }],
      },
      async (root) => {
        newCommand({ cwd: root, name: "2026-09-dek", themeFrom: "old" });
        expect(await readFile(join(root, "decks", "2026-09-dek", "theme.css"), "utf8")).toBe(
          "/* from-old */\n",
        );
      },
    );
  });

  test("refuses a theme.css that links out of the project, and makes no deck", async () => {
    await withTempDir(async (outside) => {
      const elsewhere = join(outside, "theme.css");
      await writeFile(elsewhere, "/* not the project's */\n");
      await withTempProject({ decks: [{ name: "old" }] }, async (root) => {
        await rm(join(root, "theme.css"), { force: true });
        await symlink(elsewhere, join(root, "theme.css"));
        await rm(join(root, "decks", "old", "theme.css"));
        await symlink(elsewhere, join(root, "decks", "old", "theme.css"));
        for (const [themeFrom, path] of [
          [undefined, "theme.css"],
          ["old", "decks/old/theme.css"],
        ] as const) {
          expect(() => newCommand({ cwd: root, name: "talk", themeFrom })).toThrow(
            expect.objectContaining({
              message: `${path} leads outside the project`,
              hint: expect.stringContaining("copy the file instead"),
            }),
          );
          expect(existsSync(join(root, "decks", "talk"))).toBe(false);
        }
      });
    });
  });

  test.serial(
    "dekc new refuses a dek.toml or theme.css that links out of the project",
    async () => {
      await withTempDir(async (outside) => {
        await writeFile(join(outside, "theme.css"), "/* not the project's */\n");
        await writeFile(join(outside, "dek.toml"), "");
        await withTempProject({ theme: defaultTheme() }, async (root) => {
          for (const name of ["theme.css", "dek.toml"]) {
            const before = await readFile(join(root, name), "utf8");
            await rm(join(root, name));
            await symlink(join(outside, name), join(root, name));
            const result = await runMain(["new", "talk", "--json"], root);
            expect(jsonStdout(result)).toMatchObject({
              ok: false,
              error: {
                message: `${name} leads outside the project`,
                hint: expect.stringContaining("copy the file instead"),
              },
            });
            expect(existsSync(join(root, "decks", "talk"))).toBe(false);
            await rm(join(root, name));
            await writeFile(join(root, name), before);
          }
        });
      });
    },
  );

  test("fails on a name with path separators", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(() => newCommand({ cwd: root, name: "../evil" })).toThrow(DekError);
      try {
        newCommand({ cwd: root, name: "../evil" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid deck name");
      }
    });
  });

  test.each(["-rf", "a\nb", "tab\there"])(
    "fails on %j, which a tool would read as a flag or a new line",
    async (name) => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        expect(() => newCommand({ cwd: root, name })).toThrow("invalid deck name");
      });
    },
  );

  // A deck dek can make is one it can pack: a pack's ref takes the deck's name, as AGENTS.md and
  // every hint about the ref show it, so it holds nothing a person cannot see.
  // U+3164, a Hangul filler, shows blank: a deck named only one would print as no name at all.
  test.each([
    "talk\u{E0041}",
    "talk\u{200B}",
    "talk\u{202E}",
    "talk\x9b",
    "\u{3164}",
    "talk\u{AD}",
  ])("fails on %j, which holds a character a person cannot see or a control", async (name) => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(() => newCommand({ cwd: root, name })).toThrow(
        expect.objectContaining({
          message: expect.stringContaining("invalid deck name"),
          hint: expect.stringContaining("no control character or one a person cannot see"),
        }),
      );
      expect(existsSync(join(root, "decks", name))).toBe(false);
    });
  });

  test("names next commands that paste as printed, from wherever new ran", async () => {
    await withTempProject({ theme: defaultTheme(), decks: [{ name: "demo" }] }, async (root) => {
      const inDeck = join(root, "decks", "demo");
      expect(newCommand({ cwd: inDeck, name: "My Talk" }).next).toEqual([
        "cd ../..",
        "bun add -d @hajimism/dek",
        "cd 'decks/My Talk'",
        "$EDITOR script.md",
        "bunx dekc",
      ]);
      await mkdir(join(root, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(root, "node_modules", ".bin", "dekc"), "");
      expect(newCommand({ cwd: inDeck, name: "other" }).next).toEqual([
        "cd ../other",
        "$EDITOR script.md",
        "bunx dekc",
      ]);
    });
  });

  test("says which of dek's own files it brought up to date", async () => {
    await withTempProject({ theme: defaultTheme() }, async (root) => {
      newCommand({ cwd: root, name: "first" });
      await writeFile(join(root, ".dek", "slide.d.ts"), "// an older dek's types\n");

      const result = newCommand({ cwd: root, name: "second" });
      expect(result.updated).toEqual([join(root, ".dek", "slide.d.ts")]);
      expect(result.created).not.toContain(join(root, ".dek", "slide.d.ts"));
      expect(formatNew(result)).toStartWith(
        `created deck second\n  ${join(root, ".dek", "slide.d.ts")} (updated)\n`,
      );
    });
  });

  test("names only the deck when dek's own files were already current", async () => {
    await withTempProject({ theme: defaultTheme() }, async (root) => {
      newCommand({ cwd: root, name: "first" });
      const result = newCommand({ cwd: root, name: "second" });
      expect(result.updated).toEqual([]);
      expect(formatNew(result)).toStartWith("created deck second\n\nnext:");
    });
  });

  test("fails outside a project and points to dekc init", async () => {
    await withTempDir(async (dir) => {
      expect(() => newCommand({ cwd: dir, name: "demo" })).toThrow(DekError);
      try {
        newCommand({ cwd: dir, name: "demo" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect(`${(error as DekError).message} ${(error as DekError).hint ?? ""}`).toContain(
          "dekc init",
        );
      }
    });
  });
});

describe("dekc new --theme-from <ref>", () => {
  const REF = "someone/talks/style";
  const theme = ".slide { --fg: #111; color: var(--fg); }\n.slide .card { padding: 0; }\n";
  const ref: RefSpec = { name: REF, license: "MIT", deck: { theme } };

  test("starts the deck on a copy of the ref's theme, saying where it came from", async () => {
    await withTempProject({ decks: [{ name: "mine" }], refs: [ref] }, async (root) => {
      const result = newCommand({ cwd: root, name: "talk", themeFrom: REF });
      expect(result.warnings).toEqual([]);
      expect(await readFile(join(root, "decks", "talk", "theme.css"), "utf8")).toBe(
        `/* Theme from the ref ${REF} at ${REF_SHA.slice(0, 7)}. */\n${theme}`,
      );
      expect(existsSync(join(root, "decks", "talk", "slides", "intro.html"))).toBe(true);
      const read = themeCommand(resolveTarget(root, "deck", { deck: "talk" }));
      expect(read.classes).toContain("card");
    });
  });

  test("warns when the ref has no license, and says so in the text", async () => {
    await withTempProject(
      { decks: [{ name: "mine" }], refs: [{ ...ref, license: undefined }] },
      async (root) => {
        const result = newCommand({ cwd: root, name: "talk", themeFrom: REF });
        expect(result.warnings).toEqual([expect.stringContaining(`${REF} has no license`)]);
        expect(formatNew(result)).toContain("warning: ");
      },
    );
  });

  test.serial(
    "reports what the copied theme holds that a person cannot see, where it now is",
    async () => {
      // Bidi isolates around a comment's words, and tag characters a model reads as "hi".
      const hiding = `${theme}/* \u{2066}keep\u{2069} */\n.slide .tag { gap: 0; } /*\u{E0068}\u{E0069}*/\n`;
      await withTempProject(
        { decks: [{ name: "mine", theme: hiding }], refs: [{ ...ref, deck: { theme: hiding } }] },
        async (root) => {
          const copy = join(root, "decks", "talk", "theme.css");
          // The copy's first line names the ref, so each line is one further down than the ref's.
          expect(newCommand({ cwd: root, name: "talk", themeFrom: REF }).hidden).toEqual([
            { path: copy, line: 4, column: 4, codePoints: ["U+2066", "U+2069"] },
            { path: copy, line: 5, column: 27, codePoints: ["U+E0068", "U+E0069"] },
          ]);
          const text = await runMain(["new", "other", "--theme-from", REF], root);
          expect(text.stderr).toContain(
            "warning: decks/other/theme.css:4:4: 2 characters that show as nothing or reorder the text: U+2066, U+2069\n",
          );
          expect(text.stderr).toContain(
            "help: they came in with the ref's theme, and a person reading the deck sees none of them; remove them from theme.css unless you mean them",
          );
          // A deck of the project's own is its author's: copying its theme reports nothing.
          expect(newCommand({ cwd: root, name: "third", themeFrom: "mine" })).not.toHaveProperty(
            "hidden",
          );
        },
      );
    },
  );

  test("a ref that is not pinned, or whose deck has no theme, says what to run", async () => {
    await withTempProject({ refs: [{ ...ref, declared: false }] }, async (root) => {
      expect(() => newCommand({ cwd: root, name: "talk", themeFrom: REF })).toThrow(
        `ref "${REF}" is not added`,
      );
    });
    await withTempProject({ refs: [{ ...ref, deck: { theme: null } }] }, async (root) => {
      expect(() => newCommand({ cwd: root, name: "talk", themeFrom: REF })).toThrow(
        expect.objectContaining({ hint: expect.stringContaining("dekc ref") }),
      );
    });
  });

  test.serial("fetches a pinned ref whose snapshot is gone before copying its theme", async () => {
    const repos = {
      "someone/talks": {
        head: SHA_A,
        commits: { [SHA_A]: { ...deckRepoFiles("style"), LICENSE: "MIT" } },
      },
    };
    await withFakeGithub(repos, async () => {
      await withTempProject({ refs: [{ ...ref, rev: SHA_A, fetched: false }] }, async (root) => {
        const result = await runMain(["new", "talk", "--theme-from", REF, "--json"], root);
        expect(result).toMatchObject({ exitCode: 0 });
        expect(jsonStdout<{ warnings: string[] }>(result).warnings).toEqual([]);
        expect(await readFile(join(root, "decks", "talk", "theme.css"), "utf8")).toStartWith(
          `/* Theme from the ref ${REF} at aaaaaaa. */\n.slide { --fg: #111;`,
        );
      });
    });
  });

  test("the guidance and the read-only error both name it", async () => {
    await withTempProject({ decks: [{ name: "mine" }], refs: [ref] }, async (root) => {
      newCommand({ cwd: root, name: "talk", themeFrom: REF });
      const agents = await readFile(join(root, "AGENTS.md"), "utf8");
      const build = agents.indexOf("dekc new <name> --theme-from <ref>");
      const read = agents.indexOf("dekc show <ref> <slug>");
      expect(build).toBeGreaterThan(-1);
      expect(read).toBeGreaterThan(build);
      expect(() => resolveScope(root, { deck: REF })).toThrow(
        expect.objectContaining({
          hint: expect.stringMatching(new RegExp(`--theme-from ${REF}.*dekc show ${REF} <slug>`)),
        }),
      );
    });
  });
});
