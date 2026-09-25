import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { lsCommand } from "../../src/cli/ls.ts";
import { formatText } from "../../src/cli/result.ts";
import { peelDeckArg, requireProject, resolveScope } from "../../src/cli/scope.ts";
import { shotCommand } from "../../src/cli/shot.ts";
import { showCommand } from "../../src/cli/show.ts";
import { themeCommand } from "../../src/cli/theme.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { REF_SHA, type RefSpec, withTempProject } from "../helpers/project.ts";

const REF = "someone/talks/why-dek";
const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const refScript = `---
title: Why dek
---

## timing

${"あ".repeat(120)}
`;

const timingHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="card">timing</h2>
</section>`);

const ref: RefSpec = {
  name: REF,
  toml: "cjk_per_minute = 60\n",
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

describe("reading a ref", () => {
  test("dek show takes a ref name as its deck and says where the slide came from", async () => {
    await withTempProject(project, async (root) => {
      const result = await runDek(["show", REF, "timing", "--json"], { cwd: root });
      expect(result.exitCode).toBe(0);
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
      const result = showCommand({ cwd: join(root, "decks", "mine"), slug: "timing", deck: REF });
      expect(result.ref?.name).toBe(REF);
    });
  });

  test("ls times the ref at its own speaking rate and says lint was skipped", async () => {
    await withTempProject(project, async (root) => {
      const result = lsCommand({ cwd: root, deck: REF });
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
      const result = themeCommand({ cwd: root, deck: REF });
      expect(result.path).toBe(join(snapshotDir(root), "decks", "why-dek", "theme.css"));
      expect(result.classes).toContain("card");
      expect(result.ref?.name).toBe(REF);
    });
  });

  test.serial("shot renders a ref's slide", async () => {
    await withTempProject(project, async (root) => {
      await chmod(fakePlaywright, 0o755);
      const result = await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, () =>
        shotCommand({ cwd: root, slug: "timing", deck: REF }),
      );
      expect(result.shots[0]?.slug).toBe("timing");
    });
  });

  test("a ref that dek.toml does not pin points to dek ref", async () => {
    await withTempProject(
      { decks: [{ name: "mine" }], refs: [{ ...ref, declared: false }] },
      async (root) => {
        expect(() => showCommand({ cwd: root, slug: "timing", deck: REF })).toThrow(
          expect.objectContaining({
            message: `ref "${REF}" is not added`,
            hint: expect.stringContaining(`dek ref ${REF}`),
          }),
        );
      },
    );
  });

  test("a rev on a read that is not the pinned one points to dek ref with that rev", async () => {
    await withTempProject(project, async (root) => {
      expect(() => showCommand({ cwd: root, slug: "timing", deck: `${REF}@v2` })).toThrow(
        expect.objectContaining({ hint: expect.stringContaining(`dek ref ${REF}@v2`) }),
      );
      expect(showCommand({ cwd: root, slug: "timing", deck: `${REF}@${REF_SHA}` }).slug).toBe(
        "timing",
      );
    });
  });
});

describe("refs are read-only", () => {
  test("every command peels a ref name as its deck, so resolveScope refuses it", async () => {
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
        expect(peelDeckArg(root, { command, args }).deck).toBe(REF);
      }
      expect(() => resolveScope(root, { positionalDeck: REF })).toThrow(
        expect.objectContaining({
          message: `"${REF}" is a ref; refs are read-only`,
          hint: expect.stringContaining(`dek show ${REF} <slug>`),
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
          hint: expect.stringContaining(`dek show ${REF} <slug>`),
        }),
      );
    });
  });

  test("the project's own decks leave refs out", async () => {
    await withTempProject(project, async (root) => {
      expect(requireProject(root).decks.map((deck) => deck.name)).toEqual(["mine"]);
    });
  });
});
