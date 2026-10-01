import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runMain as run } from "../helpers/cli.ts";
import { withTempProject } from "../helpers/project.ts";

type Failure = { ok: false; error: { message: string; hint?: string } };

/** The error `--json` prints, after checking the run failed with it. */
async function failure(argv: string[], cwd: string): Promise<Failure["error"]> {
  const result = await run([...argv, "--json"], cwd);
  expect(result.exitCode).toBe(1);
  const json = JSON.parse(result.stdout) as Failure;
  expect(json.ok).toBe(false);
  return json.error;
}

const decks = { decks: [{ name: "demo" }, { name: "other" }] };

describe("main", () => {
  test.serial("rejects a --format other than sarif instead of printing text", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await run(["lint", "--format", "json"], join(root, "decks", "demo"));
      expect(result.stdout).toBe("");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('invalid --format "json"');
      expect(result.stderr).toContain("--format sarif");
    });
  });

  test.serial(
    "rehearse refuses a slug the deck does not have before it starts a server",
    async () => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        const result = await run(["rehearse", "nope"], join(root, "decks", "demo"));
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('section "nope" not found');
      });
    },
  );

  test.serial(
    "serve is no command word: dekc serve says the dev server is the bare dek",
    async () => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        const error = await failure(["serve", "--port", "3"], root);
        expect(error.message).toBe("unknown command: serve");
        expect(error.hint).toBe("the dev server is the bare `dekc [deck]`: drop `serve`");
      });
    },
  );

  test.serial("prints a result as text, its paths relative to where dek runs", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await run(["sync", "demo"], root);
      expect(result.stdout).toStartWith("synced ");
      expect(result.stdout).toContain("\n  decks/demo/slides/intro.html");
    });
  });

  test.serial(
    "build keeps stdout for what it wrote; why an image is missing goes to stderr",
    async () => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        const result = await run(["build"], join(root, "decks", "demo"));
        expect(result.stdout).toStartWith("wrote ");
        expect(result.stdout).not.toContain("preview");
        expect(result.stderr).toContain("preview: skipped (url is not set)");
        expect(result.stderr).toContain("help: set url in dek.toml");
      });
    },
  );

  // A session prints no result, so --json has nothing to shape: an agent waiting for one would
  // wait on a server that never exits. Both say so at once, before anything starts.
  test.serial("the dev server and rehearse refuse --json instead of starting", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deck = join(root, "decks", "demo");
      for (const [argv, name] of [
        [[], "dekc"],
        [["demo"], "dekc"],
        [["rehearse"], "dekc rehearse"],
      ] as const) {
        const error = await failure([...argv], argv.length === 1 ? root : deck);
        expect(error.message).toBe(`${name} keeps running until stopped and prints no JSON`);
        expect(error.hint).toBe(
          `start it without --json and leave it running; for a result, run \`dekc lint --json\` or \`dekc check <slug> --json\``,
        );
      }
    });
  });

  test.serial("--json is heard even where a value flag stands before it", async () => {
    await withTempProject(decks, async (root) => {
      for (const argv of [
        ["lint", "--port", "--json"],
        ["lint", "--json=false"],
      ]) {
        const result = await run(argv, root);
        expect(result.exitCode).toBe(1);
        expect((JSON.parse(result.stdout) as Failure).ok).toBe(false);
      }
    });
  });

  // A deck whose script.md cannot be read is not done, wherever lint runs from: every problem is a
  // diagnostic, in the shape every other finding has, and SARIF carries them too.
  test.serial("lint reports every problem of an unreadable script as diagnostics", async () => {
    await withTempProject(decks, async (root) => {
      const deck = join(root, "decks", "demo");
      await Bun.write(
        join(deck, "script.md"),
        "---\ntitle: Demo\n---\n\n## 日本語\n\n## Bad {#Bad}\n",
      );
      for (const cwd of [deck, root]) {
        const result = await run(["lint", "--json"], cwd);
        expect(result.exitCode).toBe(1);
        const json = JSON.parse(result.stdout) as {
          ok: boolean;
          diagnostics: Array<{ id: string; line?: number; hint?: string }>;
        };
        expect(json.ok).toBe(false);
        expect(json.diagnostics.filter((d) => d.id === "DEK027").map((d) => d.line)).toEqual([
          5, 7,
        ]);
      }
      const sarif = JSON.parse((await run(["lint", "--format", "sarif"], deck)).stdout) as {
        runs: Array<{ results: Array<{ ruleId: string }> }>;
      };
      expect(sarif.runs[0]?.results.map((r) => r.ruleId)).toEqual(["DEK027", "DEK027"]);
    });
  });

  test.serial("a malformed command line still answers in JSON when --json is on it", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["lint", "--fixx"], root);
      expect(error.message).toBe("unknown flag --fixx for dekc lint");
      expect(error.hint).toContain("dekc help lint");
    });
  });
});

