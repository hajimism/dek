import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gotoCommand } from "../../src/cli/goto.ts";
import { requireDeckFromCwd } from "../../src/cli/scope.ts";
import { parseShotMode } from "../../src/cli/shot.ts";
import { formatRef } from "../../src/cli/text.ts";
import { DekError } from "../../src/core/error.ts";
import { REF_MARKER } from "../../src/core/ref.ts";
import { runMain } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { REF_SHA, withTempProject } from "../helpers/project.ts";
import { withDevServer } from "../helpers/server.ts";
import { AWKWARD_NAMES, hintCommands, shellWords, UNWRITABLE_NAMES } from "../helpers/shell.ts";

// A deck's folder, a slide's file, and a ref's rev can hold anything a cloned project or a typed
// argument brings. Every command dek suggests must still be one a shell splits into the words dek
// means, and no name may close the code span the command is printed in.

type Failure = { error: { message: string; hint?: string } };

/** Each test runs dek in this process and a shell to read what it printed: seconds when loaded. */
function hintTest(name: string, fn: () => Promise<void> | void): void {
  test.serial(name, fn, 30_000);
}

async function failure(argv: string[], cwd: string): Promise<Failure["error"]> {
  const result = await runMain([...argv, "--json"], cwd);
  expect(result.exitCode).toBe(1);
  return (JSON.parse(result.stdout) as Failure).error;
}

/** How many backticks a hint holds: two to a command, so no name opened or closed a span. */
function backticks(hint: string | undefined): number {
  return [...(hint ?? "")].filter((char) => char === "`").length;
}

describe("a hint about a deck whose name a shell reads", () => {
  hintTest("names it as one word, and the command runs as written", async () => {
    await withTempProject({ decks: AWKWARD_NAMES.map((name) => ({ name })) }, async (root) => {
      for (const name of AWKWARD_NAMES) {
        const { hint } = await failure(["show", name, "nope"], root);
        expect({ name, commands: hintCommands(hint) }).toEqual({
          name,
          commands: [["dekc", "ls", name]],
        });
        expect(backticks(hint)).toBe(2);
        const [, ...argv] = hintCommands(hint)[0] ?? [];
        expect((await runMain(argv, root)).exitCode).toBe(0);
      }
    });
  });

  hintTest("is a placeholder when no word holds it alike in every shell", async () => {
    await withTempProject({ decks: UNWRITABLE_NAMES.map((name) => ({ name })) }, async (root) => {
      for (const name of UNWRITABLE_NAMES) {
        const { hint } = await failure(["show", name, "nope"], root);
        expect(hint).toBe("run `dekc ls <deck>`; for <deck>, name the deck as `dekc ls` lists it");
      }
    });
    await withTempProject({ decks: [{ name: "it's" }] }, async (root) => {
      expect((await failure(["show", "intro"], root)).hint).toBe(
        "run `dekc show <deck> intro --json`; for <deck>, name the deck as `dekc ls` lists it",
      );
    });
    const many = { decks: ["a\\b", "c", "d", "e"].map((name) => ({ name })) };
    await withTempProject(many, async (root) => {
      expect((await failure(["theme"], root)).hint).toBe(
        "run `dekc theme <deck> --json`, or name another deck in place of <deck>; `dekc ls` lists them; for <deck>, name the deck as `dekc ls` lists it",
      );
    });
    await withTempProject(
      { decks: [{ name: "a\\b" }, { name: "demo" }, { name: "it's" }] },
      async (root) => {
        expect((await failure(["show", "intro"], root)).hint).toBe(
          "run `dekc show <deck> intro --json`, `dekc show demo intro --json`, or `dekc show <deck> intro --json`; for <deck>, name the deck as `dekc ls` lists it",
        );
      },
    );
  });

  hintTest("is retyped with the deck named, and in place of it", async () => {
    for (const name of AWKWARD_NAMES) {
      await withTempProject({ decks: [{ name }] }, async (root) => {
        const { hint } = await failure(["show", "intro"], root);
        expect(hintCommands(hint)).toEqual([["dekc", "show", name, "intro", "--json"]]);
        expect(backticks(hint)).toBe(2);
      });
    }
    const many = { decks: ["a`b", "c", "d", "e"].map((name) => ({ name })) };
    await withTempProject(many, async (root) => {
      const { hint } = await failure(["theme"], root);
      expect(hint).toBe(
        "run `dekc theme 'a'\"$(printf '\\140')\"'b' --json`, or name another deck in place of 'a'\"$(printf '\\140')\"'b'; `dekc ls` lists them",
      );
    });
  });

  hintTest("guesses it as a word to type, and not at all when no word holds it", async () => {
    await withTempProject({ decks: [{ name: "a`bc" }, { name: "it'sx" }] }, async (root) => {
      const { hint } = await failure(["lint", "--deck", "a`bd"], root);
      const guess = hint?.match(/^did you mean `([^`]*)`\?/)?.[1];
      expect(shellWords(guess ?? "")).toEqual(["a`bc"]);
      expect((await failure(["lint", "--deck", "it'sy"], root)).hint).not.toContain("did you mean");
    });
  });
});

