import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, readdir, rename, symlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { parseCommandLine } from "../../src/cli/flags.ts";
import { initCommand } from "../../src/cli/init.ts";
import { lsCommand } from "../../src/cli/ls.ts";
import { bindCommandLine } from "../../src/cli/main.ts";
import { formatText } from "../../src/cli/result.ts";
import { requireProject, resolveScope, resolveTarget } from "../../src/cli/scope.ts";
import { shotCommand } from "../../src/cli/shot.ts";
import { showCommand } from "../../src/cli/show.ts";
import { themeCommand } from "../../src/cli/theme.ts";
import { jsonStdout, runDek, runMain } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { REF_SHA, type RefSpec, withTempProject } from "../helpers/project.ts";

const REF = "someone/talks/why-dek";
const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const refScript = `---
title: Why dek
cjk_per_minute: 60
---

## timing

${"あ".repeat(120)}
`;

const timingHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="card">timing</h2>
</section>`);

const ref: RefSpec = {
  name: REF,
  license: "MIT",
  deck: {
    script: refScript,
    slides: { timing: timingHtml },
    theme: ".slide { --fg: #111; color: var(--fg); }\n.slide .card { padding: 0; }\n",
  },
};

const project = { decks: [{ name: "mine" }], refs: [ref] };

function snapshotDir(root: string): string {
  return join(root, "refs", "someone", "talks", "why-dek");
}

/** Every file under `dir`, by its path there. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

describe("reading a ref", () => {
  test("dekc show takes a ref name as its deck and says where the slide came from", async () => {
    await withTempProject(project, async (root) => {
      const result = await runDek(["show", REF, "timing", "--json"], { cwd: root });
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<{
        slug: string;
        html: string;
        theme: string;
        ref: { name: string; rev: string; dir: string; license: string | null };
      }>(result);
      expect(json.slug).toBe("timing");
      expect(json.html).toContain('class="card"');
      expect(json.theme).toContain(".slide .card {");
      expect(json.ref).toEqual({
        name: REF,
        rev: REF_SHA,
        dir: snapshotDir(root),
        license: "LICENSE",
      });
    });
  });

  test("show also works from inside one of the project's own decks", async () => {
    await withTempProject(project, async (root) => {
      const result = showCommand(
        resolveTarget(join(root, "decks", "mine"), "deck", { refs: true, deck: REF }),
        "timing",
      );
      expect(result.ref?.name).toBe(REF);
    });
  });

  test("ls times the ref at its own speaking rate and says lint was skipped", async () => {
    await withTempProject(project, async (root) => {
      const result = lsCommand(resolveTarget(root, "decks", { refs: true, deck: REF }));
      if (result.kind !== "deck") {
        throw new Error("expected one deck");
      }
      expect(result.title).toBe("Why dek");
      expect(result.estimateSeconds).toBe(120);
      expect(result.skipped).toEqual([
        { check: "lint", reason: "a ref is read-only; its problems are not yours to fix" },
      ]);
      expect(result.ref?.name).toBe(REF);
      const text = formatText({ command: "ls", data: result });
      expect(text).toContain(`${REF}  Why dek`);
      expect(text).toContain(
        "lint: skipped (a ref is read-only; its problems are not yours to fix)",
      );
    });
  });

  test("theme returns the ref's theme.css", async () => {
    await withTempProject(project, async (root) => {
      const result = themeCommand(resolveTarget(root, "deck", { refs: true, deck: REF }));
      expect(result.path).toBe(join(snapshotDir(root), "decks", "why-dek", "theme.css"));
      expect(result.classes).toContain("card");
      expect(result.ref?.name).toBe(REF);
    });
  });

  test.serial("shot renders a ref's slide", async () => {
    await withTempProject(project, async (root) => {
      await chmod(fakePlaywright, 0o755);
      const result = await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, () =>
        shotCommand(resolveTarget(root, "deck", { refs: true, deck: REF }), { slug: "timing" }),
      );
      expect(result.shots[0]?.slug).toBe("timing");
    });
  });

  test.serial(
    "reading a ref, shots and sheets included, leaves its snapshot as dek wrote it",
    async () => {
      await withTempProject(project, async (root) => {
        await chmod(fakePlaywright, 0o755);
        const before = await filesUnder(snapshotDir(root));
        const target = () => resolveTarget(root, "deck", { refs: true, deck: REF });
        lsCommand(resolveTarget(root, "decks", { refs: true, deck: REF }));
        showCommand(target(), "timing");
        themeCommand(target());
        const { still, sheet } = await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => ({
          still: await shotCommand(target(), { slug: "timing" }),
          sheet: await shotCommand(target(), { sheet: true }),
        }));
        expect(await filesUnder(snapshotDir(root))).toEqual(before);
        // They are the reading project's cache, as its own decks' shots are.
        const cache = join(root, ".cache", "refs", "someone", "talks", "why-dek", "shots");
        for (const path of [...still.shots, ...sheet.shots].map((shot) => shot.path)) {
          expect(path.startsWith(`${cache}/`)).toBe(true);
          expect(existsSync(path)).toBe(true);
        }
        expect(sheet.sheets?.every((path) => path.startsWith(`${cache}/sheets/`))).toBe(true);
      });
    },
  );

  test("a ref that dek.toml does not pin points to dekc ref", async () => {
    await withTempProject(
      { decks: [{ name: "mine" }], refs: [{ ...ref, declared: false }] },
      async (root) => {
        expect(() =>
          showCommand(resolveTarget(root, "deck", { refs: true, deck: REF }), "timing"),
        ).toThrow(
          expect.objectContaining({
            message: `ref "${REF}" is not added`,
            hint: expect.stringContaining(`dekc ref ${REF}`),
          }),
        );
      },
    );
  });

  test("a rev on a read that is not the pinned one points to dekc ref with that rev", async () => {
    await withTempProject(project, async (root) => {
      expect(() =>
        showCommand(resolveTarget(root, "deck", { refs: true, deck: `${REF}@v2` }), "timing"),
      ).toThrow(expect.objectContaining({ hint: expect.stringContaining(`dekc ref ${REF}@v2`) }));
      expect(
        showCommand(
          resolveTarget(root, "deck", { refs: true, deck: `${REF}@${REF_SHA}` }),
          "timing",
        ).slug,
      ).toBe("timing");
    });
  });
});

describe("refs are read-only", () => {
  test("every command takes a ref name as its deck, so resolveScope refuses it", async () => {
    await withTempProject(project, async (root) => {
      const cases: Array<[string, string[]]> = [
        ["lint", [REF]],
        ["sync", [REF]],
        ["build", [REF]],
        ["check", [REF, "timing"]],
        ["mv", [REF, "timing", "clock"]],
        ["goto", [REF, "timing"]],
      ];
      for (const [command, args] of cases) {
        expect(bindCommandLine(root, parseCommandLine([command, ...args])).deck).toBe(REF);
      }
      expect(() => resolveScope(root, { deck: REF })).toThrow(
        expect.objectContaining({
          message: `"${REF}" is a ref; refs are read-only`,
          hint: expect.stringContaining(`dekc show ${REF} <slug>`),
        }),
      );
      expect(() => resolveScope(root, { deck: REF })).toThrow("read-only");
    });
  });

  test("a directory inside a ref is not a project to run commands in", async () => {
    await withTempProject(project, async (root) => {
      const inside = join(snapshotDir(root), "decks", "why-dek");
      expect(() => requireProject(inside)).toThrow(
        expect.objectContaining({
          message: "this directory is inside a ref; refs are read-only",
          hint: expect.stringContaining(`dekc show ${REF} <slug>`),
        }),
      );
    });
  });

  test("a folder under a dek.toml that a ref's assets carry is inside the ref too", async () => {
    await withTempProject(
      { ...project, refs: [{ ...ref, deck: { ...ref.deck, assets: { "inner/dek.toml": "" } } }] },
      async (root) => {
        const inner = join(snapshotDir(root), "decks", "why-dek", "assets", "inner");
        expect(() => requireProject(inner)).toThrow(
          expect.objectContaining({
            message: "this directory is inside a ref; refs are read-only",
            path: snapshotDir(root),
          }),
        );
      },
    );
  });

  test.serial(
    "the dev server and rehearse refuse a ref, and every directory inside one",
    async () => {
      await withTempProject(project, async (root) => {
        const inside = join(snapshotDir(root), "decks", "why-dek");
        const before = await filesUnder(snapshotDir(root));
        const cases: Array<[string[], string, string]> = [
          [[], inside, "this directory is inside a ref; refs are read-only"],
          [[REF], root, `"${REF}" is a ref; refs are read-only`],
          [["--deck", REF], root, `"${REF}" is a ref; refs are read-only`],
          [["rehearse"], inside, "this directory is inside a ref; refs are read-only"],
          [["rehearse", REF], root, `"${REF}" is a ref; refs are read-only`],
        ];
        for (const [argv, cwd, message] of cases) {
          const result = await runMain(argv, cwd);
          expect({ argv, exitCode: result.exitCode }).toEqual({ argv, exitCode: 1 });
          expect(result.stderr).toContain(message);
          expect(result.stderr).toContain(`dekc show ${REF} <slug>`);
        }
        expect(await filesUnder(snapshotDir(root))).toEqual(before);
      });
    },
  );

  test("init makes no project inside a ref", async () => {
    await withTempProject(project, async (root) => {
      const before = await filesUnder(snapshotDir(root));
      for (const dir of [undefined, "decks/why-dek/assets/talk"]) {
        expect(() => initCommand({ cwd: snapshotDir(root), dir })).toThrow(
          expect.objectContaining({
            message: "this directory is inside a ref; refs are read-only",
            hint: expect.stringContaining(`dekc show ${REF} <slug>`),
          }),
        );
      }
      expect(await filesUnder(snapshotDir(root))).toEqual(before);
    });
  });

  test.serial(
    "a ref reached through a link under refs/ is not read, and the link is named",
    async () => {
      await withTempProject(project, async (root) => {
        await rename(join(root, "refs", "someone"), join(root, "moved"));
        await symlink(join(root, "moved"), join(root, "refs", "someone"));
        const result = await runMain(["show", REF, "timing", "--json"], root);
        expect(jsonStdout(result)).toMatchObject({
          ok: false,
          error: {
            message: "refs/someone is a symlink; dek follows no link under refs/",
            hint: expect.stringContaining("remove refs/someone"),
          },
        });
      });
    },
  );

  test("the project's own decks leave refs out", async () => {
    await withTempProject(project, async (root) => {
      expect(requireProject(root).decks.map((deck) => deck.name)).toEqual(["mine"]);
    });
  });
});
