import { describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { DekError } from "../../src/core/error.ts";
import {
  deckOfPack,
  findDeckInRepo,
  installSnapshot,
  isRefName,
  parseRefSource,
  pickSnapshot,
  REF_MARKER,
  readPack,
  readRefMeta,
  readTarball,
  refDir,
  refState,
  snapshotDigest,
} from "../../src/core/ref.ts";
import type { GithubRefSource } from "../../src/core/ref-name.ts";
import { resolveProject } from "../../src/core/resolve.ts";
import { deckRepoFiles, SHA_A, SHA_B } from "../helpers/fake-github.ts";
import { withTempDir } from "../helpers/fs.ts";
import { REF_SHA, withTempProject } from "../helpers/project.ts";

function githubSource(input: string): GithubRefSource {
  const source = parseRefSource(input);
  if (source.kind !== "github") {
    throw new Error(`expected ${input} to name a ref on GitHub`);
  }
  return source;
}

function refError(input: string): DekError {
  try {
    parseRefSource(input);
  } catch (error) {
    if (error instanceof DekError) {
      return error;
    }
    throw error;
  }
  throw new Error(`expected ${input} to be rejected`);
}

describe("parseRefSource", () => {
  test("splits owner, repo, and deck", () => {
    expect(parseRefSource("hajimism/dek/why-dek")).toEqual({
      kind: "github",
      name: "hajimism/dek/why-dek",
      owner: "hajimism",
      repo: "dek",
      deck: "why-dek",
    });
  });

  test("takes a rev after @", () => {
    expect(parseRefSource("hajimism/dek/why-dek@v1.2")).toMatchObject({
      name: "hajimism/dek/why-dek",
      rev: "v1.2",
    });
  });

  test("rejects anything but owner/repo/deck, with an example in the hint", () => {
    for (const input of [
      "hajimism/dek",
      "why-dek",
      "a//b",
      "a/b/c/d",
      "a/../b",
      "a/b/c@",
      "a/b/.",
    ]) {
      const error = refError(input);
      expect(error.message).toContain(input);
      expect(error.hint).toContain("owner/repo/deck");
    }
  });
});

describe("parseRefSource with a pack's name", () => {
  test("file/<deck> names the deck of a pack", () => {
    expect(parseRefSource("file/2026-10-talk")).toEqual({
      kind: "file",
      name: "file/2026-10-talk",
      deck: "2026-10-talk",
    });
  });

  test("a pack's name takes no rev and no more segments", () => {
    for (const input of ["file/talk@v1", "file/", "file/..", "file/a b"]) {
      expect(refError(input).message).toContain(input);
    }
  });

  test("file is no GitHub owner, in any case", () => {
    for (const input of ["file/talks/why-dek", "File/talks/why-dek@v1"]) {
      const error = refError(input);
      expect(error.message).toContain(input);
      expect(error.hint).toContain("file/<deck>");
    }
    expect(() => parseRefSource("https://github.com/file/talks/tree/main/decks/why-dek")).toThrow(
      expect.objectContaining({ hint: expect.stringContaining("file/<deck>") }),
    );
  });
});

describe("parseRefSource with a GitHub link", () => {
  test("reads owner, repo, rev, and the deck's path from a folder or file link", () => {
    const expected = {
      kind: "github" as const,
      name: "hajimism/dek/why-dek",
      owner: "hajimism",
      repo: "dek",
      deck: "why-dek",
      rev: "main",
      path: "sample/decks/why-dek",
    };
    expect(
      parseRefSource("https://github.com/hajimism/dek/tree/main/sample/decks/why-dek"),
    ).toEqual(expected);
    expect(
      parseRefSource(
        "https://github.com/hajimism/dek/blob/main/sample/decks/why-dek/slides/a.html",
      ),
    ).toEqual(expected);
  });

  test("a link that names no deck says what link to pass", () => {
    for (const input of [
      "https://github.com/hajimism/dek",
      "https://github.com/hajimism/dek/tree/main/sample",
      "https://gitlab.com/hajimism/dek/tree/main/decks/why-dek",
    ]) {
      expect(() => parseRefSource(input)).toThrow(
        expect.objectContaining({
          hint: expect.stringContaining("/tree/main/sample/decks/why-dek"),
        }),
      );
    }
  });
});

describe("isRefName", () => {
  test("is true for owner/repo/deck and false for deck names and paths", () => {
    expect(isRefName("hajimism/dek/why-dek")).toBe(true);
    expect(isRefName("hajimism/dek/why-dek@v1")).toBe(true);
    expect(isRefName("why-dek")).toBe(false);
    expect(isRefName("./a/b")).toBe(false);
    expect(isRefName("/a/b/c")).toBe(false);
    expect(isRefName("a/b")).toBe(false);
    expect(isRefName("file/why-dek")).toBe(true);
    expect(isRefName("files/why-dek")).toBe(false);
    expect(isRefName("https://github.com/hajimism/dek/tree/main/sample/decks/why-dek")).toBe(true);
  });
});

describe("refDir", () => {
  test("places a ref under refs/owner/repo/deck", () => {
    expect(refDir("/p", "hajimism/dek/why-dek")).toBe(
      join("/p", "refs", "hajimism", "dek", "why-dek"),
    );
  });
});

describe("refDir for a pack", () => {
  test("places a pack's ref under refs/file/<deck>", () => {
    expect(refDir("/p", "file/why-dek")).toBe(join("/p", "refs", "file", "why-dek"));
  });
});

describe("readRefMeta", () => {
  test("is nothing for a snapshot whose marker is missing, corrupt, or incomplete", async () => {
    await withTempDir(async (dir) => {
      expect(readRefMeta(dir)).toBeUndefined();
      await writeFile(join(dir, REF_MARKER), "{ not json");
      expect(readRefMeta(dir)).toBeUndefined();
      await writeFile(join(dir, REF_MARKER), JSON.stringify({ name: "a/b/c" }));
      expect(readRefMeta(dir)).toBeUndefined();
      await writeFile(
        join(dir, REF_MARKER),
        JSON.stringify({ name: "a/b/c", rev: "x", path: "decks/c" }),
      );
      expect(readRefMeta(dir)).toEqual({ name: "a/b/c", rev: "x", path: "decks/c" });
    });
  });
});

describe("refState", () => {
  const name = "someone/talks/why-dek";

  test("a pinned ref whose snapshot is at the pin is fetched", async () => {
    await withTempProject({ refs: [{ name }] }, async (root) => {
      const state = refState(resolveProject(root), name);
      expect(state).toEqual({
        name,
        pinned: REF_SHA,
        dir: refDir(root, name),
        fetched: true,
      });
    });
  });

  test("a snapshot at another commit, or none, is not fetched", async () => {
    await withTempProject({ refs: [{ name, fetched: false }] }, async (root) => {
      expect(refState(resolveProject(root), name).fetched).toBe(false);
    });
    await withTempProject({ refs: [{ name, rev: "b".repeat(40) }] }, async (root) => {
      await writeFile(join(root, "dek.toml"), `[refs]\n"${name}" = "${REF_SHA}"\n`);
      expect(refState(resolveProject(root), name)).toMatchObject({
        pinned: REF_SHA,
        fetched: false,
      });
    });
  });

  test("a ref that is not pinned has no pin, whatever is on disk", async () => {
    await withTempProject({ refs: [{ name, declared: false }] }, async (root) => {
      const state = refState(resolveProject(root), name);
      expect(state.pinned).toBeUndefined();
      expect(state.fetched).toBe(false);
    });
  });
});

function repoFiles(entries: Record<string, string>): Map<string, Blob> {
  return new Map(Object.entries(entries).map(([path, body]) => [path, new Blob([body])]));
}

describe("readTarball", () => {
  test("drops the tarball's top directory and any path that could escape", async () => {
    const bytes = await new Bun.Archive(
      { "o-r-abc/decks/d/script.md": "s", "o-r-abc/../evil": "x", "o-r-abc/a//b": "y" },
      { compress: "gzip" },
    ).bytes();
    expect([...(await readTarball(bytes)).keys()]).toEqual(["decks/d/script.md"]);
  });
});

describe("readPack", () => {
  test("refuses a pack that inflates past the limit, before taking it apart", async () => {
    const bomb = Bun.gzipSync(new Uint8Array(1024 * 1024));
    await expect(readPack(bomb, { maxTarBytes: 64 * 1024 })).rejects.toMatchObject({
      message: expect.stringContaining("more than"),
      hint: expect.stringContaining("dekc pack"),
    });
  });

  test("refuses a file larger than a pack may be, and one that is not a gzipped tar", async () => {
    const bytes = await new Bun.Archive({ "t/dek.toml": "" }, { compress: "gzip" }).bytes();
    await expect(readPack(bytes, { maxBytes: 8 })).rejects.toMatchObject({
      message: expect.stringContaining("larger than"),
    });
    await expect(readPack(new TextEncoder().encode("PK\u0003\u0004 a zip"))).rejects.toMatchObject({
      message: expect.stringContaining("not a pack"),
      hint: expect.stringContaining("dekc pack"),
    });
  });

  test("drops the top folder and any path that could escape, as a tarball's", async () => {
    const bytes = await new Bun.Archive(
      { "t/decks/d/script.md": "s", "t/../evil": "x" },
      { compress: "gzip" },
    ).bytes();
    expect([...(await readPack(bytes)).keys()]).toEqual(["decks/d/script.md"]);
  });
});

describe("deckOfPack", () => {
  test("is the one deck the pack holds", () => {
    expect(deckOfPack(repoFiles(deckRepoFiles("talk")))).toBe("talk");
  });

  test("a pack of no deck, or of more than one, asks for a pack of one", () => {
    expect(() => deckOfPack(repoFiles({ "README.md": "" }))).toThrow(
      expect.objectContaining({
        message: "the pack holds no deck",
        hint: expect.stringContaining("dekc pack <deck>"),
      }),
    );
    expect(() => deckOfPack(repoFiles({ ...deckRepoFiles("a"), ...deckRepoFiles("b") }))).toThrow(
      expect.objectContaining({
        message: "the pack holds more than one deck: a, b",
        hint: expect.stringContaining("dekc pack <deck>"),
      }),
    );
  });
});

describe("snapshotDigest", () => {
  test("is the sha256 of each kept file's path, size, and bytes, in order of their paths", async () => {
    const files = repoFiles({
      "decks/d/script.md": "s",
      "dek.toml": "",
      "decks/d/dist/d.html": "built",
    });
    const snapshot = pickSnapshot(files, parseRefSource("file/d"));
    const expected = new Bun.CryptoHasher("sha256")
      .update("decks/d/script.md\u00001\u0000s")
      .update("dek.toml\u00000\u0000")
      .digest("hex");
    expect(await snapshotDigest(snapshot)).toBe(expected);
  });

  test("changes with any kept byte, and not with what the snapshot leaves out", async () => {
    const base = deckRepoFiles("d");
    const digest = async (entries: Record<string, string>) =>
      snapshotDigest(pickSnapshot(repoFiles(entries), parseRefSource("file/d")));
    const before = await digest(base);
    expect(await digest({ ...base, "decks/d/dist/d.html": "rebuilt" })).toBe(before);
    expect(await digest({ ...base, "decks/d/theme.css": ".slide {}" })).not.toBe(before);
  });
});

describe("findDeckInRepo", () => {
  test("finds a deck at the repository root or in a project in a subdirectory", () => {
    expect(findDeckInRepo(repoFiles(deckRepoFiles("why-dek")), parseRefSource("o/r/why-dek"))).toBe(
      "",
    );
    expect(
      findDeckInRepo(
        repoFiles(deckRepoFiles("why-dek", { prefix: "sample/" })),
        parseRefSource("o/r/why-dek"),
      ),
    ).toBe("sample/");
  });

  test("a deck that is not there lists the decks that are", () => {
    const files = repoFiles({ ...deckRepoFiles("a"), ...deckRepoFiles("b") });
    expect(() => findDeckInRepo(files, parseRefSource("o/r/c"))).toThrow(
      expect.objectContaining({ message: 'o/r has no deck "c"', hint: "decks in o/r: a, b" }),
    );
    expect(() => findDeckInRepo(repoFiles({ "README.md": "" }), parseRefSource("o/r/c"))).toThrow(
      expect.objectContaining({ hint: expect.stringContaining("no dek project") }),
    );
  });

  test("a script.md without its project's dek.toml is not a deck", () => {
    expect(() =>
      findDeckInRepo(repoFiles({ "decks/c/script.md": "" }), parseRefSource("o/r/c")),
    ).toThrow('o/r has no deck "c"');
  });

  test("two decks with the name ask for the path", () => {
    const files = repoFiles({ ...deckRepoFiles("d"), ...deckRepoFiles("d", { prefix: "x/" }) });
    expect(() => findDeckInRepo(files, parseRefSource("o/r/d"))).toThrow(
      expect.objectContaining({ hint: expect.stringContaining("decks/d, x/decks/d") }),
    );
    expect(findDeckInRepo(files, { ...githubSource("o/r/d"), path: "x/decks/d" })).toBe("x/");
  });
});

describe("installSnapshot", () => {
  const source = parseRefSource("o/r/why-dek");

  test("keeps what reading needs, in the source project's layout", async () => {
    await withTempDir(async (root) => {
      const files = repoFiles({
        ...deckRepoFiles("why-dek", { prefix: "sample/" }),
        LICENSE: "MIT",
        "sample/decks/other/script.md": "",
      });
      const result = await installSnapshot(root, source, SHA_A, files);
      const dir = refDir(root, "o/r/why-dek");
      expect(result).toEqual({ dir, license: "LICENSE", path: "sample/decks/why-dek" });
      expect(await listFiles(dir)).toEqual([
        ".ref.json",
        "LICENSE",
        "decks/why-dek/assets/chart.png",
        "decks/why-dek/script.md",
        "decks/why-dek/slides/intro.html",
        "decks/why-dek/theme.css",
        "dek.toml",
      ]);
      expect(readRefMeta(dir)).toEqual({
        name: "o/r/why-dek",
        rev: SHA_A,
        path: "sample/decks/why-dek",
      });
    });
  });

  test("replaces an existing snapshot whole and leaves no temporary directory", async () => {
    await withTempDir(async (root) => {
      await installSnapshot(
        root,
        source,
        SHA_A,
        repoFiles(deckRepoFiles("why-dek", { extra: { "decks/why-dek/slides/old.html": "" } })),
      );
      await installSnapshot(root, source, SHA_B, repoFiles(deckRepoFiles("why-dek")));
      const dir = refDir(root, "o/r/why-dek");
      expect(readRefMeta(dir)?.rev).toBe(SHA_B);
      expect(await listFiles(dir)).not.toContain("decks/why-dek/slides/old.html");
      expect(await readdir(join(root, "refs"))).toEqual(["o"]);
    });
  });

  test("replacing a snapshot leaves exactly one copy and no swap directories", async () => {
    await withTempDir(async (root) => {
      await installSnapshot(root, source, SHA_A, repoFiles(deckRepoFiles("why-dek")));
      await installSnapshot(root, source, SHA_B, repoFiles(deckRepoFiles("why-dek")));
      const dir = refDir(root, "o/r/why-dek");
      expect(readRefMeta(dir)?.rev).toBe(SHA_B);
      expect(await readdir(join(root, "refs"))).toEqual(["o"]);
      expect(await readdir(join(root, "refs", "o", "r"))).toEqual(["why-dek"]);
      expect((await listFiles(dir)).filter((path) => path.endsWith(REF_MARKER))).toEqual([
        REF_MARKER,
      ]);
    });
  });

  test("never swaps out a file that a linked folder under refs/ points at", async () => {
    await withTempDir(async (home) => {
      await withTempDir(async (root) => {
        await mkdir(join(home, ".ssh"));
        await writeFile(join(home, ".ssh", "why-dek"), "ssh-ed25519 AAAA mine");
        await mkdir(join(root, "refs", "o"), { recursive: true });
        await symlink(join(home, ".ssh"), join(root, "refs", "o", "r"));
        await expect(
          installSnapshot(root, source, SHA_A, repoFiles(deckRepoFiles("why-dek"))),
        ).rejects.toThrow("leads outside the project");
        expect(await readFile(join(home, ".ssh", "why-dek"), "utf8")).toBe("ssh-ed25519 AAAA mine");
      });
    });
  });

  test("replaces a snapshot that is a link with a real one, leaving what it pointed at", async () => {
    await withTempDir(async (root) => {
      await mkdir(join(root, "elsewhere"));
      await writeFile(join(root, "elsewhere", "keep.txt"), "mine");
      await mkdir(join(root, "refs", "o", "r"), { recursive: true });
      await symlink(join(root, "elsewhere"), join(root, "refs", "o", "r", "why-dek"));
      await installSnapshot(root, source, SHA_A, repoFiles(deckRepoFiles("why-dek")));
      expect(readRefMeta(refDir(root, "o/r/why-dek"))?.rev).toBe(SHA_A);
      expect(await readFile(join(root, "elsewhere", "keep.txt"), "utf8")).toBe("mine");
    });
  });

  test("a failed install leaves the previous snapshot in place", async () => {
    await withTempDir(async (root) => {
      await installSnapshot(root, source, SHA_A, repoFiles(deckRepoFiles("why-dek")));
      await expect(installSnapshot(root, source, SHA_B, repoFiles({}))).rejects.toThrow();
      expect(readRefMeta(refDir(root, "o/r/why-dek"))?.rev).toBe(SHA_A);
      expect(await readdir(join(root, "refs"))).toEqual(["o"]);
    });
  });
});

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}