describe("positional arguments", () => {
  test.serial("an argument past what the command takes is an error, not ignored", async () => {
    await withTempProject(decks, async (root) => {
      const ls = await failure(["ls", "demo", "bogus", "extra"], root);
      expect(ls.message).toBe('unexpected argument "bogus" for dekc ls');
      expect(ls.hint).toBe("usage: dekc ls [deck]; run `dekc help ls`");
      const theme = await failure(["theme", "demo", "cover", "bogus"], root);
      expect(theme.message).toBe('unexpected argument "bogus" for dekc theme');
      expect((await failure(["new", "talk", "more"], root)).message).toBe(
        'unexpected argument "more" for dekc new',
      );
    });
  });

  test.serial("a missing argument is named, with the usage from the spec", async () => {
    await withTempProject(decks, async (root) => {
      const show = await failure(["show"], join(root, "decks", "demo"));
      expect(show.message).toBe("missing <slug> for dekc show");
      expect(show.hint).toBe("usage: dekc show [deck] <slug>; run `dekc help show`");
      // At the root, a lone deck name is the deck, so what is missing is still the slug.
      expect((await failure(["show", "demo"], root)).message).toBe("missing <slug> for dekc show");
      expect((await failure(["new"], root)).message).toBe("missing <name> for dekc new");
      expect((await failure(["new", "  "], root)).message).toBe("missing <name> for dekc new");
      expect((await failure(["ref", "rm"], root)).message).toBe("missing <ref> for dekc ref rm");
    });
  });

  test.serial(
    "a word past a deck that is no deck is taken as the deck, so it is not found",
    async () => {
      await withTempProject(decks, async (root) => {
        const error = await failure(["show", "demoo", "intro"], root);
        expect(error.message).toBe('deck "demoo" not found');
      });
    },
  );

  test.serial("mv names what is missing for a rename", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["mv", "intro"], join(root, "decks", "demo"));
      expect(error.message).toBe("missing <new> for dekc mv");
      expect(error.hint).toBe("usage: dekc mv [deck] <old> <new>; run `dekc help mv`");
    });
  });
});

describe("subcommands", () => {
  test.serial("an unknown voice subcommand is named, with the likeliest one", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["voice", "speakr"], join(root, "decks", "demo"));
      expect(error.message).toBe('unknown subcommand "speakr" for dekc voice');
      expect(error.hint).toBe("did you mean `dekc voice speakers`?");
      const far = await failure(["voice", "deploy"], join(root, "decks", "demo"));
      expect(far.hint).toBe("dekc voice takes speakers, say, dict add, pin; run `dekc help voice`");
    });
  });

  test.serial("a subcommand's own arguments are checked", async () => {
    await withTempProject(decks, async (root) => {
      const say = await failure(["voice", "say"], join(root, "decks", "demo"));
      expect(say.message).toBe("missing <text> for dekc voice say");
      expect(say.hint).toBe("usage: dekc voice [deck] say <text>; run `dekc help voice`");
      const dict = await failure(["voice", "dict", "add", "dek"], join(root, "decks", "demo"));
      expect(dict.message).toBe("missing <kana> for dekc voice dict add");
      const pin = await failure(["voice", "pin", "now"], join(root, "decks", "demo"));
      expect(pin.message).toBe('unexpected argument "now" for dekc voice pin');
    });
  });

  test.serial("a deck before the subcommand is the deck", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["voice", "nope", "pin"], root);
      expect(error.message).toBe('deck "nope" not found');
    });
  });
});

describe("deck scope", () => {
  test.serial("a command that writes refuses a ref by its spec, before it runs", async () => {
    await withTempProject(decks, async (root) => {
      for (const argv of [
        ["lint", "a/b/c"],
        ["check", "a/b/c", "intro"],
        ["mv", "a/b/c", "x", "y"],
      ]) {
        expect((await failure(argv, root)).message).toBe('"a/b/c" is a ref; refs are read-only');
      }
    });
  });

  test.serial("a command that reads a ref asks for it to be added first", async () => {
    await withTempProject(decks, async (root) => {
      for (const argv of [
        ["ls", "a/b/c"],
        ["show", "a/b/c", "intro"],
        ["theme", "a/b/c"],
      ]) {
        expect((await failure(argv, root)).message).toBe('ref "a/b/c" is not added');
      }
    });
  });

  test.serial("a deck command at the project root asks for a deck", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["cues"], root);
      expect(error.message).toBe("not inside a deck directory; pass a deck name");
    });
  });

  test.serial(
    "the hint at the project root is the command typed, with the deck named",
    async () => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        const error = await failure(["--shot", "check", "intro"], root);
        expect(error.hint).toBe("run `dekc check demo --shot intro --json`");
      });
    },
  );

  test.serial("each deck gets its command, and the command runs as written", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["show", "intro"], root);
      expect(error.hint).toBe(
        "run `dekc show demo intro --json` or `dekc show other intro --json`",
      );
      const [first] = [...(error.hint ?? "").matchAll(/`dekc ([^`]+)`/g)].map((m) =>
        (m[1] ?? "").split(" "),
      );
      expect((await run(first ?? [], root)).exitCode).toBe(0);
    });
  });

  test.serial("a deck the command line names before a subcommand goes there", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const error = await failure(["marks", "clear"], root);
      expect(error.hint).toBe("run `dekc marks demo clear --json`");
    });
  });

  test.serial("many decks get one command and where to find the rest", async () => {
    const many = { decks: ["a", "b", "c", "d"].map((name) => ({ name })) };
    await withTempProject(many, async (root) => {
      const error = await failure(["theme"], root);
      expect(error.hint).toBe(
        "run `dekc theme a --json`, or name another deck in place of a; `dekc ls` lists them",
      );
    });
  });

  test.serial("a project with no deck yet is told to make one", async () => {
    await withTempProject({}, async (root) => {
      const error = await failure(["theme"], root);
      expect(error.hint).toBe("run `dekc new <name>` to make a deck");
    });
  });
});
