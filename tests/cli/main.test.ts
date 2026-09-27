import { describe, expect, spyOn, test } from "bun:test";
import { join } from "node:path";
import { main } from "../../src/cli/main.ts";
import { withTempProject } from "../helpers/project.ts";

type Run = { stdout: string; stderr: string; exitCode: number };

/**
 * Runs the CLI in this process, with what it writes captured. The capture swaps the global
 * stdout and stderr, so every test here is test.serial.
 */
async function run(argv: string[], cwd: string): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  const stdout = spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  const stderr = spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  const previous = process.exitCode;
  process.exitCode = 0;
  let exitCode = 0;
  try {
    await main(argv, cwd);
  } finally {
    exitCode = Number(process.exitCode ?? 0);
    // Bun keeps a 1 when handed undefined, which would fail the whole run.
    process.exitCode = previous ?? 0;
    stdout.mockRestore();
    stderr.mockRestore();
  }
  return { stdout: out.join(""), stderr: err.join(""), exitCode };
}

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
        const error = await failure(["rehearse", "nope"], join(root, "decks", "demo"));
        expect(error.message).toBe('section "nope" not found');
      });
    },
  );

  test.serial(
    "serve is no command word: dek serve says the dev server is the bare dek",
    async () => {
      await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
        const error = await failure(["serve", "--port", "3"], root);
        expect(error.message).toBe("unknown command: serve");
        expect(error.hint).toBe("the dev server is the bare `dek [deck]`: drop `serve`");
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

  test.serial("a malformed command line still answers in JSON when --json is on it", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["lint", "--fixx"], root);
      expect(error.message).toBe("unknown flag --fixx for dek lint");
      expect(error.hint).toContain("dek help lint");
    });
  });
});

describe("positional arguments", () => {
  test.serial("an argument past what the command takes is an error, not ignored", async () => {
    await withTempProject(decks, async (root) => {
      const ls = await failure(["ls", "demo", "bogus", "extra"], root);
      expect(ls.message).toBe('unexpected argument "bogus" for dek ls');
      expect(ls.hint).toBe("usage: dek ls [deck]; run `dek help ls`");
      const theme = await failure(["theme", "demo", "cover", "bogus"], root);
      expect(theme.message).toBe('unexpected argument "bogus" for dek theme');
      expect((await failure(["new", "talk", "more"], root)).message).toBe(
        'unexpected argument "more" for dek new',
      );
    });
  });

  test.serial("a missing argument is named, with the usage from the spec", async () => {
    await withTempProject(decks, async (root) => {
      const show = await failure(["show"], join(root, "decks", "demo"));
      expect(show.message).toBe("missing <slug> for dek show");
      expect(show.hint).toBe("usage: dek show [deck] <slug>; run `dek help show`");
      // At the root, a lone deck name is the deck, so what is missing is still the slug.
      expect((await failure(["show", "demo"], root)).message).toBe("missing <slug> for dek show");
      expect((await failure(["new"], root)).message).toBe("missing <name> for dek new");
      expect((await failure(["new", "  "], root)).message).toBe("missing <name> for dek new");
      expect((await failure(["ref", "rm"], root)).message).toBe("missing <ref> for dek ref rm");
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
      expect(error.message).toBe("missing <new> for dek mv");
      expect(error.hint).toBe("usage: dek mv [deck] <old> <new>; run `dek help mv`");
    });
  });
});

describe("subcommands", () => {
  test.serial("an unknown voice subcommand is named, with the likeliest one", async () => {
    await withTempProject(decks, async (root) => {
      const error = await failure(["voice", "speakr"], join(root, "decks", "demo"));
      expect(error.message).toBe('unknown subcommand "speakr" for dek voice');
      expect(error.hint).toBe("did you mean `dek voice speakers`?");
      const far = await failure(["voice", "deploy"], join(root, "decks", "demo"));
      expect(far.hint).toBe("dek voice takes speakers, say, dict add, pin; run `dek help voice`");
    });
  });

  test.serial("a subcommand's own arguments are checked", async () => {
    await withTempProject(decks, async (root) => {
      const say = await failure(["voice", "say"], join(root, "decks", "demo"));
      expect(say.message).toBe("missing <text> for dek voice say");
      expect(say.hint).toBe("usage: dek voice [deck] say <text>; run `dek help voice`");
      const dict = await failure(["voice", "dict", "add", "dek"], join(root, "decks", "demo"));
      expect(dict.message).toBe("missing <kana> for dek voice dict add");
      const pin = await failure(["voice", "pin", "now"], join(root, "decks", "demo"));
      expect(pin.message).toBe('unexpected argument "now" for dek voice pin');
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
});
