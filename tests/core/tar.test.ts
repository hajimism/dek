import { describe, expect, test } from "bun:test";
import { link, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readTar } from "../../src/core/tar.ts";
import { withTempDir } from "../helpers/fs.ts";
import {
  joinBytes,
  paxRecords,
  tarData,
  tarFile,
  tarHeader,
  tarOf,
  zeroBlocks,
} from "../helpers/tar.ts";

const env = {
  ...process.env,
  // Neither the developer's git settings, such as signing every commit, nor macOS's `._` files.
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_AUTHOR_NAME: "dek",
  GIT_AUTHOR_EMAIL: "dek@example.com",
  GIT_AUTHOR_DATE: "2026-10-27T00:00:00Z",
  GIT_COMMITTER_NAME: "dek",
  GIT_COMMITTER_EMAIL: "dek@example.com",
  GIT_COMMITTER_DATE: "2026-10-27T00:00:00Z",
  COPYFILE_DISABLE: "1",
};

const unlimited = { maxBytes: Number.MAX_SAFE_INTEGER, maxEntries: Number.MAX_SAFE_INTEGER };

function run(cmd: string[], cwd: string, stdin?: string): string {
  const result = Bun.spawnSync(cmd, { cwd, env, stdin: Buffer.from(stdin ?? "") });
  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

/**
 * A folder `top` of what a repository holds and tar has a form for: a long path, a name longer
 * than a ustar header holds, a name in UTF-8, an empty file, a file of several blocks, a hard
 * link, and symbolic links, one to a target longer than a header holds.
 */
async function writeTree(dir: string): Promise<void> {
  const top = join(dir, "top");
  const deep = join(top, "d".repeat(60), "d".repeat(60));
  await mkdir(join(deep, "decks", "demo"), { recursive: true });
  await writeFile(join(top, "script.md"), "# talk\n");
  await writeFile(join(top, "empty.md"), "");
  await writeFile(
    join(top, "big.bin"),
    Uint8Array.from({ length: 3000 }, (_, i) => (i * 7) % 251),
  );
  await link(join(top, "big.bin"), join(top, "hard.bin"));
  await symlink("script.md", join(top, "link"));
  await symlink(`decks/demo/${"t".repeat(120)}`, join(deep, "far"));
  await writeFile(join(top, "ü日本.md"), "ユニコード\n");
  await writeFile(join(deep, "decks", "demo", "script.md"), "nested\n");
  await writeFile(join(deep, `${"n".repeat(130)}.md`), "long\n");
}

/** `git archive` of a commit of `top`, under a folder as GitHub names it. */
async function gitArchive(dir: string, empty = false): Promise<Uint8Array<ArrayBuffer>> {
  run(["git", "init", "-q"], dir);
  let tree: string;
  if (empty) {
    tree = run(["git", "mktree"], dir, "");
  } else {
    run(["git", "add", "-A"], dir);
    tree = run(["git", "write-tree"], dir);
  }
  const commit = run(["git", "commit-tree", tree, "-m", "talk"], dir);
  const out = join(dir, "out.tar");
  run(["git", "archive", "--format=tar", "--prefix=o-r-abc/", "-o", out, commit], dir);
  return new Uint8Array(await readFile(out));
}

/** The machine's tar's names for the GNU, pax, and ustar formats: bsdtar's or GNU tar's. */
function tarFormats(): string[] {
  const version = Bun.spawnSync(["tar", "--version"], { env }).stdout.toString();
  return [version.includes("bsdtar") ? "gnutar" : "gnu", "pax", "ustar"];
}

/** `top` as tar writes it in `format`; ustar cannot hold the longest name, so tar leaves it out. */
async function tarArchive(dir: string, format: string): Promise<Uint8Array<ArrayBuffer>> {
  const out = join(dir, `${format}.tar`);
  Bun.spawnSync(["tar", "-c", "-f", out, `--format=${format}`, "-C", dir, "top"], { env });
  return new Uint8Array(await readFile(out));
}

/** What `readTar` reads of `tar` must be what Bun.Archive does: the same files, byte for byte. */
async function expectAsBunReads(tar: Uint8Array<ArrayBuffer>): Promise<Map<string, Blob>> {
  const ours = readTar(tar, unlimited);
  if (!(ours instanceof Map)) {
    throw new Error(`readTar refused it: ${JSON.stringify(ours)}`);
  }
  const bun = await new Bun.Archive(tar).files();
  expect([...ours.keys()].sort()).toEqual([...bun.keys()].sort());
  for (const [path, blob] of bun) {
    const mine = ours.get(path);
    expect(Buffer.from((await mine?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      Buffer.from(await blob.arrayBuffer()),
    );
  }
  return ours;
}

describe("readTar", () => {
  test("reads git archive's tar as Bun.Archive does, pax global header and all", async () => {
    await withTempDir(async (dir) => {
      await writeTree(dir);
      const files = await expectAsBunReads(await gitArchive(dir));
      // git keeps a hard link as two files and leaves symbolic links out of what is read.
      expect([...files.keys()]).toContain("o-r-abc/top/ü日本.md");
      expect([...files.keys()]).toContain("o-r-abc/top/hard.bin");
      expect([...files.keys()].some((path) => path.endsWith(`${"n".repeat(130)}.md`))).toBe(true);
    });
  });

  test("reads an empty repository's archive as no files", async () => {
    await withTempDir(async (dir) => {
      expect((await expectAsBunReads(await gitArchive(dir, true))).size).toBe(0);
    });
  });

  for (const format of tarFormats()) {
    test(`reads tar's ${format} format as Bun.Archive does`, async () => {
      await withTempDir(async (dir) => {
        await writeTree(dir);
        const files = await expectAsBunReads(await tarArchive(dir, format));
        expect([...files.keys()]).toContain("top/ü日本.md");
        expect(files.get("top/big.bin")?.size).toBe(3000);
      });
    });
  }

  test("gives a pax size and a GNU long name to the file after them, not to each other", () => {
    const long = `t/${"a".repeat(120)}.md`;
    const size = paxRecords({ size: "3" });
    const tar = joinBytes(
      tarHeader({ name: "t/PaxHeaders/a", type: "x", size: size.length }),
      tarData(size),
      tarHeader({ name: "././@LongLink", type: "L", size: long.length + 1 }),
      tarData(`${long}\0`),
      tarHeader({ name: long.slice(0, 99), type: "0", size: 0 }),
      tarData("abc"),
      zeroBlocks(2),
    );
    const files = readTar(tar, unlimited);
    expect(files).toBeInstanceOf(Map);
    expect([...(files as Map<string, Blob>).keys()]).toEqual([long]);
    expect((files as Map<string, Blob>).get(long)?.size).toBe(3);
  });

  test("refuses a tar whose entries declare more than the limit", () => {
    const tar = tarOf([{ name: "t/a", type: "0", data: "a".repeat(600) }]);
    expect(readTar(tar, { ...unlimited, maxBytes: 512 })).toEqual({ kind: "too large" });
  });
});

describe("readTar names", () => {
  const pax = (records: Record<string, string>) => {
    const text = paxRecords(records);
    return joinBytes(
      tarHeader({ name: "t/PaxHeaders/a", type: "x", size: Buffer.byteLength(text) }),
      tarData(text),
    );
  };
  const longName = (name: string) =>
    joinBytes(
      tarHeader({ name: "././@LongLink", type: "L", size: Buffer.byteLength(name) + 1 }),
      tarData(`${name}\0`),
    );
  const named: Array<[string, Uint8Array<ArrayBuffer>]> = [
    ["a name that starts with a byte order mark", tarFile("\uFEFFt/a.md", "a")],
    [
      "a pax path that starts with a byte order mark",
      joinBytes(pax({ path: "\uFEFFt/p.md" }), tarFile("t/h.md", "a")),
    ],
    ["an empty GNU long name", joinBytes(longName(""), tarFile("t/h.md", "a"))],
    ["an empty pax path", joinBytes(pax({ path: "" }), tarFile("t/h.md", "a"))],
    [
      "a pax path, then a GNU long name",
      joinBytes(pax({ path: "t/x.md" }), longName("t/l.md"), tarFile("t/h.md", "a")),
    ],
    [
      "a GNU long name, then a pax path",
      joinBytes(longName("t/l.md"), pax({ path: "t/x.md" }), tarFile("t/h.md", "a")),
    ],
  ];
  for (const [what, entries] of named) {
    test(`names the files of ${what} as Bun.Archive does`, async () => {
      await expectAsBunReads(joinBytes(entries, zeroBlocks(2)));
    });
  }

  // macOS's tar writes a file's extended attributes as `._<name>`, just before the file.
  // `Bun.Archive` keeps those files; dek leaves out a last segment that starts with `._`.
  test("leaves out an AppleDouble file, and keeps a directory whose name starts with ._", () => {
    const tar = joinBytes(
      tarFile("t/slides/._intro.html", "attrs"),
      tarFile("t/slides/intro.html", "<section>"),
      tarFile("t/._d/kept.md", "kept"),
      tarFile("._top", "attrs"),
      zeroBlocks(2),
    );
    const ours = readTar(tar, unlimited);
    if (!(ours instanceof Map)) {
      throw new Error(`readTar refused it: ${JSON.stringify(ours)}`);
    }
    expect([...ours.keys()].sort()).toEqual(["t/._d/kept.md", "t/slides/intro.html"]);
  });

  test.skipIf(!Bun.which("xattr") || !tarFormats().includes("gnutar"))(
    "leaves out the AppleDouble file bsdtar writes for a file's extended attributes",
    async () => {
      await withTempDir(async (dir) => {
        await mkdir(join(dir, "t", "slides"), { recursive: true });
        await writeFile(join(dir, "t", "slides", "intro.html"), "<section>");
        run(["xattr", "-w", "com.example.dek", "note", "t/slides/intro.html"], dir);
        const out = join(dir, "x.tar");
        // Without COPYFILE_DISABLE, as `tar czf` on a Mac runs.
        const { COPYFILE_DISABLE: _, ...macEnv } = env;
        Bun.spawnSync(["tar", "-c", "-f", out, "--format=pax", "t"], { cwd: dir, env: macEnv });
        const tar = new Uint8Array(await readFile(out));
        expect(new TextDecoder().decode(tar)).toContain("t/slides/._intro.html");
        const ours = readTar(tar, unlimited);
        if (!(ours instanceof Map)) {
          throw new Error(`readTar refused it: ${JSON.stringify(ours)}`);
        }
        expect([...ours.keys()]).toEqual(["t/slides/intro.html"]);
      });
    },
  );
});
