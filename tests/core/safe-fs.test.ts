import { describe, expect, test } from "bun:test";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import {
  followInside,
  outputPath,
  readSourceIfExists,
  removeInside,
  writeInside,
} from "../../src/core/safe-fs.ts";
import { withTempDir } from "../helpers/fs.ts";

/** A project at `<dir>/proj` and a file outside it that no link may reach. */
async function withProject(fn: (root: string, outside: string) => Promise<void>): Promise<void> {
  await withTempDir(async (dir) => {
    const root = join(dir, "proj");
    await mkdir(join(root, "decks", "talk", "slides"), { recursive: true });
    const outside = join(dir, "secret.css");
    await writeFile(outside, "SECRET");
    await fn(root, outside);
  });
}

describe("followInside", () => {
  test("takes a path with no link in it as written, hidden folders included", async () => {
    await withProject(async (root) => {
      const path = join(root, ".dek", "schema.json");
      expect(followInside(path, root)).toBe(path);
    });
  });

  test("follows a link to a file of the same kind elsewhere in the project", async () => {
    await withProject(async (root) => {
      await writeFile(join(root, "theme.css"), "shared");
      const link = join(root, "decks", "talk", "theme.css");
      await symlink("../../theme.css", link);
      expect(followInside(link, root)).toBe(join(root, "theme.css"));
    });
  });

  test("refuses a link out of the project", async () => {
    await withProject(async (root, outside) => {
      const link = join(root, "decks", "talk", "theme.css");
      await symlink(outside, link);
      expect(followInside(link, root)).toBeUndefined();
    });
  });

  test("refuses a link into a hidden file or folder, where .env and .git live", async () => {
    await withProject(async (root) => {
      await mkdir(join(root, ".git"));
      await writeFile(join(root, ".git", "config.css"), "token");
      await writeFile(join(root, ".env.css"), "token");
      const deck = join(root, "decks", "talk");
      await symlink("../../.git/config.css", join(deck, "a.css"));
      await symlink("../../.env.css", join(deck, "b.css"));
      expect(followInside(join(deck, "a.css"), root)).toBeUndefined();
      expect(followInside(join(deck, "b.css"), root)).toBeUndefined();
    });
  });

  test("refuses a link that changes what kind of file it names", async () => {
    await withProject(async (root) => {
      await writeFile(join(root, "notes.txt"), "private");
      const link = join(root, "decks", "talk", "theme.css");
      await symlink("../../notes.txt", link);
      expect(followInside(link, root)).toBeUndefined();
    });
  });

  test("judges a linked folder by where the file really is", async () => {
    await withProject(async (root, outside) => {
      const deck = join(root, "decks", "talk");
      await symlink(join(outside, ".."), join(deck, "dist"));
      expect(followInside(join(deck, "dist", "talk.html"), root)).toBeUndefined();
    });
  });

  test("refuses a path outside the root as written", async () => {
    await withProject(async (root, outside) => {
      expect(followInside(outside, root)).toBeUndefined();
    });
  });
});

describe("readSourceIfExists", () => {
  test("reads a file in the project, and nothing for a missing one", async () => {
    await withProject(async (root) => {
      const path = join(root, "decks", "talk", "theme.css");
      expect(readSourceIfExists(path, root)).toBeUndefined();
      await writeFile(path, "body{}");
      expect(readSourceIfExists(path, root)).toBe("body{}");
    });
  });

  test("names the file and the rule when a link leads out", async () => {
    await withProject(async (root, outside) => {
      const link = join(root, "decks", "talk", "theme.css");
      await symlink(outside, link);
      expect(() => readSourceIfExists(link, root)).toThrow(DekError);
      try {
        readSourceIfExists(link, root);
      } catch (error) {
        expect((error as DekError).path).toBe(link);
        expect((error as DekError).message).toContain("leads outside");
        expect((error as DekError).hint).toContain("copy");
      }
    });
  });
});

describe("writeInside", () => {
  test("creates the folders and the file", async () => {
    await withProject(async (root) => {
      const path = join(root, ".dek", "server.json");
      writeInside(path, "{}", root, { mode: 0o600 });
      expect(await readFile(path, "utf8")).toBe("{}");
      expect(statSync(path).mode & 0o777).toBe(0o600);
    });
  });

  test("refuses to write through a link out of the project, leaving its target alone", async () => {
    await withProject(async (root, outside) => {
      await mkdir(join(root, ".dek"));
      const link = join(root, ".dek", "schema.css");
      await symlink(outside, link);
      expect(() => writeInside(link, "{}", root)).toThrow(DekError);
      expect(readFileSync(outside, "utf8")).toBe("SECRET");
    });
  });

  test("writes through a link that stays in the project, as CLAUDE.md -> AGENTS.md", async () => {
    await withProject(async (root) => {
      await writeFile(join(root, "AGENTS.md"), "old");
      await symlink("AGENTS.md", join(root, "CLAUDE.md"));
      writeInside(join(root, "CLAUDE.md"), "new", root);
      expect(lstatSync(join(root, "CLAUDE.md")).isSymbolicLink()).toBe(true);
      expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("new");
    });
  });

  test("replaces a dangling link instead of creating wherever it points", async () => {
    await withProject(async (root, outside) => {
      const target = join(outside, "..", "created.html");
      const link = join(root, "decks", "talk", "talk.html");
      await symlink(target, link);
      writeInside(link, "<html>", root);
      expect(lstatSync(link).isFile()).toBe(true);
      expect(() => statSync(target)).toThrow();
    });
  });
});

describe("outputPath", () => {
  test("gives a path a browser or ffmpeg can write to without following a link", async () => {
    await withProject(async (root, outside) => {
      const link = join(root, "decks", "talk", "talk.pdf");
      await symlink(join(outside, "..", "gone.pdf"), link);
      const path = outputPath(link, root);
      expect(path).toBe(link);
      expect(() => lstatSync(link)).toThrow();
    });
  });
});

describe("removeInside", () => {
  test("removes a file in the project", async () => {
    await withProject(async (root) => {
      const path = join(root, "decks", "talk", "x.png");
      await writeFile(path, "x");
      removeInside(path, root);
      expect(() => statSync(path)).toThrow();
    });
  });

  test("never reaches through a linked folder to delete outside the project", async () => {
    await withProject(async (root, outside) => {
      await symlink(join(outside, ".."), join(root, "refs"));
      expect(() => removeInside(join(root, "refs", "secret.css"), root)).toThrow(DekError);
      expect(readFileSync(outside, "utf8")).toBe("SECRET");
    });
  });

  test("removes a link itself, never what it points at", async () => {
    await withProject(async (root, outside) => {
      const link = join(root, "decks", "talk", "x.css");
      await symlink(outside, link);
      removeInside(link, root, { recursive: true });
      expect(() => lstatSync(link)).toThrow();
      expect(readFileSync(outside, "utf8")).toBe("SECRET");
    });
  });
});