describe("a hint about a slide file whose name a shell reads", () => {
  hintTest("moves it with one word for its name", async () => {
    const file = "x`;echo hi;`";
    const spec = {
      decks: [
        {
          name: "demo",
          slides: {
            [file]: slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">hand-written</h2>
</section>`),
          },
        },
      ],
    };
    await withTempProject(spec, async (root) => {
      const result = await runMain(["lint", "--json"], join(root, "decks", "demo"));
      const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Failure["error"][] };
      const commands = diagnostics.flatMap((diagnostic) => hintCommands(diagnostic.hint));
      expect(commands).toContainEqual(["dekc", "mv", file, "intro"]);
      expect(commands).toContainEqual(["dekc", "mv", "intro", file]);
    });
  });
});

describe("a hint about a slide file that reads as a flag or holds a quote", () => {
  const hand = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">hand-written</h2>
</section>`);

  hintTest("moves a file whose name starts with a dash after --, and the move runs", async () => {
    const file = "--before=intro";
    await withTempProject({ decks: [{ name: "demo", slides: { [file]: hand } }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const result = await runMain(["lint", "--json"], deckDir);
      const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Failure["error"][] };
      const commands = diagnostics.flatMap((diagnostic) => hintCommands(diagnostic.hint));
      expect(commands).toContainEqual(["dekc", "mv", "--", file, "intro"]);
      expect((await runMain(["mv", "--", file, "intro"], deckDir)).exitCode).toBe(0);
    });
  });

  hintTest("names no move for a file no word holds alike in every shell", async () => {
    await withTempProject({ decks: [{ name: "demo", slides: { "it's": hand } }] }, async (root) => {
      const result = await runMain(["lint", "--json"], join(root, "decks", "demo"));
      const { diagnostics } = JSON.parse(result.stdout) as { diagnostics: Failure["error"][] };
      const commands = diagnostics.flatMap((diagnostic) => hintCommands(diagnostic.hint));
      expect(commands.filter(([, command]) => command === "mv")).toEqual([]);
    });
  });
});

describe("a hint about a ref", () => {
  hintTest("names a rev a shell reads as one word", async () => {
    const ref = { name: "o/r/d", rev: REF_SHA };
    await withTempProject({ decks: [{ name: "mine" }], refs: [ref] }, async (root) => {
      const arg = "o/r/d@v1;echo$IFS'hi'";
      const { hint } = await failure(["ls", arg], root);
      expect(hint).toBe(
        `run \`dekc ref 'o/r/d@v1;echo$IFS'\\''hi'\\'''\` to pin that version, or drop @v1;echo$IFS'hi'`,
      );
      expect(hintCommands(hint)).toEqual([["dekc", "ref", arg]]);
    });
    await withTempProject({ decks: [{ name: "mine" }] }, async (root) => {
      const arg = "o/r/d@v1;x";
      expect(hintCommands((await failure(["ls", arg], root)).hint)).toEqual([["dekc", "ref", arg]]);
    });
  });

  hintTest("refused as a deck names it as one word", async () => {
    await withTempProject({ decks: [{ name: "mine" }] }, async (root) => {
      const name = "o/r/a;b";
      expect(hintCommands((await failure(["lint", name], root)).hint)).toEqual([
        ["dekc", "new", "<name>", "--theme-from", name],
        ["dekc", "show", name, "<slug>"],
      ]);
    });
  });

  hintTest("inside a snapshot names the ref only when a ref can be named so", async () => {
    await withTempProject({ decks: [{ name: "d" }] }, async (root) => {
      const meta = (name: string) => JSON.stringify({ name, rev: REF_SHA, path: "decks/d" });
      // A marker whose name no ref can carry makes no snapshot, so no hint names it.
      await writeFile(join(root, REF_MARKER), meta("x`;echo hi;`"));
      expect(await runMain(["ls", "--json"], root)).toMatchObject({ exitCode: 0 });
      const snapshot = join(root, "refs", "file", "talk");
      await mkdir(snapshot, { recursive: true });
      await writeFile(join(snapshot, "dek.toml"), "");
      await writeFile(join(snapshot, REF_MARKER), meta("file/talk"));
      expect(hintCommands((await failure(["ls"], snapshot)).hint)).toEqual([
        ["dekc", "show", "file/talk", "<slug>"],
      ]);
    });
  });

  hintTest("added says how to read it, with its name as one word", () => {
    const text = formatRef({
      action: "add",
      name: "file/it's",
      rev: REF_SHA,
      changed: true,
      dir: "/p/refs/file/it's",
      license: null,
      warnings: [],
    });
    expect(hintCommands(text)).toEqual([
      ["dekc", "ls", "file/it's"],
      ["dekc", "show", "file/it's", "<slug>"],
    ]);
  });
});

describe("other commands a hint names", () => {
  hintTest("--sheet with a slug names the slug as one word", () => {
    for (const slug of AWKWARD_NAMES) {
      try {
        parseShotMode({ slug, sheet: true });
        throw new Error("expected --sheet with a slug to be refused");
      } catch (error) {
        expect(hintCommands((error as DekError).hint)).toEqual([
          ["dekc", "shot", slug, "--motion"],
        ]);
      }
    }
  });

  hintTest("a server for another deck names both decks as words a shell reads", async () => {
    const deck = (name: string) => ({
      name,
      slides: { intro: '<section class="slide"><h2>intro</h2></section>\n' },
    });
    const decks = [deck("a`b"), deck("it's"), deck("build")];
    await withTempProject({ decks }, async (root) => {
      const refusal = async (target: string) => {
        const error = await gotoCommand(requireDeckFromCwd(root, target), "intro").catch(
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(DekError);
        return (error as DekError).hint;
      };
      await withDevServer({ cwd: root, deck: "a`b" }, async () => {
        const hint = await refusal("build");
        expect(hint).toStartWith(`pass --deck 'a'"$(printf '\\140')"'b', or stop the server at `);
        expect(hintCommands(hint)).toEqual([["dekc", "--deck", "build"]]);
        expect(await refusal("it's")).toEndWith("and run `dekc <deck>`");
      });
    });
  });
});
